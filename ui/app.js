import { t, language, setLanguage, locale } from './i18n.js';

const $ = id => document.getElementById(id);
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
let accounts=[],selectedName='',view='activity',filter='all',reachable=false,lastSuccess=0,profileResult=null,profileBusy=false,mutating=false,pollTask=null;
let gameSignatures=new Map(),sidebarSignature='',accountSignature='',toastTimer,queueSignature='';
const achievementBusy=new Set(),achievementErrors=new Set();
let samPreview=null,samWriting=false;
try { selectedName=localStorage.getItem('steam-hourforge-x.account')||''; } catch {}
const current = () => accounts.find(account=>account.name===selectedName)||accounts[0];
const time = value => value ? new Date(value).toLocaleTimeString(locale(),{hour:'2-digit',minute:'2-digit',second:'2-digit'}) : '—';
const hours = value => (Number(value||0)/60).toLocaleString(locale(),{maximumFractionDigits:1});
const duration = value => { const minutes=Math.max(0,Math.floor(value/60000));return `${Math.floor(minutes/60)} ${t('hour')} ${minutes%60} ${t('minute')}`; };
const status = account => t('status.'+account.status);
const activeSet = account => new Set(reachable&&account.status==='farming'&&!account.isPaused&&!account.samBusy?account.gamesPlaying:[]);
const show = (id,visible) => { $(id).hidden=!visible; };
const text = (id,value) => { $(id).textContent=value; };

