import SteamUser from "steam-user";
import { readProfile, saveProfile, clearProfile, safeAvatar, safeVanity } from './profile-cache.js';
import { gameBatch, batchCount } from "./all-games.js";
import QRCode from "qrcode";
import { resolveProfile } from "./profiles.js";
import { readAchievements } from "./achievements.js";
import { readCardQueue, type CardGame } from "./cards.js";
import { EventEmitter } from "events";
import { join } from "path";
import type { AccountConfig, AppConfig } from "./config.js";
import {
  authenticate,
  clearSavedToken,
  QRLoginTimeoutError,
  readSavedToken,
  persistToken,
} from "./auth.js";
import { log as rootLog } from "./logger.js";

export type AccountStatus =
  | "offline"
  | "connecting"
  | "online"
  | "farming"
  | "paused"
  | "reconnecting"
  | "rate_limited"
  | "skipped"
  | "error";

export interface AccountState {
  name: string;
  label: string;
  enabled: boolean;
  priorityGames: number[];
  rotationMinutes: number;
  qrCode: string | null;
  qrExpiresAt: number | null;
  libraryRefreshing: boolean;
  libraryCheckedAt: number | null;
  libraryError: string | null;
  steamAccountName: string | null;
  status: AccountStatus;
  steamId: string | null;
  gamesPlaying: (number | string)[];
  isPaused: boolean;
  lastError: string | null;
  connectedSince: Date | null;
  mode: "hours" | "cards";
  manualPaused: boolean;
  library: { appid: number; name: string; playtimeMinutes: number }[];
  cardStatus: "waiting" | "checking" | "ready" | "error";
  cardQueue: CardGame[];
  cardCheckedAt: number | null;
  cardError: string | null;
  batchIndex: number;
  batchCount: number;
  nextBatchAt: number | null;
  lastReportedAt: number | null;
  queue: number[][];
  nextGames: number[];
  manualGames: number[];
  achievements: Record<number,{unlocked:number;total:number;checkedAt:number}>;
  samBusy: boolean;
  avatarUrl: string | null;
  displayName: string | null;
  vanityUrl: string | null;
}

export type ClaimConflictCheck = (
  steamId: string | null,
  steamAccountName: string | null,
) => string | null;

export class SteamAccount extends EventEmitter {
  private client: SteamUser;
  private log: ReturnType<typeof rootLog.child>;
  private state: AccountState;
  private settings: AppConfig["settings"];
  private config: AccountConfig;
  private claimCheck?: ClaimConflictCheck;

  private lastLogOnTime = 0;
  private isAuthenticating = false;
  private wasSkipped = false;
  private rateLimitedUntil = 0;
  private backoffMs = 5_000;
  private logOnTimer: ReturnType<typeof setInterval> | null = null;
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private allGames: number[] = [];
  private batchIndex = 0;
  private batchStartedAt = 0;
  private steamBlocked = false;
  private webCookies: string[] = [];
  private scanningCards = false;
  private lastCardAttempt = 0;
  private stopped = false;
  private started = false;
  private authAbort: AbortController | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private sessionGeneration = 0;
  private achievementsPending = new Map<number,Promise<unknown>>();

  private static readonly MAX_BACKOFF_MS = 600_000;

