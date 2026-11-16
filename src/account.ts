import SteamUser from "steam-user";
import {readRuntime,saveRuntime} from "./runtime-state.js";
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
  loginError,
  type AuthChallenge,
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
  mode: "hours" | "cards" | "fixed";
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
  loginMethod: 'credentials'|'qr';
  authPhase: 'idle'|'credentials'|'qr'|'guard'|'steam';
  authChallenge: AuthChallenge|null;
  authError: string|null;
  eligibleGameCount:number;
  completedGoalIds:number[];
  eligiblePriorityCount:number;
  eligibleCardQueue:CardGame[];
  hourGoals:Record<string,number>;
  events:{at:number;kind:string;detail:string}[];
  runtimeError:string|null;
  cardSessionDrops:number;
  cardStartedAt:number|null;
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
  private ownershipReady = false;
  private libraryRefreshTask: Promise<void> | null = null;
  private libraryTimer: ReturnType<typeof setInterval> | null = null;
  private lastLibraryAttempt = 0;
  private batchIndex = 0;
  private batchStartedAt = 0;
  private suspendedAt:number|null=null;
  private savedRemainingMs:number|null=null;
  private checkpointTimer:ReturnType<typeof setInterval>|null=null;
  private steamBlocked = false;
  private webCookies: string[] = [];
  private scanningCards = false;
  private lastCardAttempt = 0;
  private stopped = false;
  private shuttingDown = false;
  private started = false;
  private authAbort: AbortController | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private sessionGeneration = 0;
  private loginPromise:Promise<void>|null=null;
  private credentials:{accountName:string;password:string}|null=null;
  private guardSubmit:((code:string)=>Promise<void>)|null=null;
  private guardBusy=false;
  private samFinishedAt=0;
  private lastCardCounts=new Map<number,number>();
  private currentCardAppid:number|null=null;
  private completedGoals=new Set<number>();
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
      enablePicsCache: true,
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
      manualPaused: config.manualPaused,
      hourGoals:{...config.hourGoals},eligibleGameCount:0,completedGoalIds:[],eligiblePriorityCount:0,eligibleCardQueue:[],events:[],runtimeError:null,
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
      loginMethod:config.loginMethod,authPhase:'idle',authChallenge:null,authError:null,
      cardSessionDrops:0,cardStartedAt:null,
    };

    const savedRuntime=readRuntime(settings.dataDirectory,config.name);
    if(savedRuntime){this.batchIndex=savedRuntime.group;this.savedRemainingMs=Math.min(savedRuntime.remainingMs,this.state.rotationMinutes*60000);this.state.events=savedRuntime.events;}
    this.state.isPaused=this.state.manualPaused;
    Object.assign(this.state,readProfile(settings.dataDirectory,config.name));
    this.client.on('vanityURL',(value:string)=>{this.state.vanityUrl=safeVanity(value);this.cacheProfile();});
    this.bindEvents();
  }

  getState(): Readonly<AccountState> {
    return this.state;
  }

  assertCanLogin(){
    if(this.state.samBusy)throw new Error('REQUEST_BUSY');
    if(Date.now()<this.rateLimitedUntil)throw new Error('AUTH_RATE_LIMIT');
    if(this.state.connectedSince&&['farming','paused','online'].includes(this.state.status))throw new Error('ACCOUNT_ALREADY_CONNECTED');
  }
  async beginLogin(method:'credentials'|'qr',credentials?:{accountName:string;password:string}):Promise<void>{
    this.assertCanLogin();
    await this.stop();
    clearSavedToken(this.config.name,this.settings.dataDirectory);
    this.config.password=undefined;this.config.sharedSecret=undefined;this.config.loginMethod=method;
    if(credentials)this.config.accountName=credentials.accountName;
    this.credentials=credentials??null;this.state.loginMethod=method;this.state.authError=null;this.state.lastError=null;
    this.state.steamId=null;this.state.steamAccountName=credentials?.accountName??null;
    this.state.avatarUrl=null;this.state.displayName=null;this.state.vanityUrl=null;
    this.state.library=[];this.state.achievements={};this.state.gamesPlaying=[];
    this.state.queue=[];this.state.nextGames=[];this.state.cardQueue=[];this.allGames=[];
    this.batchIndex=0;this.batchStartedAt=0;this.savedRemainingMs=null;this.suspendedAt=Date.now();this.completedGoals.clear();
    this.lastCardCounts.clear();this.state.cardSessionDrops=0;this.state.cardStartedAt=null;this.currentCardAppid=null;
    clearProfile(this.settings.dataDirectory,this.config.name);
    void this.start().catch(()=>{this.state.authError='AUTH_UNAVAILABLE';});
  }

  async submitGuardCode(code:string):Promise<void>{
    if(Date.now()<this.rateLimitedUntil)throw new Error('AUTH_RATE_LIMIT');
    if(this.state.authPhase!=='guard'||!this.guardSubmit)throw new Error('AUTH_EXPIRED');
    if(this.guardBusy)throw new Error('REQUEST_BUSY');
    this.guardBusy=true;
    try{await this.guardSubmit(code);this.state.authError=null;}catch(error){
      const reason=loginError(error);
      if(reason==='AUTH_RATE_LIMIT'){this.rateLimitedUntil=Date.now()+31*60_000;this.state.authError=reason;}
      throw new Error(reason);
    }finally{this.guardBusy=false;}
  }

  setPreferences(preferences: { priorityGames: number[]; rotationMinutes: number; label: string }, persist?: (next: AccountConfig) => void): void {
    const priorities = [...new Set(preferences.priorityGames)];
    if (priorities.some(id => !this.state.library.some(game => game.appid === id))) throw new Error("PRIORITY_NOT_OWNED");
    const reset=JSON.stringify(priorities)!==JSON.stringify(this.config.priorityGames)||preferences.rotationMinutes!==this.config.rotationMinutes;
    const changes = { ...preferences, priorityGames: priorities };
    persist?.({...this.config, ...changes});
    Object.assign(this.config, changes);
    this.state.priorityGames = priorities;
    this.state.rotationMinutes = preferences.rotationMinutes;
    this.state.label = preferences.label;
    if(reset){this.batchIndex=0;this.batchStartedAt=Date.now();this.suspendedAt=this.state.isPaused?Date.now():null;this.savedRemainingMs=null;}
    this.refreshGames();this.checkpoint();
  }

  private licensedGames(): {appid:number;name:string}[] {
    if(!this.ownershipReady)return [];
    try{return this.client.getOwnedApps().flatMap(appid=>{
      const common=this.client.picsCache.apps[appid]?.appinfo?.common;
      if(!Number.isSafeInteger(appid)||appid<1||appid>2147483647||!['game','application','demo','mod'].includes(String(common?.type).toLowerCase()))return [];
      return [{appid,name:typeof common?.name==='string'&&common.name.trim()?common.name:`App ${appid}`}];
    });}catch{return [];}
  }

  async refreshLibrary(): Promise<void> {
    if (!this.state.steamId || this.stopped) throw new Error("ACCOUNT_OFFLINE");
    if(this.libraryRefreshTask)return this.libraryRefreshTask;
    const generation=this.sessionGeneration;
    this.state.libraryRefreshing=true;this.state.libraryError=null;this.lastLibraryAttempt=Date.now();
    const task=this.loadLibrary(generation).finally(()=>{
      if(this.libraryRefreshTask===task){this.libraryRefreshTask=null;this.state.libraryRefreshing=false;}
    });
    this.libraryRefreshTask=task;return task;
  }

  private async loadLibrary(generation:number):Promise<void>{
    try {
      let apps:SteamUser.UserOwnedApps['apps']=[],profileFailed=false;
      try{apps=(await this.client.getUserOwnedApps(this.state.steamId!, { includePlayedFreeGames: true, includeFreeSub: true, skipUnvettedApps: false } as SteamUser.GetUserOwnedAppsOptions)).apps;}
      catch(error){profileFailed=true;if(!this.licensedGames().length)throw error;}
      if(this.stopped||generation!==this.sessionGeneration)return;
      const licensed=this.licensedGames(),previous=new Map(this.state.library.map(game=>[game.appid,game]));
      const configured=this.config.games.filter((game):game is number=>typeof game==='number');
      this.allGames=[...new Set([...configured,...[...apps.map(game=>game.appid),...licensed.map(game=>game.appid)].sort((a,b)=>a-b),...this.config.manualGames.map(game=>game.appid)])].filter(id=>id>0);
      const info=new Map(apps.map(game=>[game.appid,game])),licenseNames=new Map(licensed.map(game=>[game.appid,game.name]));
      const names:Record<number,string>={730:'Counter-Strike 2',271590:'Grand Theft Auto V Legacy',1174180:'Red Dead Redemption 2',218:'Source SDK Base 2007'};
      this.state.library=this.allGames.map(appid=>({appid,name:names[appid]||info.get(appid)?.name||licenseNames.get(appid)||this.config.manualGames.find(game=>game.appid===appid)?.name||previous.get(appid)?.name||`App ${appid}`,playtimeMinutes:info.get(appid)?.playtime_forever??previous.get(appid)?.playtimeMinutes??0}));
      this.state.priorityGames=this.config.priorityGames.filter(id=>this.allGames.includes(id));
      this.state.libraryCheckedAt=Date.now();this.state.libraryError=profileFailed?'LIBRARY_PLAYTIME_UNAVAILABLE':null;
      if(!this.batchStartedAt){this.batchStartedAt=Date.now()-(this.state.rotationMinutes*60000-(this.savedRemainingMs??this.state.rotationMinutes*60000));this.suspendedAt=Date.now();this.savedRemainingMs=null;}
      // Refreshing metadata must not restart the playtime rotation clock.
      this.record('library',String(this.allGames.length));this.refreshGames();this.log.info({totalGames:this.allGames.length},'Library refreshed');
    }catch(error){if(!this.stopped&&generation===this.sessionGeneration)this.state.libraryError='LIBRARY_UNAVAILABLE';throw error;}
  }

  async addGame(appid:number,persist?:(next:AccountConfig)=>void):Promise<void> {
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
    persist?.({...this.config,manualGames:[...this.config.manualGames,game]});
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
    this.state.samBusy=true;
    try{
    if(this.steamBlocked&&Date.now()-this.samFinishedAt<3000){const until=Date.now()+3000;while(this.steamBlocked&&Date.now()<until)await new Promise(resolve=>setTimeout(resolve,100));}
    if(this.steamBlocked)throw new Error('SAM_GAME_RUNNING');
    const steamId=this.state.steamId,wasStarted=this.started;
    let cleanupRelease=()=>{};
    try{
      // Resolve timeout as a value: stop() may still be pending when it fires.
      const disconnected=this.client.steamID?new Promise<Error|null>(resolve=>{
        const done=()=>{cleanupRelease();resolve(null);};
        const timer=setTimeout(()=>{cleanupRelease();resolve(new Error('SAM_SESSION_RELEASE_FAILED'));},8000);
        cleanupRelease=()=>{clearTimeout(timer);this.client.removeListener('disconnected',done);};
        this.client.once('disconnected',done);
      }):Promise.resolve(null);
      await this.stop({preservePause:true});
      const releaseError=await disconnected;if(releaseError)throw releaseError;
      const result=await operation(steamId);
      this.state.achievements[appid]={unlocked:result.unlocked,total:result.total,checkedAt:Date.now()};
      return result;
    }finally{
      cleanupRelease();
      this.state.lastReportedAt=null;
      this.samFinishedAt=Date.now();
      this.state.isPaused=this.state.manualPaused||this.steamBlocked;
      if(wasStarted&&!this.shuttingDown){await this.start();const until=Date.now()+10000;while(!this.state.connectedSince&&this.state.status==='connecting'&&Date.now()<until)await new Promise(resolve=>setTimeout(resolve,100));}
    }
    }finally{this.state.samBusy=false;this.refreshGames();}
  }

  async logout():Promise<void> {
    await this.stop();
    clearSavedToken(this.config.name,this.settings.dataDirectory);
    this.config.password=undefined;this.config.sharedSecret=undefined;this.config.accountName=undefined;this.config.loginMethod='credentials';this.state.loginMethod='credentials';
    this.state.steamId=null;this.state.steamAccountName=null;this.state.gamesPlaying=[];
    this.state.cardQueue=[];this.state.cardCheckedAt=null;this.state.cardStatus='waiting';this.state.cardError=null;
    this.lastCardCounts.clear();this.state.cardSessionDrops=0;this.state.cardStartedAt=null;this.currentCardAppid=null;
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

  setMode(mode: "hours" | "cards" | "fixed"): void {
    this.state.mode = mode;
    this.config.farmingMode = mode;
    if (mode === "cards") void this.checkCards();
    this.refreshGames();
  }

  private freezeClock(){if(this.suspendedAt===null)this.suspendedAt=Date.now();}
  private thawClock(){if(this.suspendedAt!==null){if(this.batchStartedAt)this.batchStartedAt+=Date.now()-this.suspendedAt;this.suspendedAt=null;}}
  private record(kind:string,detail=''){this.state.events.unshift({at:Date.now(),kind,detail:detail.slice(0,200)});this.state.events=this.state.events.slice(0,100);}
  checkpoint(){
    const end=this.suspendedAt??Date.now();
    const remaining=this.batchStartedAt?Math.max(0,this.state.rotationMinutes*60000-(end-this.batchStartedAt)):(this.savedRemainingMs??this.state.rotationMinutes*60000);
    try{saveRuntime(this.settings.dataDirectory,this.config.name,{group:Math.max(0,this.batchIndex),remainingMs:Math.min(remaining,this.state.rotationMinutes*60000),manualPaused:this.state.manualPaused,events:this.state.events});this.state.runtimeError=null;}
    catch{this.state.runtimeError='CONFIG_SAVE_FAILED';}
  }
  setGoal(appid:number,minutes:number|null,persist?:(next:AccountConfig)=>void){
    if(!this.state.library.some(game=>game.appid===appid))throw new Error('PRIORITY_NOT_OWNED');
    if(minutes!==null&&(!Number.isSafeInteger(minutes)||minutes<1||minutes>60000000))throw new Error('INVALID_SETTINGS');
    const goals={...this.config.hourGoals};if(minutes===null)delete goals[String(appid)];else goals[String(appid)]=minutes;
    persist?.({...this.config,hourGoals:goals});this.config.hourGoals=goals;this.state.hourGoals={...goals};this.record('goal',String(appid));this.refreshGames();this.checkpoint();
  }
  pause(): void {
    this.freezeClock();this.config.manualPaused=true;
    this.state.manualPaused = true;
    this.state.isPaused = true;
    this.record('paused');this.checkpoint();
    if (this.state.connectedSince && ["farming", "paused", "online"].includes(this.state.status)) {
      this.client.gamesPlayed([]);
      this.updateState({ status: "paused" });
    }
  }

  resume(): void {
    this.config.manualPaused=false;if(!this.steamBlocked)this.thawClock();
    this.state.manualPaused = false;
    this.state.isPaused = this.steamBlocked;
    this.record('resumed');this.checkpoint();
    if (this.state.status === "paused" && !this.steamBlocked) {
      this.updateState({ status: "farming" });
      this.refreshGames();
    }
  }

  nextBatch(): void {
    if(this.state.mode==='fixed')throw new Error('FIXED_MODE_NO_ROTATION');
    if (this.state.mode !== "hours"&&this.state.eligibleCardQueue.length) throw new Error("Kartlar bitene kadar mevcut oyun açık kalır.");
    this.batchIndex++;
    this.batchStartedAt = Date.now();if(this.suspendedAt!==null)this.suspendedAt=Date.now();
    this.record('group',String(this.batchIndex));this.refreshGames();this.checkpoint();
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
      for(const [appid,remaining] of this.lastCardCounts){const next=queue.find(game=>game.appid===appid)?.remaining??0;this.state.cardSessionDrops+=Math.max(0,remaining-next);}
      this.lastCardCounts=new Map(queue.map(game=>[game.appid,game.remaining]));
      this.state.cardQueue = queue;
      this.state.cardStatus = "ready";
      this.state.cardCheckedAt = Date.now();
      this.state.cardError = null;
      this.record('cards',String(queue.reduce((sum,g)=>sum+g.remaining,0)));
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
    if(this.shuttingDown)throw new Error('APP_SHUTTING_DOWN');
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
    this.checkpointTimer=setInterval(()=>this.checkpoint(),30000);
    this.logOnTimer = setInterval(() => this.logOn(), this.settings.logOnIntervalMs);
    this.refreshTimer = setInterval(() => this.refreshGames(), this.settings.refreshGamesIntervalMs);
    this.libraryTimer = setInterval(() => {
      if(!this.stopped&&!this.state.samBusy&&this.state.connectedSince&&Date.now()-this.lastLibraryAttempt>=5*60_000)void this.refreshLibrary().catch(()=>{});
    },5*60_000);
  }

  async shutdown():Promise<void>{
    this.shuttingDown=true;
    this.checkpoint();await this.stop({preservePause:true});
  }

  async stop(options:{preservePause?:boolean}={}): Promise<void> {
    this.freezeClock();this.checkpoint();
    if(this.checkpointTimer)clearInterval(this.checkpointTimer);this.checkpointTimer=null;
    this.sessionGeneration++;
    this.ownershipReady=false;this.libraryRefreshTask=null;this.state.libraryRefreshing=false;
    this.stopped = true;
    this.started = false;
    this.state.enabled = false;
    this.authAbort?.abort();
    if(this.loginPromise)await this.loginPromise;
    this.guardSubmit=null;this.guardBusy=false;this.credentials=null;
    this.state.authPhase='idle';this.state.authChallenge=null;this.state.authError=null;
    this.state.qrCode = null;
    this.state.qrExpiresAt = null;
    this.state.lastReportedAt=null;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer=null;
    if (this.logOnTimer) clearInterval(this.logOnTimer);
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    if(this.libraryTimer)clearInterval(this.libraryTimer);
    this.libraryTimer=null;
    this.logOnTimer = null;
    this.refreshTimer = null;
    this.webCookies = [];
    if(!options.preservePause)this.state.manualPaused=this.config.manualPaused;
    this.state.isPaused=this.state.manualPaused;this.steamBlocked=false;
    if (this.state.status === "offline" || this.state.status === "skipped") { this.updateState({ status: "offline", connectedSince: null }); return; }

    this.client.gamesPlayed([]);
    this.client.logOff();
    this.updateState({ status: "offline", connectedSince: null });
    this.log.info("Logged off");
  }

  private logOn():Promise<void>{
    if(this.loginPromise)return this.loginPromise;
    const task=this.performLogOn();this.loginPromise=task;
    void task.finally(()=>{if(this.loginPromise===task)this.loginPromise=null;}).catch(()=>{});
    return task;
  }

  private async performLogOn(): Promise<void> {
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

    const saved=readSavedToken(join(this.settings.dataDirectory,'tokens',`${this.config.name}.txt`));
    if(this.config.loginMethod==='credentials'&&!this.credentials&&!this.config.password&&!saved){this.updateState({status:'offline',authPhase:'idle'});return;}
    this.updateState({ status: "connecting",lastError:null,authError:null,authPhase:saved?'steam':this.config.loginMethod==='qr'?'qr':'credentials' });
    this.lastLogOnTime = Date.now();
    this.isAuthenticating = true;
    this.log.info("Connecting to Steam...");

    try {
      this.authAbort = new AbortController();
      const { refreshToken, accountName } = await authenticate(
        this.credentials?{...this.config,...this.credentials}:this.config,
        this.settings.dataDirectory,
        this.settings.qrLoginTimeoutMs,
        {
          signal: this.authAbort.signal,
          onGuard:(challenge,submit)=>{if(!this.stopped){this.state.authPhase='guard';this.state.authChallenge=challenge;this.guardSubmit=submit;}},
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
      this.state.authPhase='steam';this.state.authChallenge=null;this.guardSubmit=null;

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
        this.state.authError='AUTH_TIMEOUT';
        return;
      }

      const code=loginError(err);this.log.warn({code}, "Authentication failed");
      if(code==='AUTH_RATE_LIMIT')this.rateLimitedUntil=Date.now()+31*60_000;
      this.updateState({ status: code==='AUTH_RATE_LIMIT'?'rate_limited':'error', lastError: code,authError:code });
    } finally {
      this.isAuthenticating = false;
      this.credentials=null;this.guardSubmit=null;this.state.authChallenge=null;
      if(this.state.authPhase!=='steam')this.state.authPhase='idle';
      this.state.qrCode = null;
      this.state.qrExpiresAt = null;
    }
  }

  private bindEvents(): void {
    this.client.on('ownershipCached',()=>{
      this.ownershipReady=true;
      const generation=this.sessionGeneration;
      void (async()=>{
        if(this.libraryRefreshTask)await this.libraryRefreshTask.catch(()=>{});
        if(!this.stopped&&generation===this.sessionGeneration&&!this.state.samBusy&&this.state.steamId)await this.refreshLibrary();
      })().catch(()=>{});
    });
    this.client.on("accountInfo", (name: string) => {
      if (!name) return;
      this.state.displayName=name.slice(0,128);
    });

    this.client.on("loggedOn", async () => {
      if (this.stopped) { this.client.logOff(); return; }
      this.backoffMs = 5_000;
      const steamName = this.state.steamAccountName ?? this.config.accountName ?? null;
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
        } catch {
          this.log.warn("Library unavailable; automatic synchronization will retry");
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
        this.updateState({ status: "rate_limited", lastError: "Rate limited",authPhase:'idle',authError:'AUTH_RATE_LIMIT' });
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

      this.updateState({ status: "error", lastError: err.message,authPhase:'idle',authError:'AUTH_UNAVAILABLE' });
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
    const completed=new Set(this.state.library.filter(game=>this.config.hourGoals[String(game.appid)]&&game.playtimeMinutes>=this.config.hourGoals[String(game.appid)]!).map(game=>game.appid));
    for(const id of completed)if(!this.completedGoals.has(id))this.record('goalReached',String(id));this.completedGoals=completed;
    const scope=this.config.games.includes('ALL')?this.allGames:[...new Set([...this.config.games.filter((id):id is number=>typeof id==='number'),...this.config.manualGames.map(game=>game.appid)])];
    const eligible=scope.filter(id=>!this.config.hourGoals[String(id)]||(this.state.library.find(game=>game.appid===id)?.playtimeMinutes??0)<this.config.hourGoals[String(id)]!);
    const priorities=this.state.priorityGames.filter(id=>eligible.includes(id));
    const cards=this.state.cardQueue.filter(game=>eligible.includes(game.appid));
    this.state.eligibleGameCount=eligible.length;this.state.completedGoalIds=[...completed];this.state.eligiblePriorityCount=priorities.length;
    this.state.eligibleCardQueue=cards;
    const fixed=this.state.mode==='fixed';
    const count = fixed?(priorities.length?1:0):batchCount(eligible, priorities);
    const rotationMs = this.state.rotationMinutes * 60_000;
    const cardActive = this.state.mode === "cards" && cards.length > 0;
    const canReport = this.state.status === "farming" && Boolean(this.state.connectedSince) && !this.stopped && !this.state.isPaused && !this.state.samBusy;
    if(canReport&&!cardActive){this.thawClock();}else this.freezeClock();
    if (canReport && this.webCookies.length && Date.now() - this.lastCardAttempt >= 5 * 60_000) void this.checkCards();
    if (canReport && !cardActive && count > 1 && Date.now() - this.batchStartedAt >= rotationMs) {
      this.batchIndex++;this.record('group',String(this.batchIndex));
      this.batchStartedAt = Date.now();
      this.log.info({ games: this.state.gamesPlaying }, "Switched to next game batch");
    }
    if(fixed)this.state.gamesPlaying=[...priorities];
    else if (eligible.length) this.state.gamesPlaying = gameBatch(eligible, this.batchIndex, priorities);
    if (this.state.mode === "cards" && cards.length) {
      this.state.gamesPlaying = [cards[0]!.appid];
    }
    const currentCard=cardActive?cards[0]!.appid:null;
    if(currentCard!==this.currentCardAppid){this.currentCardAppid=currentCard;this.state.cardStartedAt=currentCard?Date.now():null;}
    this.state.batchCount = count;
    this.state.batchIndex = this.state.batchCount ? this.batchIndex % this.state.batchCount : 0;
    this.state.nextBatchAt = !cardActive && count > 1 ? (this.suspendedAt===null?this.batchStartedAt+rotationMs:Date.now()+Math.max(0,rotationMs-(this.suspendedAt-this.batchStartedAt))) : null;
    this.state.queue = fixed ? (priorities.length?[[...priorities]]:[]) : cardActive ? cards.map(game=>[game.appid]) : Array.from({length:count},(_,index)=>gameBatch(eligible,this.batchIndex+index,priorities));
    this.state.nextGames = this.state.queue.length>1 ? this.state.queue[1]! : [];
    if(!eligible.length&&!fixed)this.state.gamesPlaying=[];
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
    if(partial.status&&partial.status!==this.state.status){this.record('status',partial.status);if(partial.status!=='farming')this.freezeClock();}
    Object.assign(this.state, partial);
    if (isStatusUnchanged && isErrorUnchanged) return;
    this.emit("stateChange", this.state);
  }
}