function translate(){
  document.documentElement.lang=language;$('language').value=language;document.querySelectorAll('[data-language]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.language===language)));
  document.querySelectorAll('[data-i18n]').forEach(element=>element.textContent=t(element.dataset.i18n));
  document.querySelectorAll('[data-placeholder]').forEach(element=>element.placeholder=t(element.dataset.placeholder));
  document.querySelectorAll('[data-aria]').forEach(element=>element.setAttribute('aria-label',t(element.dataset.aria)));
  gameSignatures.clear();sidebarSignature='';accountSignature='';queueSignature='';render();
}

function toast(message,error=false){
  clearTimeout(toastTimer);text('toast',message);$('toast').classList.toggle('error',error);show('toast',Boolean(message));
  if(message&&!error)toastTimer=setTimeout(()=>show('toast',false),4500);
}

async function request(path,body){
  const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const data=await response.json();if(!response.ok)throw new Error(data.error||'OPERATION_FAILED');return data;
}
function errorMessage(error){const message=t('errors.'+error.message);return message.startsWith('errors.')?t('errors.OPERATION_FAILED'):message;}

async function mutate(operation,successKey){
  if(mutating)return;mutating=true;render();
  try{await operation();if(pollTask)await pollTask;await poll();if(successKey)toast(t(successKey));}
  catch(error){toast(errorMessage(error),true);}
  finally{mutating=false;gameSignatures.clear();render();}
}

async function command(action,name=current()?.name){
  if(!name)return;
  await mutate(()=>request('/api/control',{name,action}),action==='logout'?'loggedOut':['hours','cards'].includes(action)?'switched':action==='refreshLibrary'?'libraryRefreshed':null);
}

function selectAccount(name){
  selectedName=name;profileResult=null;gameSignatures.clear();
  queueSignature='';$('profileDetails').open=false;
  text('profileStatus','');
  try{localStorage.setItem('steam-hourforge-x.account',name);}catch{}
  render();
}

function setView(next){
  view=['activity','library','discover','accounts','queue','about'].includes(next)?next:'activity';
  render();
}

function renderSidebar(){
  const signature=JSON.stringify([language,selectedName,reachable,accounts.map(a=>[a.name,a.label,a.status,a.isPaused,a.gamesPlaying.length,a.avatarUrl,a.displayName])]);
  if(signature===sidebarSignature)return;sidebarSignature=signature;
  $('accountList').innerHTML=accounts.map(a=>`<button class="account-item ${a.name===current()?.name?'selected':''}" data-account="${escape(a.name)}" aria-current="${a.name===current()?.name?'true':'false'}"><img class="rail-avatar" src="${escape(a.avatarUrl||'/avatar.svg')}" data-avatar alt=""><span><strong>${escape(a.label)}</strong><small>${escape(status(a))}</small></span><b>${activeSet(a).size}</b></button>`).join('');
  text('accountTotal',accounts.length);
  let selector=$('accountSelector');
  if(!selector){selector=document.createElement('select');selector.id='accountSelector';selector.className='account-switch';$('accountLabel').after(selector);selector.onchange=()=>selectAccount(selector.value);}
  selector.setAttribute('aria-label',t('chooseAccount'));
  selector.innerHTML=accounts.map(a=>`<option value="${escape(a.name)}">${escape(a.label)}</option>`).join('');selector.value=current()?.name||'';selector.hidden=accounts.length<2;
}

function gameMarkup(game,a,fromProfile=false){
  const active=activeSet(a).has(game.appid),pin=a.priorityGames.includes(game.appid),owned=game.owned!==false;
  const subtitle=active?t('activeLabel'):fromProfile?(owned?t('owned'):t('notOwned')):pin?t('priorityLabel'):game.remaining?`${game.remaining} ${t('cards').toLocaleLowerCase(locale())}`:t('queued');
  const progress=a.achievements?.[game.appid],busy=achievementBusy.has(a.name+':'+game.appid),failed=achievementErrors.has(a.name+':'+game.appid);
  const achievement=progress?t('achievementCount',progress):failed?t('achievementUnavailable'):t('checkAchievements');
  const complete=owned&&progress&&progress.unlocked<progress.total?`<button class="achievement-button sam-open" data-complete-achievements="${game.appid}" ${a.samBusy||!reachable||!a.connectedSince?'disabled':''}>${escape(t('completeAchievements'))}</button>`:'';
  return `<article class="game ${active?'active':''}"><img src="https://cdn.akamai.steamstatic.com/steam/apps/${game.appid}/header.jpg" alt="" loading="lazy"><div class="game-body"><div class="game-title" title="${escape(game.name)}">${escape(game.name)}</div><small class="${active?'activity-tag':pin?'priority-tag':''}">${escape(subtitle)}</small><small>${escape(t('ownedHours',{hours:hours(game.playtimeMinutes)}))} · ${game.appid}</small>${a.manualGames?.includes(game.appid)?`<small>${escape(t('manualTag'))}</small>`:''}${owned?`<button class="achievement-button" data-achievement="${game.appid}" title="${escape(t('achievementHelp'))}" ${busy||a.samBusy||!reachable||!a.connectedSince?'disabled':''}>${escape(busy?t('busy'):achievement)}</button>${complete}`:''}</div><button class="pin" data-pin="${game.appid}" aria-pressed="${pin}" aria-label="${escape(t(pin?'unpin':'pin')+' '+game.name)}" title="${escape(t(pin?'unpin':'pin'))}" ${!owned||mutating||!reachable?'disabled':''}>${pin?'★':'☆'}</button></article>`;
}

function renderGames(id,games,a,fromProfile=false,emptyKey='noGames'){
  const signature=JSON.stringify([language,reachable,mutating,games,a.priorityGames,[...activeSet(a)],a.achievements,a.samBusy,[...achievementBusy],[...achievementErrors]]);
  if(gameSignatures.get(id)===signature)return;gameSignatures.set(id,signature);
  const focused=document.activeElement?.closest('[data-pin]')?.dataset.pin;
  const hadFocus=focused&&$(id).contains(document.activeElement);
  $(id).innerHTML=games.length?games.map(game=>gameMarkup(game,a,fromProfile)).join(''):`<p class="empty">${escape(t(emptyKey))}</p>`;
  if(hadFocus)$(id).querySelector(`[data-pin="${Number(focused)}"]`)?.focus({preventScroll:true});
}

function renderAccounts(){
  const signature=JSON.stringify([language,reachable,mutating,accounts.map(a=>[a.name,a.label,a.status,a.manualPaused,a.library.length,a.priorityGames.length,a.gamesPlaying,a.mode,a.steamId,a.avatarUrl,a.displayName,a.vanityUrl])]);
  if(signature===accountSignature)return;accountSignature=signature;
  $('accountCards').innerHTML=accounts.map(a=>{
    const offline=['offline','error','skipped'].includes(a.status);
    const id=/^\d{17}$/.test(a.steamId||'')?a.steamId:null;
    const accountId=id?BigInt(id)-76561197960265728n:0n;
    const steam2=`STEAM_0:${accountId%2n}:${accountId/2n}`;
    const vanity=/^[a-zA-Z0-9_-]{1,64}$/.test(a.vanityUrl||'')?a.vanityUrl:null;
    const links=id?[
      ['VacList',`https://vaclist.net/account/${id}`,'vaclist.ico'],
      ['CSRep',`https://csrep.gg/player/${id}`,'csrep.ico'],
      ['CSStats',`https://csstats.gg/player/${id}`,'csstats.ico'],
      ['CSWatch',`https://cswat.ch/stats/${id}`,'cswatch.png'],
      ['SteamIDCheck',`https://steamidcheck.com/profile/${id}`,'steamidcheck.svg']
    ].map(([name,href,icon])=>`<a class="service-link" href="${href}" target="_blank" rel="noopener noreferrer" title="${escape(t('openService',{name}))}"><img src="/logos/${icon}" alt="" loading="lazy"><span>${name}</span><span class="external-arrow" aria-hidden="true">↗</span></a>`).join(''):'';
    return `<article class="account-card"><div class="account-identity"><img class="account-avatar" src="${escape(a.avatarUrl||'/avatar.svg')}" data-avatar alt="${escape(t('profilePhoto'))}"><div><h3>${escape(a.displayName||a.label)}</h3><small class="account-label">${escape(a.label)}</small><div class="status">${escape(status(a))}</div></div></div>${id?`<div class="profile-identity"><dl><div><dt>SteamID64</dt><dd>${id}</dd></div><div><dt>SteamID</dt><dd>${steam2}</dd></div><div><dt>Vanity URL</dt><dd>${vanity?`/id/${escape(vanity)}`:escape(t('vanityUnavailable'))}</dd></div></dl><a href="https://steamcommunity.com/profiles/${id}/" target="_blank" rel="noopener noreferrer">${escape(t('goProfile'))} ↗</a></div>`:`<p>${escape(t('loggedOutHelp'))}</p>`}<div class="meta"><div><strong>${a.library.length}</strong><span>${escape(t('totalGames'))}</span></div><div><strong>${activeSet(a).size}</strong><span>${escape(t('active'))}</span></div><div><strong>${a.priorityGames.length}</strong><span>${escape(t('pinned'))}</span></div></div>${links?`<div class="service-links">${links}</div><p class="external-note">${escape(t('externalServicesNote'))}</p>`:''}<div class="actions"><button class="primary" data-manage="${escape(a.name)}">${escape(t('manage'))}</button><button data-control="${offline?'start':'stop'}" data-name="${escape(a.name)}" ${mutating||!reachable?'disabled':''}>${escape(t(offline?'connect':'disconnect'))}</button><button data-control="logout" data-name="${escape(a.name)}" ${mutating||!reachable?'disabled':''}>${escape(t('logout'))}</button></div></article>`;
  }).join('');
}

function render(){
  const a=current();
  document.querySelectorAll('[data-view]').forEach(button=>{button.classList.toggle('selected',button.dataset.view===view);button.setAttribute('aria-current',button.dataset.view===view?'page':'false');});
  for(const name of ['activity','library','discover','accounts','queue','about'])show(name+'View',view===name);
  text('viewName',t(view==='activity'?'dashboard':view));renderSidebar();renderAccounts();
  text('overall',t('connectedAccounts',{count:accounts.filter(x=>['farming','paused','online'].includes(x.status)).length}));
  show('connectionBanner',!reachable);text('connectionBanner',t('offlineBanner'));
  ['pauseAll','resumeAll','addAccount','addAccount2'].forEach(id=>$(id).disabled=mutating||!reachable);
  if(!a)return;
  text('accountLabel',a.label);const running=reachable&&a.status==='farming'&&!a.isPaused,cardActive=a.mode==='cards'&&a.cardQueue.length>0;
  text('statusLabel',reachable?status(a):t('status.offline'));
  $('stateChip').classList.toggle('warning',!running);
  text('headline',!reachable?t('stoppedTitle'):running?t(cardActive?'workingCards':'workingHours'):a.status==='paused'?t('pausedTitle'):a.status==='offline'?t('stoppedTitle'):a.status==='connecting'||a.status==='online'?t('connectionTitle'):status(a));
  const cardName=a.cardQueue[0]?.name||'';
  text('description',!reachable?t('offlineBanner'):running?cardActive?t('cardsSummary',{game:cardName}):t('prioritySummary',{pinned:a.priorityGames.length,rest:Math.max(0,a.library.length-a.priorityGames.length)}):a.status==='paused'?t(a.manualPaused?'manualPause':'steamPause'):a.qrCode?t('qrHelp'):t('connectIssue'));
  if(a.samBusy)text('description',t('samBusy'));
  text('pause',t(a.manualPaused?'resume':'pause'));$('pause').disabled=mutating||!reachable||!['farming','paused'].includes(a.status);
  const offline=['offline','error','skipped'].includes(a.status);text('connect',t(offline?'connect':'disconnect'));$('connect').disabled=mutating||!reachable;
  $('logout').disabled=mutating||!reachable||!a.steamId;
  text('activeCount',reachable?activeSet(a).size:'—');text('libraryCount',a.library.length);text('priorityCount',a.priorityGames.length);text('remainingCards',a.cardCheckedAt?a.cardQueue.reduce((sum,g)=>sum+g.remaining,0):'—');
  show('hero',!['accounts','about'].includes(view));show('stats',!['accounts','about'].includes(view));
  show('qrPanel',reachable&&a.status==='connecting');show('qrImage',Boolean(a.qrCode));show('qrWaiting',!a.qrCode);
  if(a.qrCode&&$('qrImage').getAttribute('src')!==a.qrCode)$('qrImage').src=a.qrCode;
  if(!a.qrCode)$('qrImage').removeAttribute('src');
  const active=activeSet(a);text('activeSummary',t('expandGames',{count:active.size}));if($('activeDetails').open)renderGames('activeGames',a.library.filter(g=>active.has(g.appid)),a,false,'noActive');
  const names=ids=>ids.map(id=>a.library.find(game=>game.appid===id)?.name||`App ${id}`);
  text('nextPreview',a.nextGames?.length?names(a.nextGames).join(' · '):t('noNext'));
  const qs=JSON.stringify([a.name,a.queue,a.library.map(g=>g.name),language]);
  if(qs!==queueSignature){queueSignature=qs;$('fullQueue').innerHTML=(a.queue||[]).map((group,index)=>`<details class="queue-group"><summary>${escape(index===0?t('nowPlaying'):index===1?t('upNext'):t('queueGroup',{number:index+1}))} <span>${group.length}</span></summary><ol>${group.map(id=>`<li>${escape(a.library.find(g=>g.appid===id)?.name||id)} ${a.priorityGames.includes(id)?'★':''}</li>`).join('')}</ol></details>`).join('')||`<p class="empty">${escape(t('noGames'))}</p>`;}
  $('priorityChips').innerHTML=a.priorityGames.length?a.priorityGames.map(id=>{const g=a.library.find(game=>game.appid===id);return `<button data-show-pin="${id}">★ ${escape(g?.name||id)}</button>`}).join(''):`<p class="empty">${escape(t('prioritiesEmpty'))}</p>`;
  show('fullPins',a.priorityGames.length>=32);
  for(const mode of ['hours','cards']){$(mode).setAttribute('aria-pressed',a.mode===mode);$(mode).disabled=mutating||!reachable;}
  text('modeHelp',t(a.mode==='hours'?'hoursHelp':'cardsHelp'));
  text('batch',a.batchCount?`${a.batchIndex+1} / ${a.batchCount}`:'—');text('lastReport',time(a.lastReportedAt));
  $('next').disabled=mutating||!running||a.mode!=='hours'||a.batchCount<=1;
  text('cardInfo',a.cardStatus==='checking'?t('checkingCards'):a.cardStatus==='error'?t('cardScanFailed'):a.cardCheckedAt?t('cardSummary',{games:a.cardQueue.length,cards:a.cardQueue.reduce((sum,g)=>sum+g.remaining,0)})+' '+t('checked',{time:time(a.cardCheckedAt)}):t('waitingCards'));
  $('cardQueue').innerHTML=a.cardQueue.slice(0,5).map(g=>`<li><span>${escape(g.name)}</span><b>${g.remaining}</b></li>`).join('');
  $('refreshCards').disabled=mutating||!reachable||a.cardStatus==='checking'||!a.connectedSince;
  $('refreshLibrary').disabled=$('scanAll').disabled=mutating||!reachable||a.libraryRefreshing||!a.connectedSince;
  text('refreshLibrary',t(a.libraryRefreshing?'scanning':'refreshLibrary'));text('scanAll',t(a.libraryRefreshing?'scanning':'ownLibrary'));
  $('profileForm').querySelector('button').disabled=profileBusy||!reachable||!a.connectedSince;
  $('profileLink').href=a.steamId?`https://steamcommunity.com/profiles/${a.steamId}/`:'https://steamcommunity.com/my/';
  $('badgesLink').href=a.steamId?`https://steamcommunity.com/profiles/${a.steamId}/badges/`:'https://steamcommunity.com/my/badges/';
  const search=$('search').value.toLocaleLowerCase(locale());let games=a.library;
  if(filter==='active')games=games.filter(g=>active.has(g.appid));
  if(filter==='priority')games=games.filter(g=>a.priorityGames.includes(g.appid));
  if(filter==='cards')games=a.cardQueue.map(g=>({...g,playtimeMinutes:a.library.find(x=>x.appid===g.appid)?.playtimeMinutes||0}));
  games=games.filter(g=>(g.name+' '+g.appid).toLocaleLowerCase(locale()).includes(search));
  if($('libraryDetails').open)renderGames('libraryGames',games,a);text('librarySummary',t('expandGames',{count:games.length}));text('gameCount',t('profileResults',{count:games.length}));text('slots',t('slots',{count:a.priorityGames.length}));
  document.querySelectorAll('[data-filter]').forEach(button=>button.setAttribute('aria-pressed',button.dataset.filter===filter));
  show('profileDetails',Boolean(profileResult));
  if(profileResult){if($('profileDetails').open)renderGames('profileGames',profileResult.games,a,true);text('profileSummary',t('expandGames',{count:profileResult.games.length}));text('profileStatus',t('profileResults',{count:profileResult.games.length}));}
  else if(!profileBusy){$('profileGames').innerHTML='';gameSignatures.delete('profileGames');}
  text('lastUpdate',lastSuccess?t('updated',{time:time(lastSuccess)}):'');tick();
}

function tick(){const a=current();if(!a)return;text('uptime',a.connectedSince?duration(Date.now()-new Date(a.connectedSince)):'—');text('countdown',a.isPaused?t('status.paused'):a.nextBatchAt?Math.max(0,Math.ceil((a.nextBatchAt-Date.now())/60000))+' '+t('min'):'—');text('qrTimer',a.qrExpiresAt?t('qrRemaining',{minutes:Math.max(0,Math.ceil((a.qrExpiresAt-Date.now())/60000))}):'');}

async function poll(){
  if(pollTask)return pollTask;
  pollTask=(async()=>{try{const response=await fetch('/api/status',{cache:'no-store'});if(!response.ok)throw Error();const data=await response.json();accounts=data.accounts;reachable=true;lastSuccess=Date.now();if(!accounts.some(a=>a.name===selectedName))selectedName=accounts[0]?.name||'';render();}catch(error){console.error('Dashboard update failed',error);reachable=false;render();}finally{pollTask=null;}})();
  return pollTask;
}

async function togglePriority(id){
  const a=current();if(!a||mutating)return;const pins=a.priorityGames.includes(id)?a.priorityGames.filter(x=>x!==id):[...a.priorityGames,id];
  if(pins.length>32){toast(t('maxPriority'),true);return;}
  await mutate(()=>request('/api/preferences',{name:a.name,preferences:{label:a.label,priorityGames:pins,rotationMinutes:a.rotationMinutes}}),'pinSaved');
}

document.addEventListener('click',event=>{
  const button=event.target.closest('button');if(!button)return;
  if(button.dataset.view){setView(button.dataset.view);return;}
  if(button.dataset.go){setView(button.dataset.go);return;}
  if(button.dataset.account){selectAccount(button.dataset.account);return;}
  if(button.dataset.manage){selectAccount(button.dataset.manage);setView('activity');window.scrollTo({top:0});return;}
  if(button.dataset.filter){filter=button.dataset.filter;render();return;}
  if(button.dataset.pin){void togglePriority(Number(button.dataset.pin));return;}
  if(button.dataset.achievement){void checkAchievement(Number(button.dataset.achievement));return;}
  if(button.dataset.completeAchievements){void previewCompletion(Number(button.dataset.completeAchievements));return;}
  if(button.dataset.showPin){filter='priority';setView('library');return;}
  if(button.dataset.close){$(button.dataset.close).close();return;}
  if(button.dataset.control){if(['stop','logout'].includes(button.dataset.control)&&!confirm(t(button.dataset.control==='logout'?'logoutConfirm':'stopConfirm')))return;void command(button.dataset.control,button.dataset.name);}
});
document.addEventListener('error',event=>{
  if(event.target instanceof window.HTMLImageElement && event.target.hasAttribute('data-avatar') && !event.target.src.endsWith('/avatar.svg'))event.target.src='/avatar.svg';
},true);

document.querySelectorAll('[data-language]').forEach(b=>b.onclick=()=>{setLanguage(b.dataset.language);translate();});
$('language').onchange=()=>{setLanguage($('language').value);translate();};
$('search').oninput=()=>{$('libraryDetails').open=true;render();};
$('logout').onclick=()=>{if(confirm(t('logoutConfirm')))void command('logout');};
for(const id of ['activeDetails','libraryDetails','profileDetails'])$(id).addEventListener('toggle',render);
$('pause').onclick=()=>command(current()?.manualPaused?'resume':'pause');
$('connect').onclick=()=>{const a=current();if(!a)return;const action=['offline','error','skipped'].includes(a.status)?'start':'stop';if(action==='stop'&&!confirm(t('stopConfirm')))return;void command(action);};
$('next').onclick=()=>command('next');$('hours').onclick=()=>command('hours');$('cards').onclick=()=>command('cards');
$('refreshCards').onclick=()=>command('refreshCards');$('refreshLibrary').onclick=()=>command('refreshLibrary');
$('scanAll').onclick=async()=>{await command('refreshLibrary');filter='all';setView('library');};
$('pauseAll').onclick=()=>command('pause','*');$('resumeAll').onclick=()=>command('resume','*');
$('showPriorities').onclick=()=>{filter='all';$('libraryDetails').open=true;setView('library');};
function openAdd(){text('addError','');$('newLabel').value='';$('addDialog').showModal();$('newLabel').focus();}
$('addAccount').onclick=openAdd;$('addAccount2').onclick=openAdd;
$('addForm').onsubmit=async event=>{
  event.preventDefault();const button=event.submitter;button.disabled=true;text('addError','');
  try{const result=await request('/api/accounts',{label:$('newLabel').value.trim()});if(pollTask)await pollTask;await poll();selectAccount(result.name);$('addDialog').close();setView('activity');window.scrollTo({top:0});}
  catch(error){text('addError',errorMessage(error));}finally{button.disabled=false;}
};
$('settings').onclick=()=>{const a=current();if(!a)return;$('settingsDialog').dataset.name=a.name;$('editLabel').value=a.label;$('rotation').value=a.rotationMinutes;text('settingsError','');$('settingsDialog').showModal();};
$('settingsForm').onsubmit=async event=>{
  event.preventDefault();const a=accounts.find(a=>a.name===$('settingsDialog').dataset.name);if(!a)return;event.submitter.disabled=true;text('settingsError','');
  try{await request('/api/preferences',{name:a.name,preferences:{label:$('editLabel').value.trim(),priorityGames:a.priorityGames,rotationMinutes:Number($('rotation').value)}});if(pollTask)await pollTask;await poll();$('settingsDialog').close();toast(t('saved'));}
  catch(error){text('settingsError',errorMessage(error));}finally{event.submitter.disabled=false;}
};
$('clearPins').onclick=async()=>{const a=accounts.find(a=>a.name===$('settingsDialog').dataset.name);if(!a||!confirm(t('removePinConfirm')))return;await mutate(()=>request('/api/preferences',{name:a.name,preferences:{label:a.label,priorityGames:[],rotationMinutes:a.rotationMinutes}}),'pinSaved');};
$('profileForm').onsubmit=async event=>{
  event.preventDefault();const a=current();if(!a||profileBusy)return;profileBusy=true;profileResult=null;$('profileDetails').open=false;$('profileGames').innerHTML='';text('profileStatus',t('searching'));render();
  try{const result=await request('/api/profile',{name:a.name,profile:$('profileInput').value.trim()});if(current()?.name===a.name)profileResult=result;}
  catch(error){text('profileStatus',errorMessage(error));}
  finally{profileBusy=false;render();}
};
async function checkAchievement(appid){
  const a=current();if(!a)return;const key=a.name+':'+appid;if(achievementBusy.has(key))return;
  achievementBusy.add(key);achievementErrors.delete(key);render();
  try{await request('/api/achievements',{name:a.name,appid});await poll();}
  catch(error){achievementErrors.add(key);toast(errorMessage(error),true);}
  finally{achievementBusy.delete(key);gameSignatures.clear();render();}
}
$('gameForm').onsubmit=async event=>{
  event.preventDefault();const a=current();if(!a)return;const raw=$('gameInput').value.trim();let appid;
  if(/^\d+$/.test(raw))appid=Number(raw);else{try{const url=new URL(raw);if(url.protocol==='https:'&&url.hostname==='store.steampowered.com')appid=Number(url.pathname.match(/^\/app\/(\d+)(?:\/|$)/)?.[1]);}catch{}}
  if(!Number.isSafeInteger(appid)||appid<1||appid>2147483647){text('gameError',t('errors.INVALID_APPID'));return;}
  event.submitter.disabled=true;text('gameError','');
  try{await request('/api/games',{name:a.name,appid});await poll();$('gameInput').value='';toast(t('gameAdded'));}
  catch(error){text('gameError',errorMessage(error));}finally{event.submitter.disabled=false;}
};
translate();poll();setInterval(poll,3000);setInterval(tick,1000);

async function previewCompletion(appid){
  const a=current();if(!a||samWriting)return;
  samPreview=null;const dialog=$('achievementDialog');
  text('samGame',(a.library.find(game=>game.appid===appid)?.name||appid)+' · '+appid);text('samAccount',a.label+' · '+a.steamId);
  text('samStatus',t('samPreviewLoading'));$('samMissingList').innerHTML='';show('samWarning',false);show('applyAchievements',false);$('applyAchievements').disabled=true;
  if(!dialog.open)dialog.showModal();
  try{
    const result=await request('/api/achievement-preview',{name:a.name,appid});
    if(!dialog.open)return;
    samPreview={...result,name:a.name};
    const missing=result.achievements.filter(row=>!row.unlocked);
    text('samStatus',missing.length?t('samMissing',{count:missing.length}):t('samAllDone'));
    $('samMissingList').innerHTML=missing.map(row=>`<li>${escape(row.name)} <small>${escape(row.id)}</small></li>`).join('');
    show('samWarning',Boolean(result.nonce));show('applyAchievements',Boolean(result.nonce));$('applyAchievements').disabled=!result.nonce;
    await poll();
  }catch(error){text('samStatus',errorMessage(error));}
}
function closeAchievement(){if(!samWriting){samPreview=null;$('achievementDialog').close();}}
$('closeAchievement').onclick=closeAchievement;$('cancelAchievement').onclick=closeAchievement;
$('achievementDialog').addEventListener('cancel',event=>{if(samWriting)event.preventDefault();else samPreview=null;});
$('applyAchievements').onclick=async()=>{
  const preview=samPreview;if(!preview||!preview.nonce||samWriting)return;
  if(Date.now()>preview.expiresAt){text('samStatus',t('samExpired'));$('applyAchievements').disabled=true;return;}
  samWriting=true;$('applyAchievements').disabled=true;$('closeAchievement').disabled=true;$('cancelAchievement').disabled=true;text('samStatus',t('samWorking'));
  try{
    const result=await request('/api/achievement-complete',{name:preview.name,appid:preview.appid,nonce:preview.nonce,confirmed:true});
    text('samStatus',t('samComplete',{completed:result.completed,rejected:result.rejected}));
    samPreview=null;show('applyAchievements',false);show('samWarning',false);await poll();
  }catch(error){text('samStatus',errorMessage(error));samPreview=null;show('applyAchievements',false);}
  finally{samWriting=false;$('closeAchievement').disabled=false;$('cancelAchievement').disabled=false;gameSignatures.clear();render();}
};