  constructor(
    config: AccountConfig,
    settings: AppConfig["settings"],
    claimCheck?: ClaimConflictCheck,
  ) {
    super();
    this.config = config;
    this.settings = settings;
    this.claimCheck = claimCheck;
    this.log = rootLog.child({ account: config.name });

    const tokenPath = join(settings.dataDirectory, "tokens", `${config.name}.txt`);
    const saved = readSavedToken(tokenPath);

    this.client = new SteamUser({
      machineIdType: SteamUser.EMachineIDType.PersistentRandom,
      dataDirectory: `${settings.dataDirectory}/steam/${config.name}`,
      renewRefreshTokens: true,
      autoRelogin: true,
    });

    this.state = {
      name: config.name,
      label: config.label ?? config.name,
      enabled: config.enabled,
      priorityGames: [...config.priorityGames],
      rotationMinutes: config.rotationMinutes,
      qrCode: null,
      qrExpiresAt: null,
      libraryRefreshing: false,
      libraryCheckedAt: null,
      libraryError: null,
      steamAccountName: saved?.accountName ?? null,
      status: "offline",
      steamId: null,
      gamesPlaying: config.games.includes("ALL") ? [] : [...config.games],
      isPaused: false,
      lastError: null,
      connectedSince: null,
      mode: config.farmingMode,
      manualPaused: false,
      library: [],
      cardStatus: "waiting",
      cardQueue: [],
      cardCheckedAt: null,
      cardError: null,
      batchIndex: 0,
      batchCount: 0,
      nextBatchAt: null,
      lastReportedAt: null,
      queue: [], nextGames: [], manualGames: config.manualGames.map(game=>game.appid), achievements: {}, samBusy:false,avatarUrl:null,displayName:null,vanityUrl:null,
    };

    Object.assign(this.state,readProfile(settings.dataDirectory,config.name));
    this.client.on('vanityURL',(value:string)=>{this.state.vanityUrl=safeVanity(value);this.cacheProfile();});
    this.bindEvents();
  }

  getState(): Readonly<AccountState> {
    return this.state;
  }

  setPreferences(preferences: { priorityGames: number[]; rotationMinutes: number; label: string }): void {
    const priorities = [...new Set(preferences.priorityGames)];
    if (priorities.some(id => !this.state.library.some(game => game.appid === id))) throw new Error("PRIORITY_NOT_OWNED");
    Object.assign(this.config, { ...preferences, priorityGames: priorities });
    this.state.priorityGames = priorities;
    this.state.rotationMinutes = preferences.rotationMinutes;
    this.state.label = preferences.label;
    this.batchIndex = 0;
    this.batchStartedAt = Date.now();
    this.refreshGames();
  }

  async refreshLibrary(): Promise<void> {
    if (!this.state.steamId || this.stopped) throw new Error("ACCOUNT_OFFLINE");
    if (this.state.libraryRefreshing) return;
    const generation=this.sessionGeneration;
    this.state.libraryRefreshing = true;
    this.state.libraryError = null;
    try {
      const library = await this.client.getUserOwnedApps(this.state.steamId, { includePlayedFreeGames: true, includeFreeSub: true, skipUnvettedApps: false } as SteamUser.GetUserOwnedAppsOptions);
      if (this.stopped || generation!==this.sessionGeneration) return;
      const configured = this.config.games.filter((game): game is number => typeof game === "number");
      this.allGames = [...new Set([...configured, ...library.apps.map(app => app.appid).sort((a, b) => a - b),...this.config.manualGames.map(game=>game.appid)])].filter(id => id > 0);
      const names: Record<number, string> = { 730: "Counter-Strike 2", 271590: "Grand Theft Auto V Legacy", 1174180: "Red Dead Redemption 2", 218: "Source SDK Base 2007" };
      this.state.library = this.allGames.map(appid => {
        const game = library.apps.find(app => app.appid === appid);
        return { appid, name: names[appid] ?? game?.name ?? this.config.manualGames.find(game=>game.appid===appid)?.name ?? `App ${appid}`, playtimeMinutes: game?.playtime_forever ?? 0 };
      });
      this.state.priorityGames = this.config.priorityGames.filter(id => this.allGames.includes(id));
      this.state.libraryCheckedAt = Date.now();
      this.batchIndex = 0;
      this.batchStartedAt = Date.now();
      this.refreshGames();
      this.log.info({ totalGames: this.allGames.length }, "Library refreshed");
    } catch (err) {
      this.state.libraryError = "LIBRARY_UNAVAILABLE";
      throw err;
    } finally { this.state.libraryRefreshing = false; }
  }

