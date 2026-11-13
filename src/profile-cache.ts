import { readFileSync, writeFileSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

export interface PublicProfile { steamId:string|null; displayName:string|null; avatarUrl:string|null; vanityUrl:string|null }
export const emptyProfile=():PublicProfile=>({steamId:null,displayName:null,avatarUrl:null,vanityUrl:null});
export function safeAvatar(raw:unknown):string|null {
  try { const u=new URL(String(raw));return u.protocol==='https:'&&!u.username&&!u.password&&['steamcdn-a.akamaihd.net','avatars.steamstatic.com','avatars.fastly.steamstatic.com','avatars.akamai.steamstatic.com'].includes(u.hostname)?u.href:null; } catch { return null; }
}
export function safeVanity(raw:unknown):string|null {return typeof raw==='string'&&/^[a-zA-Z0-9_-]{1,64}$/.test(raw)?raw:null;}
function location(directory:string,name:string){return join(directory,'profiles',createHash('sha256').update(name).digest('hex')+'.json');}
export function readProfile(directory:string,name:string):PublicProfile {
  try {const p=JSON.parse(readFileSync(location(directory,name),'utf8'));if(!/^7656119\d{10}$/.test(p.steamId))return emptyProfile();return {steamId:p.steamId,displayName:typeof p.displayName==='string'?p.displayName.slice(0,128):null,avatarUrl:safeAvatar(p.avatarUrl),vanityUrl:safeVanity(p.vanityUrl)};}catch{return emptyProfile();}
}
export function saveProfile(directory:string,name:string,profile:PublicProfile){
  const file=location(directory,name);mkdirSync(join(directory,'profiles'),{recursive:true});
  const value={steamId:profile.steamId,displayName:profile.displayName,avatarUrl:safeAvatar(profile.avatarUrl),vanityUrl:safeVanity(profile.vanityUrl)};
  writeFileSync(file+'.tmp',JSON.stringify(value));renameSync(file+'.tmp',file);
}
export function clearProfile(directory:string,name:string){rmSync(location(directory,name),{force:true});}
