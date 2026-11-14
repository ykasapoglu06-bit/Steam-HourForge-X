import { afterEach, beforeEach, expect, it, vi } from "vitest";
import SteamUser from 'steam-user';
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AccountManager } from "../src/manager.js";
import { SteamAccount } from "../src/account.js";
import { ConfigSchema } from "../src/config.js";
const folders: string[]=[];
it('stops every account on app exit without deleting settings or saved entries',async()=>{
 const path=folder(),file=join(path,'config.json'),config=ConfigSchema.parse({accounts:[{name:'first',games:['ALL']},{name:'second',games:['ALL']}],settings:{dataDirectory:join(path,'data')}}),manager=new AccountManager(config,file);
 const accounts=(manager as any).accounts as SteamAccount[];
 const first=vi.spyOn(accounts[0]!,'shutdown').mockRejectedValue(new Error('fixture failure')),second=vi.spyOn(accounts[1]!,'shutdown').mockResolvedValue();
 const before=readFileSync(file,'utf8');await expect(manager.stopAll()).rejects.toThrow('ACCOUNT_SHUTDOWN_FAILED');
 expect(first).toHaveBeenCalledOnce();expect(second).toHaveBeenCalledOnce();expect(readFileSync(file,'utf8')).toBe(before);
 await expect(manager.control('first','start')).rejects.toThrow('APP_SHUTTING_DOWN');expect(()=>manager.addAccount('Late')).toThrow('APP_SHUTTING_DOWN');
});
it('rejects a duplicate resolved QR identity before Steam logOn, ignoring display names',()=>{
 const path=folder(),config=ConfigSchema.parse({accounts:[{name:'first',games:['ALL']},{name:'second',games:['ALL']}],settings:{dataDirectory:join(path,'data')}}),manager=new AccountManager(config,join(path,'config.json'));
 const [first,second]=(manager as any).accounts;
 Object.assign(first.state,{status:'farming',steamAccountName:'RealLogin',displayName:'Shared display name',steamId:'76561198000000000'});
 expect(second.claimCheck(null,'reallogin')).toBe(first.state.label);
 expect(second.claimCheck(null,'Shared display name')).toBeNull();
 first.state.status='offline';expect(second.claimCheck(null,'RealLogin')).toBeNull();
});
it('rejects duplicate Steam usernames before changing saved accounts',async()=>{
 const path=folder(),file=join(path,'config.json'),config=ConfigSchema.parse({accounts:[{name:'first',accountName:'Player',games:['ALL']},{name:'second',games:['ALL']}],settings:{dataDirectory:join(path,'data')}});
 const manager=new AccountManager(config,file),begin=vi.spyOn(SteamAccount.prototype,'beginLogin').mockResolvedValue();
 await expect(manager.login('second',{method:'credentials',accountName:' player ',password:'test'})).rejects.toThrow('ACCOUNT_LOGIN_EXISTS');
 expect(begin).not.toHaveBeenCalled();expect(()=>ConfigSchema.parse(JSON.parse(readFileSync(file,'utf8')))).not.toThrow();
});
it('blocks removal while an admitted login is still changing account lifecycle',async()=>{
 const path=folder(),config=ConfigSchema.parse({accounts:[{name:'main',games:['ALL']}],settings:{dataDirectory:join(path,'data')}}),manager=new AccountManager(config,join(path,'config.json'));
 let release!:()=>void;vi.spyOn(SteamAccount.prototype,'beginLogin').mockImplementation(()=>new Promise<void>(resolve=>release=resolve));
 const logout=vi.spyOn(SteamAccount.prototype,'logout').mockResolvedValue();
 const login=manager.login('main',{method:'credentials',accountName:'player',password:'test'});
 const removal=expect(manager.removeAccount('main')).rejects.toThrow('REQUEST_BUSY');
 release();await login;await removal;expect(logout).not.toHaveBeenCalled();expect(manager.count).toBe(1);
});
it('reserves usernames across simultaneous sign-ins on different cards',async()=>{
 const path=folder(),config=ConfigSchema.parse({accounts:[{name:'first',games:['ALL']},{name:'second',games:['ALL']}],settings:{dataDirectory:join(path,'data')}}),manager=new AccountManager(config,join(path,'config.json'));
 let release!:()=>void;vi.spyOn(SteamAccount.prototype,'beginLogin').mockImplementation(()=>new Promise<void>(resolve=>{if(!release)release=resolve;else resolve();}));
 const first=manager.login('first',{method:'credentials',accountName:'player',password:'test'});
 const second=expect(manager.login('second',{method:'credentials',accountName:'PLAYER',password:'test'})).rejects.toThrow('ACCOUNT_LOGIN_EXISTS');
 // Release the first attempt before checking both outcomes.
 release();await Promise.all([first,second]);
});
it('remembers that a previously disconnected account was enabled by a new sign-in',async()=>{
 const path=folder(),file=join(path,'config.json'),config=ConfigSchema.parse({accounts:[{name:'main',games:['ALL'],enabled:false}],settings:{dataDirectory:join(path,'data')}});
 const manager=new AccountManager(config,file);vi.spyOn(SteamAccount.prototype,'beginLogin').mockResolvedValue();
 await manager.login('main',{method:'credentials',accountName:'user',password:'private-login-password'});
 const saved=readFileSync(file,'utf8');expect(JSON.parse(saved).accounts[0].enabled).toBe(true);expect(saved).not.toContain('private-login-password');
});
it('removes only the selected local account, clears its login and allows an empty saved list',async()=>{
  const path=folder(),file=join(path,'config.json');
  const config=ConfigSchema.parse({accounts:[{name:'first',games:['ALL'],loginMethod:'credentials'},{name:'second',games:['ALL'],loginMethod:'credentials'}],settings:{dataDirectory:join(path,'data')}});
  const manager=new AccountManager(config,file),internal=(manager as any).accounts as SteamAccount[];
  const logout=vi.spyOn(internal[1]!,'logout').mockResolvedValue();
  await manager.removeAccount('second');expect(logout).toHaveBeenCalledOnce();
  expect(manager.getStates().map(a=>a.name)).toEqual(['first']);expect(JSON.parse(readFileSync(file,'utf8')).accounts).toHaveLength(1);
  vi.spyOn(internal[0]!,'logout').mockResolvedValue();await manager.removeAccount('first');
  expect(manager.getStates()).toEqual([]);expect(()=>ConfigSchema.parse(JSON.parse(readFileSync(file,'utf8')))).not.toThrow();
  expect(new AccountManager(ConfigSchema.parse(JSON.parse(readFileSync(file,'utf8'))),file).count).toBe(0);
});
it('blocks removing an account during an achievement operation',async()=>{
 const path=folder(),config=ConfigSchema.parse({accounts:[{name:'main',games:['ALL']}],settings:{dataDirectory:join(path,'data')}}),manager=new AccountManager(config,join(path,'config.json'));
 (manager.getStates()[0] as any).samBusy=true;
 await expect(manager.removeAccount('main')).rejects.toThrow('REQUEST_BUSY');expect(manager.count).toBe(1);
});
beforeEach(()=>{vi.spyOn(SteamUser.prototype,'getPersonas').mockResolvedValue({personas:{}});});
function folder(){const path=mkdtempSync(join(tmpdir(),'hourloom-test-'));folders.push(path);return path;}
afterEach(()=>{vi.restoreAllMocks();for(const path of folders.splice(0))rmSync(path,{recursive:true,force:true});});