  async addGame(appid:number):Promise<void> {
    if(!this.state.connectedSince||this.stopped)throw new Error('ACCOUNT_OFFLINE');
    if(this.allGames.includes(appid))throw new Error('GAME_EXISTS');
    if(this.config.manualGames.length>=500)throw new Error('GAME_LIMIT');
    const generation=this.sessionGeneration;
    let info;
    try{info=await this.client.getProductInfo([appid],[],true);}catch{throw new Error('GAME_NOT_FOUND');}
    if(this.stopped||generation!==this.sessionGeneration)throw new Error('ACCOUNT_OFFLINE');
    const name=(info.apps[appid]?.appinfo as any)?.common?.name;
    if(typeof name!=='string'||!name.trim())throw new Error('GAME_NOT_FOUND');
    if(this.allGames.includes(appid))throw new Error('GAME_EXISTS');
    const game={appid,name:name.slice(0,200)};
    this.config.manualGames.push(game);this.state.manualGames.push(appid);this.allGames.push(appid);
    this.state.library.push({...game,playtimeMinutes:0});this.refreshGames();
  }

  async achievementsFor(appid:number) {
    if(!this.state.steamId||this.stopped||!this.state.library.some(game=>game.appid===appid))throw new Error('ACCOUNT_OFFLINE');
    const cached=this.state.achievements[appid];
    if(cached&&Date.now()-cached.checkedAt<10*60_000)return cached;
    const existing=this.achievementsPending.get(appid);if(existing)return existing;
    if(this.achievementsPending.size>=2)throw new Error('REQUEST_BUSY');
    const generation=this.sessionGeneration;
    const task=readAchievements(this.state.steamId,appid,this.webCookies).then(value=>{
      if(!this.stopped&&generation===this.sessionGeneration)this.state.achievements[appid]=value;
      return value;
    }).finally(()=>this.achievementsPending.delete(appid));
    this.achievementsPending.set(appid,task);return task;
  }

  async desktopAchievements<T extends {unlocked:number;total:number}>(appid:number,operation:(steamId:string)=>Promise<T>):Promise<T>{
    if(!this.state.steamId||!this.state.connectedSince||this.stopped)throw new Error('ACCOUNT_OFFLINE');
    if(!this.state.library.some(game=>game.appid===appid))throw new Error('SAM_NOT_OWNED');
    if(this.state.samBusy)throw new Error('REQUEST_BUSY');
    if(this.steamBlocked)throw new Error('SAM_GAME_RUNNING');
    const generation=this.sessionGeneration,steamId=this.state.steamId;
    this.state.samBusy=true;
    this.client.gamesPlayed([]);
    try{
      const result=await operation(steamId);
      if(!this.stopped&&generation===this.sessionGeneration)this.state.achievements[appid]={unlocked:result.unlocked,total:result.total,checkedAt:Date.now()};
      return result;
    }finally{
      this.state.samBusy=false;this.state.lastReportedAt=null;this.refreshGames();
    }
  }

  async logout():Promise<void> {
    await this.stop();
    clearSavedToken(this.config.name,this.settings.dataDirectory);
    this.config.password=undefined;this.config.sharedSecret=undefined;this.config.accountName=undefined;this.config.loginMethod='qr';
    this.state.steamId=null;this.state.steamAccountName=null;this.state.gamesPlaying=[];
    this.state.cardQueue=[];this.state.cardCheckedAt=null;this.state.cardStatus='waiting';this.state.cardError=null;
    this.state.achievements={};this.state.lastError=null;this.state.lastReportedAt=null;
    this.state.queue=[];this.state.nextGames=[];this.state.nextBatchAt=null;
    this.state.batchCount=0;this.state.batchIndex=0;
    this.state.avatarUrl=null;this.state.displayName=null;this.state.vanityUrl=null;
    clearProfile(this.settings.dataDirectory,this.config.name);
  }

