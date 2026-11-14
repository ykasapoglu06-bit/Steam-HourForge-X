import { afterEach, expect, it, vi } from "vitest";
import type { Server } from "node:http";
import { startDashboard } from "../src/dashboard.js";
let server: Server;
it('requires local confirmed shutdown, rejects new work and calls shutdown once',async()=>{
 const quit=vi.fn(),control=vi.fn();server=await startDashboard({getStates:()=>[],control} as any,0,quit);
 const url=`http://127.0.0.1:${(server.address() as any).port}`;
 const post=(path:string,body:unknown,origin=url)=>fetch(url+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
 expect((await post('/api/shutdown',{confirmed:true},'https://example.com')).status).toBe(403);
 expect((await post('/api/shutdown',{})).status).toBe(400);expect(quit).not.toHaveBeenCalled();
 expect((await post('/api/shutdown',{confirmed:true})).status).toBe(202);
 expect((await post('/api/shutdown',{confirmed:true})).status).toBe(202);
 expect((await post('/api/control',{name:'main',action:'start'})).status).toBe(503);expect(control).not.toHaveBeenCalled();
 await vi.waitFor(()=>expect(quit).toHaveBeenCalledOnce());
});
it('does not interrupt an in-progress native achievement operation',async()=>{
 const quit=vi.fn();server=await startDashboard({getStates:()=>[{samBusy:true}]} as any,0,quit);
 const url=`http://127.0.0.1:${(server.address() as any).port}`;
 expect((await fetch(url+'/api/shutdown',{method:'POST',headers:{Origin:url,'Content-Type':'application/json'},body:'{"confirmed":true}'})).status).toBe(409);
 expect(quit).not.toHaveBeenCalled();
});
it('requires local origin and explicit confirmation before removing a local account',async()=>{
 const manager={getStates:()=>[],removeAccount:vi.fn()};server=await startDashboard(manager as any,0);const url=`http://127.0.0.1:${(server.address() as any).port}`;
 const post=(origin:string,confirmed?:boolean)=>fetch(url+'/api/remove-account',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({name:'test',confirmed})});
 expect((await post('https://example.com',true)).status).toBe(403);expect((await post(url)).status).toBe(400);expect(manager.removeAccount).not.toHaveBeenCalled();
 expect((await post(url,true)).status).toBe(200);expect(manager.removeAccount).toHaveBeenCalledWith('test');
});

it('keeps credentials and Guard submissions local and never echoes secrets',async()=>{
  const manager={getStates:()=>[],login:vi.fn(),guard:vi.fn()};
  server=await startDashboard(manager as any,0);const url=`http://127.0.0.1:${(server.address() as any).port}`;
  const body={name:'main',method:'credentials',accountName:'user',password:'private-test-password'};
  for(const path of ['/api/login','/api/guard']){
    expect((await fetch(url+path,{method:'POST',headers:{Origin:'https://example.com','Content-Type':'application/json'},body:JSON.stringify(body)})).status).toBe(403);
  }
  expect(manager.login).not.toHaveBeenCalled();expect(manager.guard).not.toHaveBeenCalled();
  const response=await fetch(url+'/api/login',{method:'POST',headers:{Origin:url,'Content-Type':'application/json'},body:JSON.stringify(body)});
  expect(response.status).toBe(202);expect(await response.text()).not.toContain(body.password);
  expect(manager.login).toHaveBeenCalledWith('main',body);
  const code=await fetch(url+'/api/guard',{method:'POST',headers:{Origin:url,'Content-Type':'application/json'},body:JSON.stringify({name:'main',code:'ABCDE'})});
  expect(code.status).toBe(200);expect(manager.guard).toHaveBeenCalledWith('main','ABCDE');
});
afterEach(async () => { if (server) { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); } });
it("serves live state and rejects controls from another website", async () => {
  const manager = { getStates: () => [{ name: "main", status: "farming", gamesPlaying: [730] }], control: vi.fn() };
  server = await startDashboard(manager as any, 0);
  const port = (server.address() as any).port;
  const url = `http://127.0.0.1:${port}`;
  const state = await fetch(url + "/api/status").then(r => r.json());
  expect(state.accounts[0].gamesPlaying).toEqual([730]);
  const bad = await fetch(url + "/api/control", { method: "POST", headers: { Origin: "https://example.com", "Content-Type": "application/json" }, body: JSON.stringify({ name: "main", action: "pause" }) });
  expect(bad.status).toBe(403);
  expect(manager.control).not.toHaveBeenCalled();
  const good = await fetch(url + "/api/control", { method: "POST", headers: { Origin: url, "Content-Type": "application/json" }, body: JSON.stringify({ name: "main", action: "pause" }) });
  expect(good.status).toBe(200);
  expect(manager.control).toHaveBeenCalledWith("main", "pause");
});

