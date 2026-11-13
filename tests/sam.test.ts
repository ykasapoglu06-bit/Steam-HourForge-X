import { expect,it,vi } from 'vitest';
import { SamService,type SamRunner } from '../src/sam.js';
const steamId='76561198000000000';
const snapshot={steamId,appid:620,unlocked:1,total:2,achievements:[{id:'FIRST',name:'First',unlocked:true},{id:'SECOND',name:'Second',unlocked:false}]};
it('only completes the previewed missing IDs after a game/account-bound confirmation',async()=>{
  const runner=vi.fn<SamRunner>().mockResolvedValueOnce(snapshot).mockResolvedValueOnce({...snapshot,unlocked:2,completed:1,rejected:0,stored:true,achievements:snapshot.achievements.map(row=>({...row,unlocked:true}))});
  const service=new SamService(runner);const preview=await service.preview('main',steamId,620);
  expect(runner.mock.calls[0]![0].operation).toBe('inspect');
  await expect(service.complete('other',steamId,620,preview.nonce!,true)).rejects.toThrow('SAM_PREVIEW_EXPIRED');
  await expect(service.complete('main',steamId,730,preview.nonce!,true)).rejects.toThrow('SAM_PREVIEW_EXPIRED');
  await expect(service.complete('main',steamId,620,preview.nonce!,false)).rejects.toThrow('SAM_PREVIEW_EXPIRED');
  expect(runner).toHaveBeenCalledTimes(1);
  const result=await service.complete('main',steamId,620,preview.nonce!,true);
  expect(runner.mock.calls[1]![0]).toEqual({operation:'complete',steamId,appid:620,ids:['SECOND']});
  expect(result.completed).toBe(1);
  await expect(service.complete('main',steamId,620,preview.nonce!,true)).rejects.toThrow('SAM_PREVIEW_EXPIRED');
});
it('expires and invalidates previews and rejects a different desktop account',async()=>{
  let now=1;const runner=vi.fn<SamRunner>().mockResolvedValue(snapshot),service=new SamService(runner,()=>now);
  const first=await service.preview('main',steamId,620);now=120002;
  await expect(service.complete('main',steamId,620,first.nonce!,true)).rejects.toThrow('SAM_PREVIEW_EXPIRED');
  const second=await service.preview('main',steamId,620);service.invalidate('main');
  await expect(service.complete('main',steamId,620,second.nonce!,true)).rejects.toThrow('SAM_PREVIEW_EXPIRED');
  runner.mockResolvedValue({...snapshot,steamId:'76561198000000001'});
  await expect(service.preview('main',steamId,620)).rejects.toThrow('SAM_ACCOUNT_MISMATCH');
});
it('does not offer a write token for a completed game',async()=>{
  const service=new SamService(async()=>({...snapshot,unlocked:2,achievements:snapshot.achievements.map(row=>({...row,unlocked:true}))}));
  expect((await service.preview('main',steamId,620)).nonce).toBeNull();
});
it('records a pre-write audit and does not report success without a confirmed save',async()=>{
  const audit=vi.fn();const runner=vi.fn<SamRunner>().mockResolvedValueOnce(snapshot).mockResolvedValueOnce({...snapshot,completed:0,rejected:1,stored:false});
  const service=new SamService(runner,Date.now,audit),preview=await service.preview('main',steamId,620);
  await expect(service.complete('main',steamId,620,preview.nonce!,true)).rejects.toThrow('SAM_VERIFY_FAILED');
  expect(audit.mock.calls.map(call=>call[0].event)).toEqual(['before','unverified']);
  expect(audit.mock.calls[0]![0].achievementIds).toEqual(['SECOND']);
});