  async lookupProfile(profile: string) {
    if (!this.state.connectedSince || this.stopped) throw new Error("ACCOUNT_OFFLINE");
    const steamId = await resolveProfile(profile);
    let library;
    try { library = await this.client.getUserOwnedApps(steamId, { includePlayedFreeGames: true, includeFreeSub: true, skipUnvettedApps: false } as SteamUser.GetUserOwnedAppsOptions); }
    catch { throw new Error("PROFILE_PRIVATE"); }
    if (!library.apps?.length) throw new Error("PROFILE_PRIVATE");
    return { steamId, games: library.apps.map(game => ({ appid: game.appid, name: game.name || `App ${game.appid}`, playtimeMinutes: game.playtime_forever ?? 0, owned: this.allGames.includes(game.appid) })) };
  }

  setMode(mode: "hours" | "cards"): void {
    this.state.mode = mode;
    this.config.farmingMode = mode;
    if (mode === "cards") void this.checkCards();
    this.refreshGames();
  }

  pause(): void {
    this.state.manualPaused = true;
    this.state.isPaused = true;
    if (this.state.connectedSince && ["farming", "paused", "online"].includes(this.state.status)) {
      this.client.gamesPlayed([]);
      this.updateState({ status: "paused" });
    }
  }

  resume(): void {
    this.state.manualPaused = false;
    this.state.isPaused = this.steamBlocked;
    if (this.state.status === "paused" && !this.steamBlocked) {
      this.updateState({ status: "farming" });
      this.refreshGames();
    }
  }

  nextBatch(): void {
    if (this.state.mode !== "hours") throw new Error("Grup değiştirmek için saat modunu seç.");
    this.batchIndex++;
    this.batchStartedAt = Date.now();
    this.refreshGames();
  }

  async checkCards(): Promise<void> {
    if (this.scanningCards || !this.state.steamId || !this.webCookies.length) return;
    this.scanningCards = true;
    this.lastCardAttempt = Date.now();
    this.state.cardStatus = "checking";
    const generation=this.sessionGeneration;
    try {
      const queue=await readCardQueue(this.state.steamId, this.webCookies);
      if(this.stopped||generation!==this.sessionGeneration)return;
      this.state.cardQueue = queue;
      this.state.cardStatus = "ready";
      this.state.cardCheckedAt = Date.now();
      this.state.cardError = null;
      this.log.info({ games: this.state.cardQueue.length, remaining: this.state.cardQueue.reduce((n, game) => n + game.remaining, 0) }, "Card drop queue refreshed");
      this.refreshGames();
    } catch (err) {
      if(this.stopped||generation!==this.sessionGeneration)return;
      this.state.cardStatus = "error";
      this.state.cardError = err instanceof Error ? err.message : String(err);
      this.log.warn("Card badge scan failed; see local dashboard for status");
    } finally {
      this.scanningCards = false;
    }
  }

  async start(): Promise<void> {
    if (this.started) return;
    if(this.isAuthenticating)throw new Error('REQUEST_BUSY');
    this.started = true;
    this.stopped = false;
    this.sessionGeneration++;
    this.wasSkipped = false;
    this.lastLogOnTime = 0;
    this.state.enabled = true;
    this.state.lastReportedAt=null;
    this.lastSentGames=[];
    await this.logOn();
    if (this.wasSkipped || this.stopped) { this.started = false; return; }
    this.logOnTimer = setInterval(() => this.logOn(), this.settings.logOnIntervalMs);
    this.refreshTimer = setInterval(() => this.refreshGames(), this.settings.refreshGamesIntervalMs);
  }

  async stop(): Promise<void> {
    this.sessionGeneration++;
    this.stopped = true;
    this.started = false;
    this.state.enabled = false;
    this.authAbort?.abort();
    this.state.qrCode = null;
    this.state.qrExpiresAt = null;
    this.state.lastReportedAt=null;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer=null;
    if (this.logOnTimer) clearInterval(this.logOnTimer);
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    this.logOnTimer = null;
    this.refreshTimer = null;
    this.webCookies = [];
    this.state.isPaused=false;this.state.manualPaused=false;this.steamBlocked=false;
    if (this.state.status === "offline" || this.state.status === "skipped") { this.updateState({ status: "offline", connectedSince: null }); return; }

    this.client.gamesPlayed([]);
    this.client.logOff();
    this.updateState({ status: "offline", connectedSince: null });
    this.log.info("Logged off");
  }