it("starts other accounts while one account is waiting for QR approval", async()=>{
  const path=folder();const started:string[]=[];let release!:()=>void;
  vi.spyOn(SteamAccount.prototype,'start').mockImplementation(function(this:SteamAccount){started.push(this.getState().name);return this.getState().name==='main'?new Promise<void>(resolve=>release=resolve):Promise.resolve();});
  const config=ConfigSchema.parse({accounts:[{name:'main',games:['ALL'],loginMethod:'qr'},{name:'second',games:['ALL'],loginMethod:'qr'}],settings:{dataDirectory:join(path,'data')}});
  const manager=new AccountManager(config,join(path,'config.json'));
  const starting=manager.startAll();expect(started).toEqual(['main','second']);release();await starting;
});

it("persists new accounts and per-account priorities without exposing credentials",async()=>{
  const path=folder();vi.spyOn(SteamAccount.prototype,'start').mockResolvedValue();
  const config=ConfigSchema.parse({accounts:[{name:'main',label:'Main',games:['ALL'],password:'private-password',loginMethod:'qr'}],settings:{dataDirectory:join(path,'data')}});
  const file=join(path,'config.json');const manager=new AccountManager(config,file);
  const second=manager.addAccount('Second');
  manager.getStates()[0]!.library.push({appid:730,name:'CS2',playtimeMinutes:0});
  manager.updatePreferences('main',{label:'Main',priorityGames:[730],rotationMinutes:15});
  expect(manager.getStates().find(account=>account.name===second)?.priorityGames).toEqual([]);
  const saved=JSON.parse(readFileSync(file,'utf8'));
  expect(saved.accounts[0].priorityGames).toEqual([730]);expect(saved.accounts[0].rotationMinutes).toBe(15);
  expect(saved.accounts[1].name).toMatch(/^account-[a-f0-9-]+$/);
  expect(JSON.stringify(manager.getStates())).not.toContain('private-password');
  expect(()=>manager.addAccount('Second')).toThrow('LABEL_EXISTS');
});

it("allows equal display names on different Steam IDs but rejects duplicate Steam sessions",()=>{
  const path=folder();
  const config=ConfigSchema.parse({accounts:[{name:'first',games:[730]},{name:'second',games:[440]}],settings:{dataDirectory:join(path,'data')}});
  const manager=new AccountManager(config,join(path,'config.json'));
  const internal=(manager as any).accounts as SteamAccount[];
  internal.forEach((account,i)=>{
    const client=(account as any).client;
    client.steamID={getSteamID64:()=>i===0?'76561198000000001':'76561198000000002'};
    vi.spyOn(client,'setPersona').mockImplementation(()=>{});vi.spyOn(client,'gamesPlayed').mockImplementation(()=>{});vi.spyOn(client,'logOff').mockImplementation(()=>{});
    client.emit('accountInfo','Same display name');client.emit('loggedOn');
  });
  expect(manager.getStates().map(state=>state.status)).toEqual(['farming','farming']);
  const second=(internal[1] as any).client;second.steamID={getSteamID64:()=> '76561198000000001'};second.emit('loggedOn');
  expect(manager.getStates()[1]!.status).toBe('skipped');
});