it("protects account and preference routes and routes validated requests",async()=>{
  const manager={getStates:()=>[],control:vi.fn(),addAccount:vi.fn().mockReturnValue('account-new'),updatePreferences:vi.fn(),lookupProfile:vi.fn().mockResolvedValue({steamId:'76561198000000000',games:[]})};
  server=await startDashboard(manager as any,0);const port=(server.address() as any).port;const url=`http://127.0.0.1:${port}`;
  for(const route of ['/api/accounts','/api/preferences','/api/profile']){
    const blocked=await fetch(url+route,{method:'POST',headers:{Origin:'https://example.com','Content-Type':'application/json'},body:'{}'});
    expect(blocked.status).toBe(403);
  }
  expect(manager.addAccount).not.toHaveBeenCalled();expect(manager.updatePreferences).not.toHaveBeenCalled();expect(manager.lookupProfile).not.toHaveBeenCalled();
  const post=(route:string,body:unknown)=>fetch(url+route,{method:'POST',headers:{Origin:url,'Content-Type':'application/json'},body:JSON.stringify(body)});
  expect((await post('/api/accounts',{label:'Second'})).status).toBe(201);
  expect(await (await post('/api/profile',{name:'main',profile:'76561198000000000'})).json()).toEqual({steamId:'76561198000000000',games:[]});
  expect((await post('/api/preferences',{name:'main',preferences:{label:'Main',priorityGames:[730],rotationMinutes:15}})).status).toBe(200);
  expect(manager.updatePreferences).toHaveBeenCalledWith('main',{label:'Main',priorityGames:[730],rotationMinutes:15});
  for(const route of ['/api/games','/api/achievements','/api/achievement-preview','/api/achievement-complete']){
    expect((await post(route,{name:'main',appid:'730'})).status).toBe(400);
    expect((await post(route,{name:'main',appid:-1})).status).toBe(400);
    const blocked=await fetch(url+route,{method:'POST',headers:{Origin:'https://example.com','Content-Type':'application/json'},body:JSON.stringify({name:'main',appid:730})});
    expect(blocked.status).toBe(403);
  }
});

it('preserves UTF-8 names split across incoming network chunks',async()=>{
 const {request}=await import('node:http');
 const manager={getStates:()=>[],addAccount:vi.fn().mockReturnValue('new')};server=await startDashboard(manager as any,0);
 const url=`http://127.0.0.1:${(server.address() as any).port}`,label='Türkçe İsim';
 const body=Buffer.from(JSON.stringify({label})),split=body.indexOf(Buffer.from('ü'))+1;
 const response=await new Promise<{status:number;body:string}>((resolve,reject)=>{
  const req=request(url+'/api/accounts',{method:'POST',headers:{Origin:url,'Content-Type':'application/json'}},res=>{let body='';res.on('data',chunk=>body+=chunk);res.on('end',()=>resolve({status:res.statusCode!,body}));});
  req.on('error',reject);req.write(body.subarray(0,split));setTimeout(()=>req.end(body.subarray(split)),20);
 });
 expect(response.status).toBe(201);expect(manager.addAccount).toHaveBeenCalledWith(label);
});
it('accepts a large achievement subset while retaining bounded request bodies',async()=>{
 const manager={getStates:()=>[],completeAchievements:vi.fn().mockResolvedValue({completed:2000})};server=await startDashboard(manager as any,0);
 const url=`http://127.0.0.1:${(server.address() as any).port}`;
 const ids=Array.from({length:2000},(_,i)=>'ACHIEVEMENT_'+i.toString().padStart(5,'0'));
 const body={name:'demo',appid:620,nonce:'a'.repeat(48),confirmed:true,ids};
 const post=(path:string,body:unknown)=>fetch(url+path,{method:'POST',headers:{Origin:url,'Content-Type':'application/json'},body:JSON.stringify(body)});
 expect((await post('/api/achievement-complete',body)).status).toBe(200);expect(manager.completeAchievements).toHaveBeenCalledWith('demo',620,body.nonce,true,ids);
 manager.completeAchievements.mockClear();expect((await post('/api/achievement-complete',{...body,padding:'x'.repeat(1024*1024)})).status).toBe(413);expect(manager.completeAchievements).not.toHaveBeenCalled();
 expect((await post('/api/accounts',{label:'x'.repeat(9000)})).status).toBe(413);
});