  private async logOn(): Promise<void> {
    if (this.stopped) return;
    if (this.wasSkipped || this.isAuthenticating) return;
    if (this.state.status === "farming") return;
    if (this.state.status === "paused") return;
    if (Date.now() - this.lastLogOnTime < this.settings.minRequestGapMs) return;
    if (Date.now() < this.rateLimitedUntil) return;

    // Check if saved account is already running on another config profile
    if (this.state.steamAccountName && this.claimCheck) {
      const conflict = this.claimCheck(this.state.steamId, this.state.steamAccountName);
      if (conflict) {
        this.wasSkipped = true;
        this.log.warn(
          `Steam account "${this.state.steamAccountName}" is already active under [${conflict}]. Skipping this profile to prevent kick loop.`,
        );
        this.updateState({ status: "skipped", lastError: `Duplicate session of [${conflict}]` });
        return;
      }
    }

    this.updateState({ status: "connecting" });
    this.lastLogOnTime = Date.now();
    this.isAuthenticating = true;
    this.log.info("Connecting to Steam...");

    try {
      this.authAbort = new AbortController();
      const { refreshToken, accountName } = await authenticate(
        this.config,
        this.settings.dataDirectory,
        this.settings.qrLoginTimeoutMs,
        {
          signal: this.authAbort.signal,
          onQR: async url => {
            const image = await QRCode.toDataURL(url, { width: 300, margin: 4 });
            if (!this.stopped) {
              this.state.qrCode = image;
              this.state.qrExpiresAt = Date.now() + this.settings.qrLoginTimeoutMs;
            }
          },
        },
      );
      if (this.stopped) return;

      const resolvedAccountName = accountName ?? this.state.steamAccountName;
      if (resolvedAccountName && this.claimCheck) {
        const conflict = this.claimCheck(null, resolvedAccountName);
        if (conflict) {
          this.wasSkipped = true;
          this.log.warn(
            `Authenticated Steam account "${resolvedAccountName}" is already active under [${conflict}]. Skipping to prevent kick loop.`,
          );
          this.updateState({ status: "skipped", lastError: `Duplicate session of [${conflict}]` });
          return;
        }
      }

      if (accountName) {
        this.state.steamAccountName = accountName;
      }
      this.client.logOn({ refreshToken });
    } catch (err) {
      if (this.stopped) return;
      const message = err instanceof Error ? err.message : String(err);
      if (err instanceof QRLoginTimeoutError) {
        this.wasSkipped = true;
        this.log.warn({ err: message }, "QR login timed out; skipping account for this run");
        this.updateState({ status: "skipped", lastError: message });
        return;
      }

      this.log.error({ err: message }, "Authentication failed");
      this.updateState({ status: "error", lastError: message });
      this.scheduleReconnect();
    } finally {
      this.isAuthenticating = false;
      this.state.qrCode = null;
      this.state.qrExpiresAt = null;
    }
  }

