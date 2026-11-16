import {expect,it,vi,afterEach} from 'vitest';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';import {join} from 'node:path';import {tmpdir} from 'node:os';
import {ConfigSchema} from '../src/config.js';import {AccountManager} from '../src/manager.js';import {exportSettings,parseBackup} from '../src/backup.js';
const folders:string[]=[];afterEach(()=>{vi.restoreAllMocks();for(const d of folders.splice(0))rmSync(d,{recursive:true,force:true});});
function setup(){const dir=mkdtempSync(join(tmpdir(),'hourforge-backup-'));folders.push(dir);const file=join(dir,'config.json'),config=ConfigSchema.parse({accounts:[{name:'main',label:'Original',games:['ALL'],password:'secret',sharedSecret:'private',accountName:'private-login'}],settings:{dataDirectory:join(dir,'data')}});return {dir,file,config,manager:new AccountManager(config,file)};}
it('exports only portable settings and rejects secrets, duplicates and unsafe names',()=>{
 const {config}=setup();const backup=exportSettings(config.accounts),text=JSON.stringify(backup);expect(text).not.toContain('secret');expect(text).not.toContain('private');expect(text).not.toContain('accountName');expect(text).not.toContain('enabled');
 expect(()=>parseBackup({...backup,accounts:[{...backup.accounts[0],password:'unexpected'}]})).toThrow('BACKUP_INVALID');expect(()=>parseBackup({...backup,accounts:[backup.accounts[0],backup.accounts[0]]})).toThrow('BACKUP_INVALID');expect(()=>parseBackup({...backup,accounts:[{...backup.accounts[0],name:'../tokens'}]})).toThrow('BACKUP_INVALID');
});
it('previews without mutation, requires confirmation and refuses live account replacement',async()=>{
 const {manager,file}=setup();const backup=manager.backup();backup.accounts[0]!.label='Restored';const before=readFileSync(file,'utf8');expect(manager.previewBackup(backup).accounts[0]).toMatchObject({label:'Restored',exists:true});expect(readFileSync(file,'utf8')).toBe(before);
 await expect(manager.restoreBackup(backup,false)).rejects.toThrow('BACKUP_CONFIRM_REQUIRED');(manager.getStates()[0] as any).status='farming';await expect(manager.restoreBackup(backup,true)).rejects.toThrow('BACKUP_DISCONNECT_REQUIRED');expect(readFileSync(file,'utf8')).toBe(before);
});
it('restores matching settings, keeps sign-in configuration local and adds new entries disconnected',async()=>{
 const {manager,file}=setup();const backup=manager.backup();backup.accounts[0]!.label='Restored';backup.accounts[0]!.manualPaused=true;backup.accounts[0]!.hourGoals={'620':600};backup.accounts.push({...backup.accounts[0]!,name:'new',label:'New'});
 await manager.restoreBackup(backup,true);const saved=JSON.parse(readFileSync(file,'utf8'));expect(saved.accounts[0]).toMatchObject({label:'Restored',password:'secret',accountName:'private-login',manualPaused:true,hourGoals:{620:600}});expect(saved.accounts[1]).toMatchObject({enabled:false,loginMethod:'credentials'});expect(saved.accounts[1].password).toBeUndefined();expect(manager.getStates().map(a=>a.status)).toEqual(['offline','offline']);expect(manager.getStates()[0]!.manualPaused).toBe(true);
});
it('does not apply a backup or call stop when its disk save fails',async()=>{
 const {manager,file}=setup();const before=readFileSync(file,'utf8'),backup=manager.backup();backup.accounts[0]!.label='Failed';const old=(manager as any).accounts[0];const stop=vi.spyOn(old,'stop');vi.spyOn(manager as any,'save').mockImplementationOnce(()=>{throw new Error('CONFIG_SAVE_FAILED');});await expect(manager.restoreBackup(backup,true)).rejects.toThrow('CONFIG_SAVE_FAILED');expect(stop).not.toHaveBeenCalled();expect(manager.getStates()[0]!.label).toBe('Original');expect(readFileSync(file,'utf8')).toBe(before);
});

it('blocks conflicting account operations while reviewed restore is being applied',async()=>{
 const {manager}=setup();const backup=manager.backup(),account=(manager as any).accounts[0];let release!:()=>void;vi.spyOn(account,'stop').mockImplementationOnce(()=>new Promise<void>(resolve=>release=resolve));const task=manager.restoreBackup(backup,true);await expect(manager.control('main','start')).rejects.toThrow('REQUEST_BUSY');expect(()=>manager.addAccount('Late')).toThrow('REQUEST_BUSY');release();await task;expect(()=>manager.previewBackup(backup)).not.toThrow();
});
