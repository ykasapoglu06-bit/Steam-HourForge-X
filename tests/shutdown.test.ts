import {afterEach,expect,it,vi} from 'vitest';
import {createShutdown} from '../src/shutdown.js';
afterEach(()=>vi.useRealTimers());
it('stops accounts and owned helpers before closing and exiting, only once',async()=>{
 const order:string[]=[];let release!:()=>void;
 const stopAccounts=vi.fn(()=>new Promise<void>(resolve=>{release=()=>{order.push('accounts');resolve();};}));
 const quit=createShutdown({stopAccounts,stopHelpers:async()=>{order.push('helpers');},closeServer:()=>{order.push('server');},exit:code=>{order.push('exit:'+code);},report:()=>{}});
 const first=quit('dashboard'),second=quit('dashboard');expect(first).toBe(second);expect(order).toEqual([]);
 release();await first;expect(stopAccounts).toHaveBeenCalledOnce();expect(order).toEqual(['accounts','helpers','server','exit:0']);
});
it('still closes and exits if account cleanup hangs',async()=>{
 vi.useFakeTimers();const stopHelpers=vi.fn(async()=>{}),closeServer=vi.fn(),exit=vi.fn();
 const quit=createShutdown({stopAccounts:()=>new Promise(()=>{}),stopHelpers,closeServer,exit,report:()=>{},timeoutMs:100});
 const task=quit('dashboard');await vi.advanceTimersByTimeAsync(100);await task;
 expect(stopHelpers).toHaveBeenCalledOnce();expect(closeServer).toHaveBeenCalledOnce();expect(exit).toHaveBeenCalledWith(1);
});
