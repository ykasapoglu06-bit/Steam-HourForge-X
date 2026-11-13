import {EventEmitter} from 'node:events';
import {afterEach,describe,it,expect,vi} from 'vitest';
import {mkdtempSync,rmSync,existsSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
const mock=vi.hoisted(()=>({session:null as any,start:vi.fn(),submit:vi.fn(),cancel:vi.fn()}));
vi.mock('steam-session',async(importOriginal)=>{
 const original=await importOriginal<typeof import('steam-session')>();
 return {...original,LoginSession:class extends EventEmitter{
   refreshToken='';accountName='test-user';loginTimeout=0;
   constructor(){super();mock.session=this;}
   startWithCredentials=mock.start;submitSteamGuardCode=mock.submit;cancelLoginAttempt=mock.cancel;
 }};
});
import {authenticate} from '../src/auth.js';
import {AccountSchema} from '../src/config.js';
const folders:string[]=[];
const directory=()=>{const d=mkdtempSync(join(tmpdir(),'hourforge-auth-'));folders.push(d);return d;};
const account=()=>AccountSchema.parse({name:'test',games:['ALL'],loginMethod:'credentials',accountName:'test-user',password:'private-password'});
afterEach(()=>{vi.clearAllMocks();for(const f of folders.splice(0))rmSync(f,{recursive:true,force:true});});
describe('credential login lifecycle',()=>{
 it('handles an immediate no-Guard authentication event and saves only the session token',async()=>{
   const dir=directory();mock.start.mockImplementation(async()=>{mock.session.refreshToken='saved-session';mock.session.emit('authenticated');return {actionRequired:false};});
   const result=await authenticate(account(),dir);
   expect(result.refreshToken).toBe('saved-session');
   const saved=readFileSync(join(dir,'tokens','test.txt'),'utf8');expect(saved).toContain('saved-session');expect(saved).not.toContain('private-password');
 });
 it('keeps one session while a Guard code is retried',async()=>{
   mock.start.mockResolvedValue({actionRequired:true,validActions:[{type:2}]});
   mock.submit.mockRejectedValueOnce(Object.assign(new Error('Invalid code'),{eresult:65})).mockImplementationOnce(async()=>{mock.session.refreshToken='verified-session';mock.session.emit('authenticated');});
   let submit:any;const onGuard=vi.fn((_challenge,send)=>{submit=send;});
   const task=authenticate(account(),directory(),120000,{onGuard});
   await vi.waitFor(()=>expect(onGuard).toHaveBeenCalled());
   expect(onGuard.mock.calls[0]![0].methods).toEqual(['email']);
   await expect(submit('WRONG')).rejects.toThrow();await submit('ABCDE');
   expect((await task).refreshToken).toBe('verified-session');expect(mock.start).toHaveBeenCalledOnce();
 });
 it('cancels a pending login without saving a token',async()=>{
   const dir=directory(),abort=new AbortController();mock.start.mockResolvedValue({actionRequired:true,validActions:[{type:3}]});
   const task=authenticate(account(),dir,120000,{signal:abort.signal});const rejected=expect(task).rejects.toThrow('LOGIN_CANCELLED');
   await new Promise(resolve=>setImmediate(resolve));abort.abort();await rejected;
   expect(mock.cancel).toHaveBeenCalled();expect(existsSync(join(dir,'tokens','test.txt'))).toBe(false);
 });
});