it('keeps failed account creation out of memory and disk and allows retry',()=>{
 const path=folder(),file=join(path,'config.json'),config=ConfigSchema.parse({accounts:[],settings:{dataDirectory:join(path,'data')}}),manager=new AccountManager(config,file);
 const before=readFileSync(file,'utf8'),start=vi.spyOn(SteamAccount.prototype,'start').mockResolvedValue();
 vi.spyOn(manager as any,'save').mockImplementationOnce(()=>{throw new Error('CONFIG_SAVE_FAILED');});
 expect(()=>manager.addAccount('New')).toThrow('CONFIG_SAVE_FAILED');expect(manager.count).toBe(0);expect(config.accounts).toHaveLength(0);expect(readFileSync(file,'utf8')).toBe(before);expect(start).not.toHaveBeenCalled();
 manager.addAccount('New');expect(manager.count).toBe(1);expect(JSON.parse(readFileSync(file,'utf8')).accounts).toHaveLength(1);
});
it('does not apply preferences when saving the configuration fails',()=>{
 const path=folder(),file=join(path,'config.json'),config=ConfigSchema.parse({accounts:[{name:'main',label:'Before',games:['ALL']}],settings:{dataDirectory:join(path,'data')}}),manager=new AccountManager(config,file);
 manager.getStates()[0]!.library.push({appid:620,name:'Demo',playtimeMinutes:0});const before=readFileSync(file,'utf8');
 vi.spyOn(manager as any,'save').mockImplementationOnce(()=>{throw new Error('CONFIG_SAVE_FAILED');});
 const input={label:'After',priorityGames:[620],rotationMinutes:15};
 expect(()=>manager.updatePreferences('main',input)).toThrow('CONFIG_SAVE_FAILED');expect(manager.getStates()[0]).toMatchObject({label:'Before',priorityGames:[],rotationMinutes:30});expect(config.accounts[0]).toMatchObject({label:'Before',priorityGames:[],rotationMinutes:30});expect(readFileSync(file,'utf8')).toBe(before);
 manager.updatePreferences('main',input);expect(manager.getStates()[0]).toMatchObject(input);expect(JSON.parse(readFileSync(file,'utf8')).accounts[0]).toMatchObject(input);
});

it('keeps mode and manually added games unchanged if persistence fails',async()=>{
 const path=folder(),file=join(path,'config.json'),config=ConfigSchema.parse({accounts:[{name:'main',games:['ALL']}],settings:{dataDirectory:join(path,'data')}}),manager=new AccountManager(config,file);
 const account=(manager as any).accounts[0],internal=account as any;internal.stopped=false;internal.state.connectedSince=123;
 vi.spyOn(internal.client,'getProductInfo').mockResolvedValue({apps:{620:{appinfo:{common:{name:'Demo'}}}}});
 const before=readFileSync(file,'utf8'),save=vi.spyOn(manager as any,'save').mockImplementationOnce(()=>{throw new Error('CONFIG_SAVE_FAILED');});
 await expect(manager.control('main','fixed')).rejects.toThrow('CONFIG_SAVE_FAILED');expect(manager.getStates()[0]!.mode).toBe('hours');expect(config.accounts[0]!.farmingMode).toBe('hours');expect(readFileSync(file,'utf8')).toBe(before);
 save.mockImplementationOnce(()=>{throw new Error('CONFIG_SAVE_FAILED');});await expect(manager.addGame('main',620)).rejects.toThrow('CONFIG_SAVE_FAILED');expect(manager.getStates()[0]!.library).toHaveLength(0);expect(config.accounts[0]!.manualGames).toHaveLength(0);expect(readFileSync(file,'utf8')).toBe(before);
 await manager.addGame('main',620);await manager.control('main','fixed');expect(JSON.parse(readFileSync(file,'utf8')).accounts[0]).toMatchObject({manualGames:[{appid:620,name:'Demo'}],farmingMode:'fixed'});
});

it('reports a real configuration write failure without publishing the new account',async()=>{
 const {mkdirSync}=await import('node:fs');const path=folder(),file=join(path,'config.json'),config=ConfigSchema.parse({accounts:[],settings:{dataDirectory:join(path,'data')}}),manager=new AccountManager(config,file);
 const before=readFileSync(file,'utf8');mkdirSync(file+'.tmp');
 expect(()=>manager.addAccount('Blocked')).toThrow('CONFIG_SAVE_FAILED');expect(manager.count).toBe(0);expect(readFileSync(file,'utf8')).toBe(before);expect(config.accounts).toHaveLength(0);
});
