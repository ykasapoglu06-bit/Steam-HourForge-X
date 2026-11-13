import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SteamUser from 'steam-user';
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
vi.mock('../src/profile-cache.js',async(importOriginal)=>({...await importOriginal<typeof import('../src/profile-cache.js')>(),readProfile:()=>({steamId:null,avatarUrl:null,displayName:null,vanityUrl:null}),saveProfile:vi.fn(),clearProfile:vi.fn()}));

const { authenticateMock, readSavedTokenMock, persistTokenMock } = vi.hoisted(() => ({
  authenticateMock: vi.fn(),
  readSavedTokenMock: vi.fn(),
  persistTokenMock: vi.fn(),
}));

vi.mock("../src/auth.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/auth.js")>()),
  authenticate: authenticateMock,
  readSavedToken: readSavedTokenMock,
  persistToken: persistTokenMock,
}));

import { QRLoginTimeoutError } from "../src/auth.js";
import { SteamAccount } from "../src/account.js";
import { ConfigSchema } from "../src/config.js";

describe("SteamAccount", () => {
  it.each([false,true])('keeps the latest pause preference during native handoff (initial %s)',async(initial)=>{
    const config=ConfigSchema.parse({accounts:[{name:'pause-handoff',games:[730]}]});
    const account=new SteamAccount(config.accounts[0]!,config.settings),internal=account as any;
    Object.assign(internal.state,{steamId:'76561198000000000',connectedSince:new Date(),status:'farming',manualPaused:initial,library:[{appid:730,name:'Fixture',playtimeMinutes:0}]});
    internal.started=true;vi.spyOn(internal.client,'gamesPlayed').mockImplementation(()=>{});
    vi.spyOn(account,'start').mockImplementation(async()=>{internal.stopped=false;Object.assign(internal.state,{connectedSince:new Date(),status:internal.state.manualPaused?'paused':'farming'});});
    let finish!:(value:{unlocked:number;total:number})=>void;
    const task=account.desktopAchievements(730,()=>new Promise(resolve=>finish=resolve));
    await vi.waitFor(()=>expect(finish).toBeTypeOf('function'));
    initial?account.resume():account.pause();finish({unlocked:0,total:1});await task;
    expect(account.getState().manualPaused).toBe(!initial);expect(account.getState().status).toBe(initial?'farming':'paused');
  });
  it('cleans up native release listeners if stopping fails',async()=>{
    vi.useFakeTimers();
    const config=ConfigSchema.parse({accounts:[{name:'release-failure',games:[730]}]});
    const account=new SteamAccount(config.accounts[0]!,config.settings),internal=account as any;
    Object.assign(internal.state,{steamId:'76561198000000000',connectedSince:new Date(),status:'farming',library:[{appid:730,name:'Fixture',playtimeMinutes:0}]});
    internal.client.steamID={getSteamID64:()=> '76561198000000000'};
    const listeners=internal.client.listenerCount('disconnected'),timers=vi.getTimerCount();
    vi.spyOn(account,'stop').mockRejectedValue(new Error('STOP_FAILED'));
    vi.spyOn(internal,'refreshGames').mockImplementation(()=>{});
    await expect(account.desktopAchievements(730,async()=>({unlocked:0,total:1}))).rejects.toThrow('STOP_FAILED');
    expect(internal.client.listenerCount('disconnected')).toBe(listeners);expect(vi.getTimerCount()).toBe(timers);
  });
  it('handles release timeout while stop is still pending without an unhandled rejection',async()=>{
    vi.useFakeTimers();
    const config=ConfigSchema.parse({accounts:[{name:'slow-stop',games:[730]}]});
    const account=new SteamAccount(config.accounts[0]!,config.settings),internal=account as any;
    Object.assign(internal.state,{steamId:'76561198000000000',connectedSince:new Date(),status:'farming',library:[{appid:730,name:'Fixture',playtimeMinutes:0}]});
    internal.client.steamID={getSteamID64:()=> '76561198000000000'};
    let finish!:()=>void;vi.spyOn(account,'stop').mockImplementation(()=>new Promise(resolve=>finish=resolve));
    vi.spyOn(internal,'refreshGames').mockImplementation(()=>{});const operation=vi.fn(async()=>({unlocked:0,total:1}));
    const task=account.desktopAchievements(730,operation).catch(error=>error.message);
    await vi.advanceTimersByTimeAsync(9000);finish();
    expect(await task).toBe('SAM_SESSION_RELEASE_FAILED');expect(operation).not.toHaveBeenCalled();expect(internal.state.samBusy).toBe(false);
  });
  it('plays one eligible card game and returns to the priority hours queue when cards run out',()=>{
    const config=ConfigSchema.parse({accounts:[{name:'card-return',games:['ALL'],priorityGames:[730]}]});
    const account=new SteamAccount(config.accounts[0]!,config.settings),internal=account as any;
    internal.allGames=[730,440];Object.assign(internal.state,{status:'farming',connectedSince:new Date(),steamId:'76561198000000000',mode:'cards',cardQueue:[{appid:440,name:'TF2',remaining:2}]});
    vi.spyOn(internal.client,'gamesPlayed').mockImplementation(()=>{});internal.refreshGames();
    expect(account.getState().gamesPlaying).toEqual([440]);expect(account.getState().cardStartedAt).toBeTypeOf('number');
    internal.state.cardQueue=[];internal.refreshGames();
    expect(account.getState().gamesPlaying).toEqual([730,440]);expect(account.getState().cardStartedAt).toBeNull();
    expect(()=>account.nextBatch()).not.toThrow();
  });
  it('switches a pending QR attempt to credentials without storing the password in configuration or status',async()=>{
    const config=ConfigSchema.parse({accounts:[{name:'login-switch',games:['ALL'],loginMethod:'qr'}]});
    const account=new SteamAccount(config.accounts[0]!,config.settings),client=(account as any).client;
    vi.spyOn(client,'logOff').mockImplementation(()=>{});vi.spyOn(client,'gamesPlayed').mockImplementation(()=>{});vi.spyOn(client,'logOn').mockImplementation(()=>{});
    authenticateMock.mockImplementationOnce(async(_c,_d,_t,options)=>new Promise((_,reject)=>options.signal.addEventListener('abort',()=>reject(new Error('LOGIN_CANCELLED')),{once:true})));
    const qr=account.start();await vi.waitFor(()=>expect(authenticateMock).toHaveBeenCalled());
    let finish:any;authenticateMock.mockImplementationOnce(async()=>new Promise(resolve=>{finish=resolve;}));
    await account.beginLogin('credentials',{accountName:'test-user',password:'secret-password'});await qr;
    await vi.waitFor(()=>expect(authenticateMock).toHaveBeenCalledTimes(2));
    expect(authenticateMock.mock.calls[1]![0].password).toBe('secret-password');
    expect(JSON.stringify(config)).not.toContain('secret-password');expect(JSON.stringify(account.getState())).not.toContain('secret-password');
    finish({refreshToken:'test-session',accountName:'test-user'});
    await vi.waitFor(()=>expect(client.logOn).toHaveBeenCalledWith({refreshToken:'test-session'}));await account.stop();
  });
  beforeEach(()=>{vi.spyOn(SteamUser.prototype,'getPersonas').mockResolvedValue({personas:{}});});
  it('loads the Steam photo and display name and rejects non-Steam avatar URLs',async()=>{
    const config=ConfigSchema.parse({accounts:[{name:'photo',games:[730]}]});
    const account=new SteamAccount(config.accounts[0]!,config.settings),client=(account as any).client;
    const steamId='76561198000000000';client.steamID={getSteamID64:()=>steamId};
    client.getPersonas.mockResolvedValue({personas:{[steamId]:{player_name:'Player',avatar_url_full:'https://steamcdn-a.akamaihd.net/steamcommunity/public/images/avatars/ab/abcdef_full.jpg'}}});
    vi.spyOn(client,'setPersona').mockImplementation(()=>{});vi.spyOn(client,'gamesPlayed').mockImplementation(()=>{});
    client.emit('loggedOn');await new Promise(resolve=>setImmediate(resolve));
    expect(account.getState().displayName).toBe('Player');expect(account.getState().avatarUrl).toContain('abcdef_full.jpg');
    (account as any).state.avatarUrl=null;
    client.getPersonas.mockResolvedValue({personas:{[steamId]:{player_name:'Player',avatar_url_full:'https://example.com/track.png'}}});
    await (account as any).loadPersona(steamId);expect(account.getState().avatarUrl).toBeNull();
  });
  it('restores farming after a native achievement operation fails and preserves a manual pause',async()=>{
    const config=ConfigSchema.parse({accounts:[{name:'native',games:[730]}]});
    const account=new SteamAccount(config.accounts[0]!,config.settings),client=(account as any).client;
    Object.assign((account as any).state,{steamId:'76561198000000000',connectedSince:new Date(),status:'farming',library:[{appid:730,name:'CS2',playtimeMinutes:0}]});
    vi.spyOn(client,'gamesPlayed').mockImplementation(()=>{});
    (account as any).started=true;
    vi.spyOn(account,'start').mockImplementation(async()=>{(account as any).started=true;(account as any).stopped=false;Object.assign((account as any).state,{connectedSince:new Date(),status:account.getState().manualPaused?'paused':'farming'});});
    await expect(account.desktopAchievements(730,async()=>{expect(account.getState().samBusy).toBe(true);throw new Error('SAM_STEAM_OFFLINE');})).rejects.toThrow('SAM_STEAM_OFFLINE');
    expect(account.getState().samBusy).toBe(false);expect(account.getState().lastReportedAt).toBeTypeOf('number');
    account.pause();
    await account.desktopAchievements(730,async()=>({unlocked:1,total:1}));
    expect(account.getState().manualPaused).toBe(true);expect(account.getState().status).toBe('paused');
    expect(account.getState().achievements[730]?.unlocked).toBe(1);
  });
  it('locks native handoff before waiting for the Steam cooldown',async()=>{
    vi.useFakeTimers();
    const config=ConfigSchema.parse({accounts:[{name:'cooldown',games:[730]}]});
    const account=new SteamAccount(config.accounts[0]!,config.settings),internal=account as any;
    Object.assign(internal.state,{steamId:'76561198000000000',connectedSince:new Date(),status:'farming',library:[{appid:730,name:'CS2',playtimeMinutes:0}]});
    internal.steamBlocked=true;internal.samFinishedAt=Date.now();
    vi.spyOn(internal.client,'gamesPlayed').mockImplementation(()=>{});
    const operation=vi.fn(async()=>({unlocked:0,total:1}));
    const first=account.desktopAchievements(730,operation);
    const second=expect(account.desktopAchievements(730,operation)).rejects.toThrow('REQUEST_BUSY');
    internal.steamBlocked=false;await vi.advanceTimersByTimeAsync(100);
    await first;await second;expect(operation).toHaveBeenCalledOnce();expect(account.getState().samBusy).toBe(false);
  });
  it("verifies a manually added app and includes it in the queue",async()=>{
    const config=ConfigSchema.parse({accounts:[{name:'manual',games:['ALL']}]});
    const account=new SteamAccount(config.accounts[0]!,config.settings);const client=(account as any).client;
    (account as any).state.connectedSince=new Date();(account as any).state.status='farming';
    vi.spyOn(client,'getProductInfo').mockResolvedValue({apps:{620:{appinfo:{common:{name:'Portal 2'}}}}} as any);
    vi.spyOn(client,'gamesPlayed').mockImplementation(()=>{});
    await account.addGame(620);
    expect(account.getState().library).toEqual([{appid:620,name:'Portal 2',playtimeMinutes:0}]);
    expect(account.getState().queue).toEqual([[620]]);
    expect(config.accounts[0]!.manualGames).toEqual([{appid:620,name:'Portal 2'}]);
    await expect(account.addGame(620)).rejects.toThrow('GAME_EXISTS');
    client.getProductInfo.mockResolvedValue({apps:{}});
    await expect(account.addGame(999999)).rejects.toThrow('GAME_NOT_FOUND');
    expect(account.getState().library).toHaveLength(1);
  });
  it("signs out, clears saved credentials and ignores late refresh tokens",async()=>{
    const directory=mkdtempSync(join(tmpdir(),'hourforge-logout-'));
    try{
      const config=ConfigSchema.parse({accounts:[{name:'logout',games:[730],accountName:'user',password:'secret',sharedSecret:'shared'}],settings:{dataDirectory:directory}});
      const account=new SteamAccount(config.accounts[0]!,config.settings),client=(account as any).client;
      vi.spyOn(client,'gamesPlayed').mockImplementation(()=>{});vi.spyOn(client,'logOff').mockImplementation(()=>{});
      await account.logout();client.emit('refreshToken','late-sensitive-token');
      expect(account.getState().status).toBe('offline');expect(account.getState().steamId).toBeNull();
      expect(config.accounts[0]!.password).toBeUndefined();expect(config.accounts[0]!.sharedSecret).toBeUndefined();
      expect(config.accounts[0]!.loginMethod).toBe('credentials');
      const token=join(directory,'tokens','logout.txt');
      expect(!existsSync(token)||readFileSync(token,'utf8')==='').toBe(true);
      expect(persistTokenMock).not.toHaveBeenCalledWith(expect.anything(),'late-sensitive-token',expect.anything());
    }finally{rmSync(directory,{recursive:true,force:true});}
  });
  it("keeps priority games running across rotations", async () => {
    const config = ConfigSchema.parse({ accounts: [{ name: "priority", games: ["ALL"], priorityGames: [730, 271590], loginMethod: "qr" }] });
    const account = new SteamAccount(config.accounts[0]!, config.settings);
    const client = (account as any).client;
    client.steamID = { getSteamID64: () => "76561198000000000" };
    vi.spyOn(client, "getUserOwnedApps").mockResolvedValue({ apps: [730,271590,...Array.from({length:35},(_,i)=>i+1)].map(appid=>({appid})), app_count:37 });
    vi.spyOn(client,"setPersona").mockImplementation(()=>{});
    vi.spyOn(client,"gamesPlayed").mockImplementation(()=>{});
    client.emit("loggedOn");await new Promise(resolve=>setImmediate(resolve));
    expect(account.getState().gamesPlaying).toHaveLength(32);
    expect(account.getState().gamesPlaying.slice(0,2)).toEqual([730,271590]);
    expect(account.getState().nextGames).toEqual([730,271590,31,32,33,34,35]);
    account.nextBatch();
    expect(account.getState().gamesPlaying).toEqual([730,271590,31,32,33,34,35]);
    expect(()=>account.setPreferences({label:'Main',priorityGames:[999999],rotationMinutes:30})).toThrow('PRIORITY_NOT_OWNED');
  });
  it("shows a QR image and cancels a pending login when disconnected",async()=>{
    const config=ConfigSchema.parse({accounts:[{name:'qr',games:['ALL'],loginMethod:'qr'}]});
    const account=new SteamAccount(config.accounts[0]!,config.settings);
    const client=(account as any).client;
    vi.spyOn(client,'gamesPlayed').mockImplementation(()=>{});vi.spyOn(client,'logOff').mockImplementation(()=>{});
    authenticateMock.mockImplementationOnce(async(_config,_data,_timeout,options)=>{
      await options.onQR('https://s.team/q/test');
      return new Promise((_,reject)=>options.signal.addEventListener('abort',()=>reject(new Error('LOGIN_CANCELLED')),{once:true}));
    });
    const starting=account.start();
    await vi.waitFor(()=>expect(account.getState().qrCode).toMatch(/^data:image\/png;base64,/));
    await account.stop();await starting;client.emit('disconnected',0,'Stopped');
    expect(account.getState().status).toBe('offline');expect(account.getState().qrCode).toBeNull();
    expect(account.getState().enabled).toBe(false);
  });
  it("keeps a manual pause when Steam reports that another game has closed", () => {
    const config = ConfigSchema.parse({ accounts: [{ name: "main", games: [730], loginMethod: "qr" }] });
    const account = new SteamAccount(config.accounts[0]!, config.settings);
    const client = (account as any).client;
    vi.spyOn(client, "gamesPlayed").mockImplementation(() => {});
    account.pause();
    client.emit("playingState", false);
    expect(account.getState().manualPaused).toBe(true);
    expect(account.getState().status).toBe("paused");
    expect(account.getState().isPaused).toBe(true);
    account.resume();
    expect(account.getState().isPaused).toBe(false);
  });
  it("does not resume farming while another Steam session is playing", () => {
    const config = ConfigSchema.parse({ accounts: [{ name: "main", games: [730], loginMethod: "qr" }] });
    const account = new SteamAccount(config.accounts[0]!, config.settings);
    const client = (account as any).client;
    vi.spyOn(client, "gamesPlayed").mockImplementation(() => {});
    client.emit("playingState", true);
    account.pause();
    account.resume();
    expect(account.getState().status).toBe("paused");
    expect(account.getState().isPaused).toBe(true);
    expect(account.getState().manualPaused).toBe(false);
  });
  it("loads the owned library before farming in ALL mode", async () => {
    const config = ConfigSchema.parse({ accounts: [{ name: "all", games: [730, "ALL"], loginMethod: "qr" }] });
    const account = new SteamAccount(config.accounts[0]!, config.settings);
    const client = (account as any).client;
    client.steamID = { getSteamID64: () => "76561198000000000" };
    vi.spyOn(client, "getUserOwnedApps").mockResolvedValue({ apps: [{ appid: 440 }, { appid: 730 }], app_count: 2 });
    vi.spyOn(client, "setPersona").mockImplementation(() => {});
    vi.spyOn(client, "gamesPlayed").mockImplementation(() => {});
    client.emit("loggedOn");
    await new Promise(resolve => setImmediate(resolve));
    expect(account.getState().gamesPlaying).toEqual([730, 440]);
    expect(account.getState().status).toBe("farming");
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("skips a timed-out QR account for the rest of the run", async () => {
    vi.useFakeTimers();
    const config = ConfigSchema.parse({
      accounts: [{ name: "main", games: [440], loginMethod: "qr" }],
      settings: { logOnIntervalMs: 10, qrLoginTimeoutMs: 1_000 },
    });
    const account = new SteamAccount(config.accounts[0]!, config.settings);
    authenticateMock.mockRejectedValue(new QRLoginTimeoutError(config.settings.qrLoginTimeoutMs));

    await account.start();

    expect(authenticateMock).toHaveBeenCalledOnce();
    expect(authenticateMock).toHaveBeenCalledWith(
      config.accounts[0],
      config.settings.dataDirectory,
      1_000,
      expect.objectContaining({ signal: expect.any(AbortSignal), onQR: expect.any(Function) }),
    );
    expect(account.getState().status).toBe("skipped");

    await vi.advanceTimersByTimeAsync(100);

    expect(authenticateMock).toHaveBeenCalledOnce();
    await account.stop();
  });

  it("initializes steamAccountName from saved token while preserving configured account name", () => {
    readSavedTokenMock.mockReturnValue({
      refreshToken: "token-abc",
      accountName: "Alden",
    });

    const config = ConfigSchema.parse({
      accounts: [{ name: "main", games: [1623730], loginMethod: "qr" }],
    });
    const account = new SteamAccount(config.accounts[0]!, config.settings);

    const state = account.getState();
    expect(state.name).toBe("main");
    expect(state.steamAccountName).toBe("Alden");
  });

  it("keeps a display name separate from the real Steam login name", () => {
    const config = ConfigSchema.parse({
      accounts: [{ name: "alt", games: [1623730], loginMethod: "qr" }],
    });
    const account = new SteamAccount(config.accounts[0]!, config.settings);

    // Simulate client accountInfo event
    (account as unknown as { client: { emit: (event: string, ...args: unknown[]) => void } }).client.emit(
      "accountInfo",
      "TestAcc",
    );

    const state = account.getState();
    expect(state.name).toBe("alt");
    expect(state.steamAccountName).toBe("Alden");
    expect(state.displayName).toBe("TestAcc");
  });

  it("skips logon when claimCheck detects duplicate active Steam account", async () => {
    readSavedTokenMock.mockReturnValue({
      refreshToken: "token-abc",
      accountName: "Alden",
    });

    const config = ConfigSchema.parse({
      accounts: [{ name: "alt", games: [1623730], loginMethod: "qr" }],
    });

    const claimCheck = vi.fn((_id: string | null, name: string | null) =>
      name === "Alden" ? "main" : null,
    );
    const account = new SteamAccount(config.accounts[0]!, config.settings, claimCheck);

    await account.start();

    expect(account.getState().status).toBe("skipped");
    expect(account.getState().lastError).toContain("Duplicate session of [main]");
    await account.stop();
  });
});
