import { afterEach, beforeEach, expect, it, vi } from "vitest";
import SteamUser from 'steam-user';
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AccountManager } from "../src/manager.js";
import { SteamAccount } from "../src/account.js";
import { ConfigSchema } from "../src/config.js";
const folders: string[]=[];
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
