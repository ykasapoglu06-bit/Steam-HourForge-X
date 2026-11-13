import { afterEach, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
// @ts-expect-error jsdom types are only used in this test.
import { JSDOM } from "jsdom";
let dom:any;
it('keeps keyboard focus on the selected login tab after its request finishes',async()=>{
 dom=new JSDOM(readFileSync(new URL('../ui/index.html',import.meta.url),'utf8'),{url:'http://127.0.0.1:17321'});dom.window.scrollTo=()=>{};
 const a:any={name:'login',label:'Login',status:'offline',authPhase:'idle',gamesPlaying:[],library:[],priorityGames:[],cardQueue:[],queue:[],nextGames:[],manualGames:[],mode:'hours',cardStatus:'waiting',achievements:{}};
 const fetchMock=async(_path:string,options?:any)=>{if(options?.method){a.status='connecting';a.authPhase='qr';return new Response('{"ok":true}');}return new Response(JSON.stringify({accounts:[a]}));};
 for(const [key,value]of Object.entries({window:dom.window,document:dom.window.document,localStorage:dom.window.localStorage,fetch:fetchMock,setInterval:()=>0}))vi.stubGlobal(key,value);
 vi.resetModules();
 // @ts-expect-error browser module is plain JavaScript.
 await import('../ui/app.js');const $=(id:string)=>dom.window.document.getElementById(id);
 await vi.waitFor(()=>expect($('loginPanel').hidden).toBe(false));
 $('credentialsTab').focus();$('credentialsTab').dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
 await vi.waitFor(()=>expect(dom.window.document.activeElement).toBe($('qrTab')));
 expect($('qrTab').getAttribute('aria-selected')).toBe('true');expect($('qrPane').hidden).toBe(false);
});
it('explains achievement handoff, disables conflicting account actions and keeps pause available',async()=>{
 dom=new JSDOM(readFileSync(new URL('../ui/index.html',import.meta.url),'utf8'),{url:'http://127.0.0.1:17321'});dom.window.scrollTo=()=>{};
 const a:any={name:'busy',label:'Busy account',status:'offline',samBusy:true,steamId:'76561198000000000',manualPaused:false,gamesPlaying:[],library:[],priorityGames:[],cardQueue:[],queue:[],nextGames:[],manualGames:[],mode:'hours',cardStatus:'waiting',achievements:{}};
 for(const [key,value]of Object.entries({window:dom.window,document:dom.window.document,localStorage:dom.window.localStorage,fetch:async()=>new Response(JSON.stringify({accounts:[a]})),setInterval:()=>0}))vi.stubGlobal(key,value);
 vi.resetModules();
 // @ts-expect-error browser module is plain JavaScript.
 await import('../ui/app.js');const $=(id:string)=>dom.window.document.getElementById(id);
 await vi.waitFor(()=>expect($('headline').textContent).toContain('Başarım'));
 expect($('logout').disabled).toBe(true);expect($('pause').disabled).toBe(false);expect($('pauseAll').disabled).toBe(false);
 dom.window.document.querySelector('[data-view="accounts"]').click();
 for(const action of ['start','logout'])expect($('accountCards').querySelector(`[data-control="${action}"]`).disabled).toBe(true);
 expect($('accountCards').querySelector('[data-remove]').disabled).toBe(true);
 expect($('accountCards').querySelector('[role="status"]').textContent).toContain('geçici');
 expect(dom.window.document.querySelector('[data-view="accounts"]').getAttribute('aria-current')).toBe('page');
});
afterEach(()=>{dom?.window.close();vi.unstubAllGlobals();vi.restoreAllMocks();});
it('removes a confirmed account, shows the empty state and lets the user add another',async()=>{
 dom=new JSDOM(readFileSync(new URL('../ui/index.html',import.meta.url),'utf8'),{url:'http://127.0.0.1:17321'});dom.window.scrollTo=()=>{};
 dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};dom.window.HTMLDialogElement.prototype.close=function(){this.open=false;};
 let accounts:any[]=[{name:'test',label:'Test account',status:'offline',gamesPlaying:[],library:[],priorityGames:[],cardQueue:[],queue:[],nextGames:[],manualGames:[],mode:'hours',cardStatus:'waiting',achievements:{}}];const calls:any[]=[];
 const fetchMock=vi.fn(async(path:string,options?:any)=>{if(!options?.method)return new Response(JSON.stringify({accounts}));const body=JSON.parse(options.body);calls.push({path,body});if(path==='/api/remove-account')accounts=[];return new Response('{"ok":true}');});
 for(const [key,value]of Object.entries({window:dom.window,document:dom.window.document,localStorage:dom.window.localStorage,fetch:fetchMock,setInterval:()=>0,confirm:()=>true}))vi.stubGlobal(key,value);
 vi.resetModules();
 // @ts-expect-error browser module is plain JavaScript.
 await import('../ui/app.js');const $=(id:string)=>dom.window.document.getElementById(id);
 await vi.waitFor(()=>expect($('accountCards').querySelector('[data-remove]')).not.toBeNull());
 $('accountCards').querySelector('[data-remove]').click();expect($('removeDialog').open).toBe(true);expect($('removeLabel').textContent).toBe('Test account');expect(calls).toHaveLength(0);
 $('removeDialog').querySelector('[data-close]').click();expect($('removeDialog').open).toBe(false);expect(calls).toHaveLength(0);
 $('accountCards').querySelector('[data-remove]').click();$('removeForm').dispatchEvent(new dom.window.Event('submit',{cancelable:true}));
 await vi.waitFor(()=>expect($('emptyAccounts').hidden).toBe(false));expect(calls[0]).toEqual({path:'/api/remove-account',body:{name:'test',confirmed:true}});expect($('hero').hidden).toBe(true);expect($('accountCards').children.length).toBe(0);
 $('addFirstAccount').click();expect($('addDialog').open).toBe(true);
});
it('offers password login first, retries Guard codes, clears secrets and keeps errors scoped',async()=>{
 dom=new JSDOM(readFileSync(new URL('../ui/index.html',import.meta.url),'utf8'),{url:'http://127.0.0.1:17321'});
 dom.window.scrollTo=()=>{};
 const a:any={name:'second',label:'Second account',status:'offline',steamId:null,steamAccountName:null,connectedSince:null,authPhase:'idle',authChallenge:null,authError:null,gamesPlaying:[],library:[],priorityGames:[],manualGames:[],queue:[],nextGames:[],cardQueue:[],cardStatus:'waiting',rotationMinutes:30,mode:'hours',achievements:{}};
 const calls:any[]=[];let wrong=true;
 const fetchMock=vi.fn(async(path:string,options?:any)=>{
   if(!options?.method)return new Response(JSON.stringify({accounts:[a]}));
   const data=JSON.parse(options.body);calls.push({path,data});
   if(path==='/api/login'){a.status='connecting';a.authPhase='guard';a.authChallenge={methods:['email']};return new Response('{"ok":true}');}
   if(path==='/api/guard'&&wrong){wrong=false;return new Response('{"error":"AUTH_GUARD_INVALID"}',{status:400});}
   if(path==='/api/guard'){a.authPhase='steam';a.authChallenge=null;}
   return new Response('{"ok":true}');
 });
 for(const [key,value] of Object.entries({window:dom.window,document:dom.window.document,localStorage:dom.window.localStorage,fetch:fetchMock,setInterval:()=>0,confirm:()=>true}))vi.stubGlobal(key,value);
 vi.resetModules();
 // @ts-expect-error browser module is plain JavaScript.
 await import('../ui/app.js');
 const $=(id:string)=>dom.window.document.getElementById(id);
 await vi.waitFor(()=>expect($('loginPanel').hidden).toBe(false));
 expect($('credentialsPane').hidden).toBe(false);expect($('qrPane').hidden).toBe(true);expect($('hero').hidden).toBe(true);expect($('stats').hidden).toBe(true);expect($('pauseAll').disabled).toBe(true);
 $('steamUsername').value='test-user';$('steamPassword').value='secret-password';$('togglePassword').click();expect($('steamPassword').type).toBe('text');
 $('credentialsForm').dispatchEvent(new dom.window.Event('submit',{cancelable:true}));
 await vi.waitFor(()=>expect($('guardPane').hidden).toBe(false));await vi.waitFor(()=>expect($('steamPassword').value).toBe(''));
 expect(calls[0]).toEqual({path:'/api/login',data:{name:'second',method:'credentials',accountName:'test-user',password:'secret-password'}});expect(JSON.stringify(dom.window.localStorage)).not.toContain('secret-password');
 $('guardCode').value='WRONG';$('guardForm').dispatchEvent(new dom.window.Event('submit',{cancelable:true}));
 await vi.waitFor(()=>expect($('authError').textContent).toContain('Kod yanlış'));expect($('toast').hidden).toBe(true);
 $('guardCode').value='ABCDE';$('guardForm').dispatchEvent(new dom.window.Event('submit',{cancelable:true}));
 await vi.waitFor(()=>expect($('guardPane').hidden).toBe(true));expect($('guardCode').value).toBe('');
 expect(calls.filter(c=>c.path==='/api/login')).toHaveLength(1);
 dom.window.document.querySelector('[data-view="accounts"]').click();expect($('loginPanel').hidden).toBe(true);
});
it("renders collapsed lists, priority selection, queue, achievements and sign-out controls",async()=>{
  dom=new JSDOM(readFileSync(new URL('../ui/index.html',import.meta.url),'utf8'),{url:'http://127.0.0.1:17321'});
  // jsdom does not implement the browser's native dialog open/close methods.
  dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  dom.window.HTMLDialogElement.prototype.close=function(){this.open=false;};
  dom.window.scrollTo=()=>{};
 const a:any={name:'main',label:'Main',status:'farming',enabled:true,priorityGames:[730],rotationMinutes:30,qrCode:null,qrExpiresAt:null,libraryRefreshing:false,libraryCheckedAt:Date.now(),libraryError:null,steamAccountName:'Player',steamId:'76561198000000000',gamesPlaying:[730,620],isPaused:false,lastError:null,connectedSince:new Date().toISOString(),mode:'hours',manualPaused:false,library:[{appid:730,name:'CS2',playtimeMinutes:60},{appid:620,name:'Portal 2',playtimeMinutes:0},{appid:440,name:'Team Fortress 2',playtimeMinutes:0}],cardStatus:'ready',cardQueue:[],cardCheckedAt:Date.now(),cardError:null,batchIndex:0,batchCount:2,nextBatchAt:Date.now()+1800000,lastReportedAt:Date.now(),queue:[[730,620],[730,440]],nextGames:[730,440],manualGames:[],achievements:{}};
  a.avatarUrl='https://avatars.steamstatic.com/test_full.jpg';a.displayName='Steam Player';a.vanityUrl='yuu55uuf';
  const calls:{path:string;body:any}[]=[];
  const fetchMock=vi.fn(async(path:string,options?:any)=>{
    if(!options?.method)return new Response(JSON.stringify({accounts:[a]}),{headers:{'Content-Type':'application/json'}});
    const body=JSON.parse(options.body);calls.push({path,body});
    if(path==='/api/preferences')a.priorityGames=body.preferences.priorityGames;
    if(path==='/api/achievements')a.achievements[body.appid]={unlocked:0,total:73,checkedAt:Date.now()};
    if(path==='/api/achievement-preview')return new Response(JSON.stringify({steamId:a.steamId,appid:620,unlocked:0,total:1,nonce:'a'.repeat(48),expiresAt:Date.now()+120000,achievements:[{id:'PORTAL_TEST',name:'Test achievement',unlocked:false}]}));
    if(path==='/api/achievement-complete'){
      a.achievements[620]={unlocked:1,total:1,checkedAt:Date.now()};
      return new Response(JSON.stringify({completed:1,rejected:0,unlocked:1,total:1}));
    }
    if(path==='/api/profile')return new Response(JSON.stringify({steamId:a.steamId,games:a.library.map((g:any)=>({...g,owned:true}))}));
    return new Response(JSON.stringify({ok:true}));
  });
  for(const [key,value] of Object.entries({window:dom.window,document:dom.window.document,localStorage:dom.window.localStorage,fetch:fetchMock,setInterval:()=>0,confirm:()=>true}))vi.stubGlobal(key,value);
  vi.resetModules();
  // @ts-expect-error browser module is plain JavaScript.
  await import('../ui/app.js');
  const $=(id:string)=>dom.window.document.getElementById(id);
  await vi.waitFor(()=>expect($('headline').textContent).toContain('Saat sırası'));
  dom.window.document.querySelector('[data-view="accounts"]').click();
  expect($('accountsView').hidden).toBe(false);
  expect($('accountCards').querySelector('.account-avatar').getAttribute('src')).toBe(a.avatarUrl);
  expect($('accountCards').querySelector('h3').textContent).toBe('Steam Player');
  expect($('accountCards').textContent).toContain('SteamID64');expect($('accountCards').textContent).toContain('STEAM_0:0:19867136');expect($('accountCards').textContent).toContain('/id/yuu55uuf');
  const links=[...$('accountCards').querySelectorAll('a')].map((link:any)=>link.href);
  expect(links).toEqual([`https://steamcommunity.com/profiles/${a.steamId}/`,`https://vaclist.net/account/${a.steamId}`,`https://csrep.gg/player/${a.steamId}`,`https://csstats.gg/player/${a.steamId}`,`https://cswat.ch/stats/${a.steamId}`,`https://steamidcheck.com/profile/${a.steamId}`]);
  expect($('accountCards').querySelectorAll('.service-link img')).toHaveLength(6);
  const firstService=$('accountCards').querySelector('.service-link');
  expect(firstService.textContent).toContain('Steam profili');
  expect(firstService.querySelector('img').getAttribute('src')).toBe('/logos/steam.ico');
  expect(firstService.rel).toContain('noopener');expect(firstService.target).toBe('_blank');
  dom.window.document.querySelector('[data-view="about"]').click();expect($('aboutView').hidden).toBe(false);expect($('hero').hidden).toBe(true);
  dom.window.document.querySelector('[data-language="en"]').click();expect(dom.window.document.querySelector('[data-language="en"]').getAttribute('aria-pressed')).toBe('true');
  expect($('aboutView').textContent).toContain('Your games and accounts in one place');expect($('aboutView').textContent).toContain('Yusuf Kasapoglu');
  $('language').value='tr';$('language').dispatchEvent(new dom.window.Event('change'));
  dom.window.document.querySelector('[data-view="activity"]').click();
  expect($('libraryDetails').open).toBe(false);expect($('libraryGames').children.length).toBe(0);
  $('libraryDetails').open=true;$('libraryDetails').dispatchEvent(new dom.window.Event('toggle'));
  expect($('libraryGames').querySelectorAll('.game')).toHaveLength(3);
  $('libraryGames').querySelector('[data-pin="620"]').click();
  await vi.waitFor(()=>expect(a.priorityGames).toEqual([730,620]));
  await vi.waitFor(()=>expect($('libraryGames').querySelector('[data-pin="620"]').getAttribute('aria-pressed')).toBe('true'));
  $('libraryGames').querySelector('[data-achievement="620"]').click();
  await vi.waitFor(()=>expect($('libraryGames').textContent).toContain('0/73 başarım'));
  expect(calls.some(call=>call.path==='/api/achievement-complete')).toBe(false);
  $('libraryGames').querySelector('[data-complete-achievements="620"]').click();
  await vi.waitFor(()=>expect($('samMissingList').textContent).toContain('Test achievement'));
  expect($('achievementDialog').open).toBe(true);expect($('samAccount').textContent).toContain(a.steamId);
  expect(calls.some(call=>call.path==='/api/achievement-complete')).toBe(false);
  $('applyAchievements').click();
  await vi.waitFor(()=>expect($('samStatus').textContent).toContain('Tamamlanan: 1'));
  expect(calls.find(call=>call.path==='/api/achievement-complete')!.body).toEqual({name:'main',appid:620,nonce:'a'.repeat(48),confirmed:true});
  await vi.waitFor(()=>expect($('closeAchievement').disabled).toBe(false));$('closeAchievement').click();
  expect($('nextPreview').textContent).toContain('Team Fortress 2');
  dom.window.document.querySelector('[data-view="queue"]').click();expect($('queueView').hidden).toBe(false);
  expect($('fullQueue').querySelectorAll('details')).toHaveLength(2);
  $('profileInput').value='76561198000000000';$('profileForm').dispatchEvent(new dom.window.Event('submit',{cancelable:true}));
  await vi.waitFor(()=>expect($('profileSummary').textContent).toContain('3'));
  expect($('profileDetails').open).toBe(false);expect($('profileGames').children).toHaveLength(0);
  $('logout').click();await vi.waitFor(()=>expect(calls.some(call=>call.body.action==='logout')).toBe(true));
  await vi.waitFor(()=>expect($('toast').textContent).toContain('Çıkış yapıldı'));
  await vi.waitFor(()=>expect($('hours').disabled).toBe(false));
  expect(dom.window.document.querySelector('[data-i18n="cardRewardNote"]')).toBeNull();
});