  private bindEvents(): void {
    this.client.on("accountInfo", (name: string) => {
      if (!name) return;
      const prev = this.state.steamAccountName;
      this.state.steamAccountName = name;
      const tokenPath = join(this.settings.dataDirectory, "tokens", `${this.config.name}.txt`);
      const saved = readSavedToken(tokenPath);
      if (saved?.refreshToken) {
        persistToken(tokenPath, saved.refreshToken, name);
      }
      if (!prev) {
        this.log.debug({ steamAccount: name }, "Steam account name resolved");
      }
    });

    this.client.on("loggedOn", async () => {
      if (this.stopped) { this.client.logOff(); return; }
      this.backoffMs = 5_000;
      const steamName = this.client.accountInfo?.name ?? this.state.steamAccountName;
      const steamId = this.client.steamID?.getSteamID64() ?? null;

      if (this.claimCheck) {
        const conflict = this.claimCheck(steamId, steamName);
        if (conflict) {
          this.wasSkipped = true;
          this.log.warn(
            `Steam account "${steamName ?? steamId}" is already active under [${conflict}]. Stopping to prevent kick loop.`,
          );
          this.client.logOff();
          this.updateState({ status: "skipped", lastError: `Duplicate session of [${conflict}]` });
          return;
        }
      }

      if (this.config.games.includes("ALL")) {
        this.updateState({ status: "online", steamId, gamesPlaying: [] });
        try {
          await this.refreshLibrary();
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          this.log.error({ err: message }, "Could not load game library; restart to retry");
          this.updateState({ status: "error", lastError: message });
          return;
        }
      }
      if (this.stopped) return;

      this.updateState({
        status: this.state.manualPaused || this.steamBlocked ? "paused" : "farming",
        steamAccountName: steamName,
        steamId,
        lastError: null,
        connectedSince: new Date(),
      });
      const personaState = this.config.persona ?? SteamUser.EPersonaState.Online;
      this.client.setPersona(personaState);
      const steamInfo = this.state.steamAccountName ? ` (Steam: ${this.state.steamAccountName})` : "";
      const games = this.state.gamesPlaying.join(", ");
      this.log.info(`Farming active for [${games}]${steamInfo}`);
      this.refreshGames();
      if(steamId)void this.loadPersona(steamId);
    });

    this.client.on("webSession", (_sessionId, cookies) => {
      if (this.stopped) return;
      this.webCookies = cookies;
      void this.checkCards();
    });

    this.client.on("disconnected", (_eresult: number, msg?: string) => {
      this.webCookies = [];
      if (this.stopped) { this.updateState({ status: "offline", connectedSince: null }); return; }
      this.updateState({ status: "reconnecting", lastError: msg ?? "Disconnected" });
      this.log.warn(msg ? { reason: msg } : {}, "Disconnected");
    });

    this.client.on("error", (err: Error & { eresult?: number }) => {
      if (this.stopped) return;
      if (err.eresult === SteamUser.EResult.LoggedInElsewhere) {
        this.updateState({ status: "reconnecting", lastError: "Kicked by other session" });
        this.log.warn(
          "Kicked by other session (ensure this Steam account is not also running under another profile or on your PC)",
        );
        this.scheduleReconnect();
        return;
      }

      if (err.eresult === SteamUser.EResult.RateLimitExceeded) {
        this.rateLimitedUntil = Date.now() + 31 * 60_000;
        this.updateState({ status: "rate_limited", lastError: "Rate limited" });
        this.log.warn("Rate limited - retrying in 31 minutes");
        return;
      }

      // Invalid refresh token - clear it and re-auth
      if (
        err.eresult === SteamUser.EResult.InvalidPassword ||
        err.eresult === SteamUser.EResult.Expired ||
        err.eresult === SteamUser.EResult.AccessDenied
      ) {
        clearSavedToken(this.config.name, this.settings.dataDirectory);
        this.log.warn("Refresh token rejected - will re-authenticate");
      }

      this.updateState({ status: "error", lastError: err.message });
      this.log.error({ err: err.message, eresult: err.eresult }, "Steam error");
      this.scheduleReconnect();
    });

    this.client.on("playingState", (blocked: boolean) => {
      if (this.stopped) return;
      this.steamBlocked = blocked;
      this.state.isPaused = blocked || this.state.manualPaused;
      this.updateState({ status: this.state.isPaused ? "paused" : "farming" });
      this.log.info(blocked ? "Paused - playing on another session" : "Resumed farming");
      if (!blocked) this.refreshGames();
    });

    this.client.on("refreshToken", (token: string) => {
      if (!token || this.stopped) return;
      persistToken(join(this.settings.dataDirectory, "tokens", `${this.config.name}.txt`), token, this.state.steamAccountName ?? undefined);
      this.log.debug("Refresh token renewed");
    });
  }

