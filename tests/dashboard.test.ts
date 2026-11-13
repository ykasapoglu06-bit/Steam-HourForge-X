import { afterEach, expect, it, vi } from "vitest";
import type { Server } from "node:http";
import { startDashboard } from "../src/dashboard.js";
let server: Server;
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
