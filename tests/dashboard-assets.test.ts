import {afterEach,expect,it,vi} from 'vitest';
const fixture=vi.hoisted(()=>({script:'first script'}));
vi.mock('node:fs',async original=>{
 const fs=await original<typeof import('node:fs')>();
 return {...fs,readFileSync:(path:any,...args:any[])=>String(path).endsWith('/ui/app.js')?Buffer.from(fixture.script):(fs.readFileSync as any)(path,...args)};
});
import {startDashboard} from '../src/dashboard.js';
let server:Awaited<ReturnType<typeof startDashboard>>;
afterEach(async()=>{server?.closeAllConnections();if(server)await new Promise<void>(resolve=>server.close(()=>resolve()));});
it('serves one consistent asset snapshot until the backend is restarted',async()=>{
 server=await startDashboard({getStates:()=>[]} as any,0);
 const url=`http://127.0.0.1:${(server.address() as any).port}`;
 fixture.script='new script after an update';
 expect(await (await fetch(url+'/app.js')).text()).toBe('first script');
 expect(await (await fetch(url+'/')).text()).toContain('shutdownApp');
});
