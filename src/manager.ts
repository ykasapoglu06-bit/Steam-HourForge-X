import { SteamAccount, type AccountState, type ClaimConflictCheck } from "./account.js";
import { AccountSchema, AccountPreferencesSchema, type AppConfig, type AccountConfig } from "./config.js";
import { log } from "./logger.js";
import { writeFileSync, renameSync, appendFileSync, mkdirSync, existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { SamService, runSam } from './sam.js';
import { join } from 'node:path';

export class AccountManager {
  private sam:SamService;
  private accounts: SteamAccount[] = [];
  private lifecycleBusy=new Set<string>();
  private pendingLogins=new Map<string,string>();
  constructor(private config: AppConfig, private configPath = "config.json") {
    this.sam=new SamService(runSam,Date.now,entry=>{
      mkdirSync(config.settings.dataDirectory,{recursive:true});
      appendFileSync(join(config.settings.dataDirectory,'achievement-actions.jsonl'),JSON.stringify(entry)+'\n');
    });
    for (const account of config.accounts) this.accounts.push(this.createAccount(account));
    if(!existsSync(this.configPath))this.save();
    log.info({ accounts: this.accounts.length }, "Accounts loaded");
  }
  private createAccount(config: AccountConfig): SteamAccount {
    let account: SteamAccount;
    const claimCheck: ClaimConflictCheck = (steamId, steamName) => {
      for (const other of this.accounts) {
        if (other === account) continue;
        const state = other.getState();
        if (["offline", "skipped", "error"].includes(state.status)) continue;
        if (steamId && steamId === state.steamId) return state.label;
        if (steamName && state.steamAccountName?.toLowerCase() === steamName.toLowerCase()) return state.label;
      }
      return null;
    };
    account = new SteamAccount(config, this.config.settings, claimCheck);
    return account;
  }
  private save(): void {
    writeFileSync(this.configPath + ".tmp", JSON.stringify(this.config, null, 2));
    renameSync(this.configPath + ".tmp", this.configPath);
  }
  async startAll(): Promise<void> {
    await Promise.all(this.accounts.filter(account => this.config.accounts.find(config => config.name === account.getState().name)?.enabled).map(account => account.start()));
  }
  async stopAll(): Promise<void> { await Promise.all(this.accounts.map(account => account.stop())); }
  getStates(): Readonly<AccountState>[] { return this.accounts.map(account => account.getState()); }
  private find(name: string): SteamAccount {
    if(this.lifecycleBusy.has(name))throw new Error('REQUEST_BUSY');
    const account = this.accounts.find(item => item.getState().name === name);
    if (!account) throw new Error("ACCOUNT_NOT_FOUND");
    return account;
  }
  addAccount(label: string): string {
    const parsed = AccountPreferencesSchema.shape.label.parse(label);
    if (this.accounts.length >= 20) throw new Error("ACCOUNT_LIMIT");
    if (this.accounts.some(account => account.getState().label.toLowerCase() === parsed.toLowerCase())) throw new Error("LABEL_EXISTS");
    const config = AccountSchema.parse({ name: "account-" + randomUUID().slice(0, 8), label: parsed, games: ["ALL"], loginMethod: "credentials", farmingMode: "hours" });
    const account = this.createAccount(config);
    this.config.accounts.push(config);
    this.accounts.push(account);
    this.save();
    void account.start().catch(() => log.warn({ account: config.name }, "Could not start account"));
    return config.name;
  }
  async removeAccount(name:string):Promise<void>{
    const account=this.find(name);
    if(account.getState().samBusy)throw new Error('REQUEST_BUSY');
    this.lifecycleBusy.add(name);
    try{
      await account.logout();this.sam.invalidate(name);
      const next={...this.config,accounts:this.config.accounts.filter(item=>item.name!==name)};
      writeFileSync(this.configPath+'.tmp',JSON.stringify(next,null,2));renameSync(this.configPath+'.tmp',this.configPath);
      this.config.accounts=next.accounts;
      this.accounts=this.accounts.filter(item=>item!==account);account.removeAllListeners();
    }finally{this.lifecycleBusy.delete(name);}
  }
  updatePreferences(name: string, input: unknown): void {
    const preferences = AccountPreferencesSchema.parse(input);
    if (this.accounts.some(account => account.getState().name !== name && account.getState().label.toLowerCase() === preferences.label.toLowerCase())) throw new Error("LABEL_EXISTS");
    this.find(name).setPreferences(preferences);
    this.save();
  }
  async lookupProfile(name: string, profile: string) { return this.find(name).lookupProfile(profile); }
  async login(name:string,input:unknown){
    const account=this.find(name);
    const data=input as Record<string,unknown>;
    if(data.method!=='credentials'&&data.method!=='qr')throw new Error('INVALID_SETTINGS');
    if(data.method==='credentials'){
      if(typeof data.accountName!=='string'||!data.accountName.trim()||data.accountName.length>64||/[\x00-\x1f]/.test(data.accountName)||typeof data.password!=='string'||!data.password||data.password.length>256)throw new Error('AUTH_INVALID_INPUT');
      const normalized=data.accountName.trim().toLowerCase();
      if(this.config.accounts.some(item=>item.name!==name&&item.accountName?.toLowerCase()===normalized)||[...this.pendingLogins].some(([other,user])=>other!==name&&user===normalized))throw new Error('ACCOUNT_LOGIN_EXISTS');
      this.pendingLogins.set(name,normalized);
    }
    this.lifecycleBusy.add(name);
    try{
      if(data.method==='credentials')await account.beginLogin('credentials',{accountName:(data.accountName as string).trim(),password:data.password as string});
      else await account.beginLogin('qr');
      this.config.accounts.find(item=>item.name===name)!.enabled=true;
      this.save();
    }finally{this.pendingLogins.delete(name);this.lifecycleBusy.delete(name);}
  }
  async guard(name:string,code:unknown){if(typeof code!=='string'||! /^[a-zA-Z0-9]{5,8}$/.test(code))throw new Error('AUTH_GUARD_INVALID');await this.find(name).submitGuardCode(code);}
  async addGame(name:string,appid:number){await this.find(name).addGame(appid);this.save();}
  async achievements(name:string,appid:number){
    const account=this.find(name);
    if(process.platform!=='win32')return account.achievementsFor(appid);
    try{return await account.desktopAchievements(appid,steamId=>this.sam.inspect(steamId,appid));}catch(error){
      const code=error instanceof Error?error.message:'';
      if(!['SAM_STEAM_OFFLINE','SAM_UNAVAILABLE','SAM_ACCOUNT_MISMATCH'].includes(code))throw error;
      try{return await account.achievementsFor(appid);}catch{throw error;}
    }
  }
  async previewAchievements(name:string,appid:number){return this.find(name).desktopAchievements(appid,steamId=>this.sam.preview(name,steamId,appid));}
  async completeAchievements(name:string,appid:number,nonce:string,confirmed:boolean,ids?:string[]){return this.find(name).desktopAchievements(appid,steamId=>this.sam.complete(name,steamId,appid,nonce,confirmed,ids));}
  async control(name: string, action: string): Promise<void> {
    if (name === "*") {
      if (!["pause", "resume"].includes(action)) throw new Error("INVALID_ACTION");
      for (const account of this.accounts) action === "pause" ? account.pause() : account.resume();
      return;
    }
    const account = this.find(name);
    const config = this.config.accounts.find(item => item.name === name)!;
    const lifecycleAction=['stop','logout','start'].includes(action);
    if(lifecycleAction){
      if(account.getState().samBusy)throw new Error('REQUEST_BUSY');
      this.sam.invalidate(name);
      this.lifecycleBusy.add(name);
    }
    try{
    switch (action) {
      case "pause": account.pause(); break;
      case "resume": account.resume(); break;
      case "next": account.nextBatch(); break;
      case "refreshCards": await account.checkCards(); break;
      case "refreshLibrary": await account.refreshLibrary(); break;
      case "stop": config.enabled = false; await account.stop(); this.save(); break;
      case "logout": config.enabled = false; await account.logout(); this.save(); break;
      case "start":
        if(!['offline','error','skipped'].includes(account.getState().status))return;
        await account.stop();config.enabled = true; this.save();
        void account.start().catch(() => log.warn({ account: name }, "Could not start account")); break;
      case "hours": case "cards": account.setMode(action); this.save(); break;
      default: throw new Error("INVALID_ACTION");
    }
    }finally{if(lifecycleAction)this.lifecycleBusy.delete(name);}
  }
  onStateChange(handler: (state: AccountState) => void): void { for (const account of this.accounts) account.on("stateChange", handler); }
  get count(): number { return this.accounts.length; }
}
