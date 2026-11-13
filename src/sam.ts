import { execFile } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const Row=z.object({id:z.string().min(1).max(1024),name:z.string().max(2000),unlocked:z.boolean()});
const Result=z.object({steamId:z.string().regex(/^\d{17}$/),appid:z.number().int().positive(),unlocked:z.number().int().nonnegative(),total:z.number().int().min(0).max(10000),achievements:z.array(Row).max(10000),completed:z.number().int().nonnegative().optional(),rejected:z.number().int().nonnegative().optional(),stored:z.boolean().optional()});
export type SamResult=z.infer<typeof Result>;
export interface SamRequest {operation:'inspect'|'complete';appid:number;steamId:string;ids?:string[]}
export type SamRunner=(request:SamRequest)=>Promise<SamResult>;

export async function runSam(request:SamRequest):Promise<SamResult>{
  if(process.platform!=='win32')throw new Error('SAM_WINDOWS_ONLY');
  const folder=fileURLToPath(new URL('../native/sam/',import.meta.url));
  try{
    const hash=createHash('sha256').update(readFileSync(folder+'SAM.API.dll')).digest('hex');
    if(hash!=='26e596ec9618716f2dba81d187af821dde15e97acbd2d4c9d3847b2b5cfb104f')throw Error();
  }catch{throw new Error('SAM_UNAVAILABLE');}
  return new Promise((resolve,reject)=>{
    const child=execFile(folder+'HourForge.Achievements.exe',[],{cwd:folder,windowsHide:true,timeout:65_000,maxBuffer:4_000_000,encoding:'utf8'},(error,stdout)=>{
      try{
        const response=JSON.parse(stdout.replace(/^\uFEFF/, '').trim());
        if(typeof response.error==='string'&&/^SAM_[A-Z_]+$/.test(response.error))return reject(new Error(response.error));
        if(error)throw error;
        resolve(Result.parse(response));
      }catch{reject(new Error('SAM_UNAVAILABLE'));}
    });
    child.stdin?.on('error',()=>{});
    child.stdin?.end(JSON.stringify(request));
  });
}

export class SamService {
  private busy=false;
  private previews=new Map<string,{account:string;steamId:string;appid:number;ids:string[];expiresAt:number}>();
  constructor(private runner:SamRunner=runSam,private clock=Date.now,private audit:(entry:unknown)=>void=()=>{}){}
  invalidate(account:string){for(const [nonce,item] of this.previews)if(item.account===account)this.previews.delete(nonce);}
  private async run(request:SamRequest){
    if(this.busy)throw new Error('REQUEST_BUSY');this.busy=true;
    try{
      const result=Result.parse(await this.runner(request));
      if(result.steamId!==request.steamId||result.appid!==request.appid)throw new Error('SAM_ACCOUNT_MISMATCH');
      if(result.total!==result.achievements.length||result.unlocked!==result.achievements.filter(row=>row.unlocked).length)throw new Error('SAM_VERIFY_FAILED');
      return result;
    }finally{this.busy=false;}
  }
  async preview(account:string,steamId:string,appid:number){
    for(const [nonce,item]of this.previews)if(item.expiresAt<this.clock())this.previews.delete(nonce);
    const result=await this.run({operation:'inspect',steamId,appid});
    this.invalidate(account);
    const ids=result.achievements.filter(row=>!row.unlocked).map(row=>row.id);
    const nonce=randomBytes(24).toString('hex'),expiresAt=this.clock()+120_000;
    if(ids.length)this.previews.set(nonce,{account,steamId,appid,ids,expiresAt});
    return {...result,nonce:ids.length?nonce:null,expiresAt};
  }
  async complete(account:string,steamId:string,appid:number,nonce:string,confirmed:boolean){
    const item=this.previews.get(nonce);
    if(!confirmed||!item||item.account!==account||item.steamId!==steamId||item.appid!==appid||item.expiresAt<this.clock())throw new Error('SAM_PREVIEW_EXPIRED');
    this.previews.delete(nonce);
    this.audit({event:'before',at:this.clock(),account,steamId,appid,achievementIds:item.ids});
    try{
      const result=await this.run({operation:'complete',steamId,appid,ids:item.ids});
      if(result.stored!==true||result.completed===undefined||result.rejected===undefined)throw new Error('SAM_VERIFY_FAILED');
      this.audit({event:'after',at:this.clock(),account,steamId,appid,unlocked:result.unlocked,total:result.total,completed:result.completed,rejected:result.rejected});
      return result;
    }catch(error){this.audit({event:'unverified',at:this.clock(),account,steamId,appid});throw error;}
  }
}