  private refreshGames(): void {
    const count = batchCount(this.allGames, this.state.priorityGames);
    const rotationMs = this.state.rotationMinutes * 60_000;
    const cardActive = this.state.mode === "cards" && this.state.cardQueue.length > 0;
    const canReport = this.state.status === "farming" && Boolean(this.state.connectedSince) && !this.stopped && !this.state.isPaused && !this.state.samBusy;
    if (canReport && this.webCookies.length && Date.now() - this.lastCardAttempt >= 5 * 60_000) void this.checkCards();
    if (canReport && !cardActive && count > 1 && Date.now() - this.batchStartedAt >= rotationMs) {
      this.batchIndex++;
      this.batchStartedAt = Date.now();
      this.log.info({ games: this.state.gamesPlaying }, "Switched to next game batch");
    }
    if (this.allGames.length) this.state.gamesPlaying = gameBatch(this.allGames, this.batchIndex, this.state.priorityGames);
    if (this.state.mode === "cards" && this.state.cardQueue.length) {
      this.state.gamesPlaying = [this.state.cardQueue[0]!.appid];
    }
    this.state.batchCount = count;
    this.state.batchIndex = this.state.batchCount ? this.batchIndex % this.state.batchCount : 0;
    this.state.nextBatchAt = !cardActive && count > 1 ? this.batchStartedAt + rotationMs : null;
    this.state.queue = cardActive ? this.state.cardQueue.map(game=>[game.appid]) : Array.from({length:count},(_,index)=>gameBatch(this.allGames,this.batchIndex+index,this.state.priorityGames));
    this.state.nextGames = this.state.queue.length>1 ? this.state.queue[1]! : [];
    if (!canReport) return;
    if(this.state.lastReportedAt && Date.now()-this.state.lastReportedAt<30_000 && JSON.stringify(this.lastSentGames)===JSON.stringify(this.state.gamesPlaying))return;
    this.client.gamesPlayed(this.state.gamesPlaying);
    this.lastSentGames=[...this.state.gamesPlaying];
    this.state.lastReportedAt = Date.now();
  }

  private lastSentGames:(number|string)[]=[];

  private async loadPersona(steamId:string):Promise<void>{
    const generation=this.sessionGeneration;
    try{
      const result=await this.client.getPersonas([steamId]);
      if(this.stopped||generation!==this.sessionGeneration||this.state.steamId!==steamId)return;
      const persona=result.personas[steamId];
      if(!persona)return;
      this.state.displayName=typeof persona.player_name==='string'?persona.player_name.slice(0,128):null;
      this.state.avatarUrl=safeAvatar(persona.avatar_url_full);
      this.state.vanityUrl=safeVanity(this.client.vanityURL);
      this.cacheProfile();
    }catch{/* An unavailable avatar must not interrupt the queue. */}
  }

  private cacheProfile():void {
    if(!this.state.steamId)return;
    try {saveProfile(this.settings.dataDirectory,this.config.name,this.state);}catch{this.log.warn('Public profile cache could not be saved');}
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) return;
    this.backoffMs = Math.min(this.backoffMs * 2, SteamAccount.MAX_BACKOFF_MS);
    this.log.info({ retryInSec: Math.round(this.backoffMs / 1000) }, "Reconnecting...");
    this.reconnectTimer = setTimeout(() => { this.reconnectTimer = null; void this.logOn(); }, this.backoffMs);
  }

  private updateState(partial: Partial<AccountState>): void {
    const isStatusUnchanged = partial.status !== undefined && partial.status === this.state.status;
    const isErrorUnchanged = partial.lastError !== undefined && partial.lastError === this.state.lastError;
    Object.assign(this.state, partial);
    if (isStatusUnchanged && isErrorUnchanged) return;
    this.emit("stateChange", this.state);
  }
}
