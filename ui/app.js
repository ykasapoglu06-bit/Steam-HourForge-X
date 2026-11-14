import { t, language, setLanguage, locale } from './i18n.js';

const $ = id => document.getElementById(id);

const APP_VERSION='2.4.10';
let versionMismatch=false;
function showVersionError(){
  versionMismatch=true;
  document.body.replaceChildren();
  const panel=document.createElement('main'),heading=document.createElement('h1'),message=document.createElement('p');
  panel.className='shutdown-panel';heading.textContent=t('versionMismatchTitle');message.textContent=t('versionMismatchHelp');
  const quit=document.createElement('button');quit.className='power-button';quit.textContent=t('quitApp');
  quit.onclick=async()=>{
    quit.disabled=true;
    try{
      const response=await fetch('/api/shutdown',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({confirmed:true})});
      if(!response.ok)throw new Error('SHUTDOWN_UNAVAILABLE');
      heading.textContent=t('appClosing');message.textContent=t('appClosingHelp');
    }catch{message.textContent=t('versionMismatchHelp')+' '+t('errors.SHUTDOWN_UNAVAILABLE');quit.disabled=false;}
  };
  panel.append(heading,message,quit);document.body.append(panel);
}
if(['shutdownApp','shutdownPanel','fixed','headline'].some(id=>!$(id))){showVersionError();throw new Error('UI_VERSION_MISMATCH');}

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
let accounts=[],selectedName='',view='activity',filter='all',reachable=false,lastSuccess=0,profileResult=null,profileBusy=false,mutating=false,pollTask=null;
let gameSignatures=new Map(),sidebarSignature='',accountSignature='',toastTimer,queueSignature='';
const achievementBusy=new Set(),achievementErrors=new Map();
let samPreview=null,samWriting=false,samPreviewSequence=0;
let quitting=false,appClosed=false,shutdownPollTimer=null;
let loginMethod='credentials',loginPending=false,loginLocalError='',loginAccount='',loginLastPhase='';
try { selectedName=localStorage.getItem('steam-hourforge-x.account')||''; } catch {}
const current = () => accounts.find(account=>account.name===selectedName)||accounts[0];
const time = value => value ? new Date(value).toLocaleTimeString(locale(),{hour:'2-digit',minute:'2-digit',second:'2-digit'}) : '—';
const hours = value => (Number(value||0)/60).toLocaleString(locale(),{maximumFractionDigits:1});
const duration = value => { const minutes=Math.max(0,Math.floor(value/60000));return `${Math.floor(minutes/60)} ${t('hour')} ${minutes%60} ${t('minute')}`; };
const status = account => account.samBusy?t('achievementOperation'):t('status.'+account.status);
const activeSet = account => new Set(reachable&&account.status==='farming'&&!account.isPaused&&!account.samBusy?account.gamesPlaying:[]);
const show = (id,visible) => { $(id).hidden=!visible; };
const text = (id,value) => { $(id).textContent=value; };

function translate(){
  $('steamPassword').type='password';$('togglePassword').setAttribute('aria-pressed','false');
  document.documentElement.lang=language;$('language').value=language;document.querySelectorAll('[data-language]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.language===language)));
  document.querySelectorAll('[data-i18n]').forEach(element=>element.textContent=t(element.dataset.i18n));
  document.querySelectorAll('[data-placeholder]').forEach(element=>element.placeholder=t(element.dataset.placeholder));
  document.querySelectorAll('[data-aria]').forEach(element=>element.setAttribute('aria-label',t(element.dataset.aria)));
  gameSignatures.clear();sidebarSignature='';accountSignature='';queueSignature='';render();
}

function toast(message,error=false){
  clearTimeout(toastTimer);text('toastMessage',message);$('toast').classList.toggle('error',error);show('toast',Boolean(message));
  if(message)toastTimer=setTimeout(()=>show('toast',false),error?8000:4500);
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
  await mutate(()=>request('/api/control',{name,action}),action==='logout'?'loggedOut':['hours','cards','fixed'].includes(action)?'switched':action==='refreshLibrary'?'libraryRefreshed':null);
}

function selectAccount(name){
  if(samWriting||loginPending)return;
  toast('');$('steamPassword').value='';$('guardCode').value='';loginMethod='credentials';loginLocalError='';
  if($('achievementDialog').open)closeAchievement();
  selectedName=name;profileResult=null;gameSignatures.clear();
  queueSignature='';$('profileDetails').open=false;
  text('profileStatus','');
  try{localStorage.setItem('steam-hourforge-x.account',name);}catch{}
  render();
  window.scrollTo({top:0,behavior:'instant'});
}

function setView(next){
  toast('');
  view=['activity','library','discover','accounts','queue','about'].includes(next)?next:'activity';
  render();
  window.scrollTo({top:0,behavior:'instant'});
}

function renderLogin(a){
  const connected=Boolean(a.connectedSince)&&['farming','paused','online'].includes(a.status);
  const visible=reachable&&!connected&&!a.samBusy&&view==='activity';show('loginPanel',visible);
  if(!visible){$('steamPassword').value='';return false;}
  if(loginAccount!==a.name){loginAccount=a.name;$('steamUsername').value=a.steamAccountName||'';$('steamPassword').value='';$('guardCode').value='';loginLocalError='';}
  const phase=a.authPhase||'idle',guard=phase==='guard',busy=loginPending||(a.status==='connecting'&&['credentials','steam'].includes(phase));
  const methods=a.authChallenge?.methods||[],codeAvailable=methods.includes('email')||methods.includes('authenticator');
  if(guard&&codeAvailable&&loginLastPhase!=='guard')queueMicrotask(()=>$('guardCode').focus({preventScroll:true}));loginLastPhase=phase;
  for(const method of ['credentials','qr']){const tab=$(method==='qr'?'qrTab':'credentialsTab');tab.setAttribute('aria-selected',String(loginMethod===method));tab.tabIndex=loginMethod===method?0:-1;tab.disabled=loginPending||guard;}
  show('credentialsPane',!guard&&loginMethod==='credentials');show('qrPane',!guard&&loginMethod==='qr');show('guardPane',guard);
  show('guardForm',guard&&codeAvailable);show('approvalHelp',guard&&methods.includes('approval'));
  text('guardHelp',t(codeAvailable?(methods.includes('email')?'emailGuardHelp':'appGuardHelp'):'approvalOnly'));
  $('submitCredentials').disabled=busy;$('submitGuard').disabled=loginPending;
  text('submitCredentials',t(busy?'authConnecting':'signIn'));
  const error=loginLocalError||(a.authError?t('errors.'+a.authError):'');text('authError',error);show('authError',Boolean(error));
  const qr=loginMethod==='qr'&&!guard;show('qrPanel',qr);show('qrImage',qr&&Boolean(a.qrCode));show('qrWaiting',qr&&!a.qrCode);
  if(a.qrCode&&$('qrImage').getAttribute('src')!==a.qrCode)$('qrImage').src=a.qrCode;
  if(!a.qrCode)$('qrImage').removeAttribute('src');
  show('retryQR',qr&&phase!=='qr');$('retryQR').disabled=loginPending;show('loginProgress',busy);text('loginProgress',t(phase==='steam'?'steamConnecting':'authConnecting'));
  show('cancelLogin',['connecting','reconnecting'].includes(a.status));$('cancelLogin').disabled=loginPending;
  return true;
}

function renderSidebar(){
  const signature=JSON.stringify([language,selectedName,reachable,accounts.map(a=>[a.name,a.label,a.status,a.isPaused,a.samBusy,a.gamesPlaying.length,a.avatarUrl,a.displayName])]);
  if(signature===sidebarSignature)return;sidebarSignature=signature;
  $('accountList').innerHTML=accounts.map(a=>`<button class="account-item ${a.name===current()?.name?'selected':''}" data-account="${escape(a.name)}" aria-current="${a.name===current()?.name?'true':'false'}"><img class="rail-avatar" src="${escape(a.avatarUrl||'/avatar.svg')}" data-avatar alt=""><span><strong>${escape(a.label)}</strong><small>${escape(status(a))}</small></span><b>${activeSet(a).size}</b></button>`).join('');
  text('accountTotal',accounts.length);
  let selector=$('accountSelector');
  if(!selector){selector=document.createElement('select');selector.id='accountSelector';selector.className='account-switch';$('accountLabel').after(selector);selector.onchange=()=>selectAccount(selector.value);}
  selector.setAttribute('aria-label',t('chooseAccount'));
  selector.innerHTML=accounts.map(a=>`<option value="${escape(a.name)}">${escape(a.label)}</option>`).join('');selector.value=current()?.name||'';selector.hidden=accounts.length<2;
  $('accountLabel').hidden=accounts.length>1;
}

function gameMarkup(game,a,fromProfile=false){
  const active=activeSet(a).has(game.appid),pin=a.priorityGames.includes(game.appid),owned=game.owned!==false;
  const subtitle=active?t('activeLabel'):fromProfile?(owned?t('owned'):t('notOwned')):pin?t('priorityLabel'):game.remaining?`${game.remaining} ${t('cards').toLocaleLowerCase(locale())}`:t('queued');
  const progress=a.achievements?.[game.appid],busy=achievementBusy.has(a.name+':'+game.appid),failed=achievementErrors.get(a.name+':'+game.appid);
  const achievement=progress?t('achievementCount',progress):failed?t('achievementUnavailable'):t('checkAchievements');
  const complete=owned&&(!progress||progress.unlocked<progress.total)?`<button class="achievement-button sam-open" data-complete-achievements="${game.appid}" ${a.samBusy||achievementBusy.size>0||!reachable||!a.connectedSince?'disabled':''}>${escape(t(progress?'completeAchievements':'inspectLocalAchievements'))}</button>`:'';
  return `<article class="game ${active?'active':''}"><img src="https://cdn.akamai.steamstatic.com/steam/apps/${game.appid}/header.jpg" alt="" loading="lazy" data-game-image><div class="game-body"><div class="game-title" title="${escape(game.name)}">${escape(game.name)}</div><small class="${active?'activity-tag':pin?'priority-tag':''}">${escape(subtitle)}</small><small>${escape(t('ownedHours',{hours:hours(game.playtimeMinutes)}))} · ${game.appid}</small>${a.manualGames?.includes(game.appid)?`<small>${escape(t('manualTag'))}</small>`:''}${owned?`<button class="achievement-button" data-achievement="${game.appid}" title="${escape(t('achievementHelp'))}" ${busy||a.samBusy||!reachable||!a.connectedSince?'disabled':''}>${escape(busy?t('checkingAchievementProgress'):achievement)}</button>${complete}${failed?`<small class="achievement-error">${escape(errorMessage(new Error(failed)))}</small>`:''}`:''}</div><button class="pin" data-pin="${game.appid}" aria-pressed="${pin}" aria-label="${escape(t(pin?'unpin':'pin')+' '+game.name)}" title="${escape(t(pin?'unpin':'pin'))}" ${!owned||mutating||!reachable?'disabled':''}>${pin?'★':'☆'}</button></article>`;
}

function renderGames(id,games,a,fromProfile=false,emptyKey='noGames'){
  const signature=JSON.stringify([language,reachable,mutating,a.name,Boolean(a.connectedSince),fromProfile,emptyKey,games,a.priorityGames,a.manualGames,[...activeSet(a)],a.achievements,a.samBusy,[...achievementBusy],[...achievementErrors]]);
  if(gameSignatures.get(id)===signature)return;gameSignatures.set(id,signature);
  const focused=document.activeElement?.closest('[data-pin]')?.dataset.pin;
  const hadFocus=focused&&$(id).contains(document.activeElement);
  $(id).innerHTML=games.length?games.map(game=>gameMarkup(game,a,fromProfile)).join(''):`<p class="empty">${escape(t(emptyKey))}</p>`;
  if(hadFocus)$(id).querySelector(`[data-pin="${Number(focused)}"]`)?.focus({preventScroll:true});
}

function renderAccounts(){
  const signature=JSON.stringify([language,reachable,mutating,accounts.map(a=>[a.name,a.label,a.status,a.manualPaused,a.library.length,a.priorityGames.length,a.gamesPlaying,a.mode,a.steamId,a.avatarUrl,a.displayName,a.vanityUrl,a.samBusy])]);
  if(signature===accountSignature)return;accountSignature=signature;
  $('accountCards').innerHTML=accounts.map(a=>{
    const offline=['offline','error','skipped'].includes(a.status);
    const id=/^\d{17}$/.test(a.steamId||'')?a.steamId:null;
    const accountId=id?BigInt(id)-76561197960265728n:0n;
    const steam2=`STEAM_0:${accountId%2n}:${accountId/2n}`;
    const vanity=/^[a-zA-Z0-9_-]{1,64}$/.test(a.vanityUrl||'')?a.vanityUrl:null;
    const links=id?[
      [t('steamProfile'),`https://steamcommunity.com/profiles/${id}/`,'steam.ico'],
      ['VacList',`https://vaclist.net/account/${id}`,'vaclist.ico'],
      ['CSRep',`https://csrep.gg/player/${id}`,'csrep.ico'],
      ['CSStats',`https://csstats.gg/player/${id}`,'csstats.ico'],
      ['CSWatch',`https://cswat.ch/stats/${id}`,'cswatch.png'],
      ['SteamIDCheck',`https://steamidcheck.com/profile/${id}`,'steamidcheck.svg']
    ].map(([name,href,icon])=>`<a class="service-link ${icon==='steam.ico'?'steam-profile-link':''}" href="${href}" target="_blank" rel="noopener noreferrer" title="${escape(t('openService',{name}))}"><img src="/logos/${icon}" alt="" loading="lazy"><span>${name}</span><span class="external-arrow" aria-hidden="true">↗</span></a>`).join(''):'';
    return `<article class="account-card" data-status="${escape(a.status)}"><div class="account-identity"><img class="account-avatar" src="${escape(a.avatarUrl||'/avatar.svg')}" data-avatar alt="${escape(t('profilePhoto'))}"><div><h3>${escape(a.displayName||a.label)}</h3><small class="account-label">${escape(a.label)}</small><div class="status">${escape(status(a))}</div></div></div>${id?`<div class="profile-identity"><dl><div><dt>SteamID64</dt><dd>${id}</dd></div><div><dt>SteamID</dt><dd>${steam2}</dd></div><div><dt>Vanity URL</dt><dd>${vanity?`/id/${escape(vanity)}`:escape(t('vanityUnavailable'))}</dd></div></dl></div>`:`<p>${escape(t('loggedOutHelp'))}</p>`}<div class="meta"><div><strong>${a.library.length}</strong><span>${escape(t('totalGames'))}</span></div><div><strong>${activeSet(a).size}</strong><span>${escape(t('active'))}</span></div><div><strong>${a.priorityGames.length}</strong><span>${escape(t('pinned'))}</span></div></div>${links?`<div class="service-links">${links}</div><p class="external-note">${escape(t('externalServicesNote'))}</p>`:''}${a.samBusy?`<p class="account-operation" role="status">${escape(t(a.manualPaused?'samPausePending':'samBusy'))}</p>`:''}<div class="actions"><button class="primary" data-manage="${escape(a.name)}">${escape(t('manage'))}</button><button data-control="${offline?'start':'stop'}" data-name="${escape(a.name)}" ${mutating||!reachable||a.samBusy?'disabled':''}>${escape(t(offline?'connect':'disconnect'))}</button><button data-control="logout" data-name="${escape(a.name)}" ${mutating||!reachable||a.samBusy?'disabled':''}>${escape(t('logout'))}</button><button class="danger-text" data-remove="${escape(a.name)}" ${mutating||!reachable||a.samBusy?'disabled':''}>${escape(t('removeAccount'))}</button></div></article>`;
  }).join('');
}

function render(){
  if(versionMismatch)return;
  if(quitting){
    document.querySelectorAll('main>section,main>.view,main>footer').forEach(element=>element.hidden=true);
    show('connectionBanner',false);show('toast',false);show('shutdownPanel',true);
    text('shutdownTitle',t(appClosed?'appClosed':'appClosing'));
    text('shutdownMessage',t(appClosed?'appClosedHelp':'appClosingHelp'));
    document.querySelectorAll('button,input,select').forEach(element=>element.disabled=true);
    return;
  }
  show('shutdownPanel',false);
  $('shutdownApp').disabled=mutating||loginPending||!reachable||accounts.some(account=>account.samBusy);
  $('shutdownApp').title=t(accounts.some(account=>account.samBusy)?'quitBusyHelp':'quitHelp');
  const a=current();
  document.querySelectorAll('[data-view]').forEach(button=>{button.classList.toggle('selected',button.dataset.view===view);button.setAttribute('aria-current',button.dataset.view===view?'page':'false');});
  for(const name of ['activity','library','discover','accounts','queue','about'])show(name+'View',view===name);
  text('viewName',t(view==='activity'?'dashboard':view));renderSidebar();renderAccounts();
  text('overall',t('connectedAccounts',{count:accounts.filter(x=>['farming','paused','online'].includes(x.status)).length}));
  show('connectionBanner',!reachable);text('connectionBanner',t('offlineBanner'));
  ['pauseAll','resumeAll','addAccount','addAccount2'].forEach(id=>$(id).disabled=mutating||!reachable);
  show('emptyAccounts',!a&&view!=='about');
  if(!a){text('accountLabel','');$('accountLabel').hidden=true;for(const id of ['hero','stats','loginPanel','activityView','libraryView','discoverView','queueView','cardFocus','accountsView'])show(id,false);$('pauseAll').disabled=$('resumeAll').disabled=true;return;}
  const needsLogin=renderLogin(a);
  $('pauseAll').disabled=mutating||!reachable||!accounts.some(x=>(x.samBusy&&!x.manualPaused)||(x.status==='farming'&&!x.isPaused));
  $('resumeAll').disabled=mutating||!reachable||!accounts.some(x=>x.manualPaused);
  text('accountLabel',a.label);const running=reachable&&a.status==='farming'&&!a.isPaused,cardActive=a.mode==='cards'&&a.cardQueue.length>0;
  text('statusLabel',reachable?status(a):t('status.offline'));
  $('stateChip').classList.toggle('warning',!running);
  text('headline',!reachable?t('stoppedTitle'):running?t(a.mode==='fixed'?'workingFixed':cardActive?'workingCards':'workingHours'):a.status==='paused'?t('pausedTitle'):a.status==='offline'?t('stoppedTitle'):a.status==='connecting'||a.status==='online'?t('connectionTitle'):status(a));
  const cardName=a.cardQueue[0]?.name||'';
  text('description',!reachable?t('offlineBanner'):running?cardActive?t('cardsSummary',{game:cardName}):t('prioritySummary',{pinned:a.priorityGames.length,rest:Math.max(0,a.library.length-a.priorityGames.length)}):a.status==='paused'?t(a.manualPaused?'manualPause':'steamPause'):a.qrCode?t('qrHelp'):t('connectIssue'));
  if(a.mode==='fixed'&&running)text('description',t(a.priorityGames.length?'fixedSummary':'fixedEmpty',{count:a.priorityGames.length}));
  if(a.samBusy)text('description',t(a.manualPaused?'samPausePending':'samBusy'));
  if(a.samBusy)text('headline',t('achievementOperation'));
  text('pause',t(a.manualPaused?'resume':'pause'));$('pause').disabled=mutating||!reachable||(!a.samBusy&&!['farming','paused'].includes(a.status));
  const offline=['offline','error','skipped'].includes(a.status);text('connect',t(offline?'connect':'disconnect'));$('connect').disabled=mutating||!reachable||a.samBusy;
  $('logout').disabled=mutating||!reachable||!a.steamId||a.samBusy;
  text('activeCount',reachable?activeSet(a).size:'—');text('libraryCount',a.library.length);text('priorityCount',a.priorityGames.length);text('remainingCards',a.cardCheckedAt?a.cardQueue.reduce((sum,g)=>sum+g.remaining,0):'—');
  show('hero',!needsLogin&&!['accounts','about'].includes(view));show('stats',!needsLogin&&!['accounts','about'].includes(view));
  show('activityView',view==='activity'&&!needsLogin);
  show('logout',false);
  const active=activeSet(a);text('activeSummary',t('expandGames',{count:active.size}));if($('activeDetails').open)renderGames('activeGames',a.library.filter(g=>active.has(g.appid)),a,false,'noActive');
  const names=ids=>ids.map(id=>a.library.find(game=>game.appid===id)?.name||`App ${id}`);
  text('nextPreview',a.nextGames?.length?names(a.nextGames).join(' · '):t('noNext'));
  const qs=JSON.stringify([a.name,a.queue,a.library.map(g=>g.name),language]);
  if(qs!==queueSignature){queueSignature=qs;$('fullQueue').innerHTML=(a.queue||[]).map((group,index)=>`<details class="queue-group"><summary>${escape(index===0?t('nowPlaying'):index===1?t('upNext'):t('queueGroup',{number:index+1}))} <span>${group.length}</span></summary><ol>${group.map(id=>`<li>${escape(a.library.find(g=>g.appid===id)?.name||id)} ${a.priorityGames.includes(id)?'★':''}</li>`).join('')}</ol></details>`).join('')||`<p class="empty">${escape(t('noGames'))}</p>`;}
  $('priorityChips').innerHTML=a.priorityGames.length?a.priorityGames.map(id=>{const g=a.library.find(game=>game.appid===id);return `<button data-show-pin="${id}">★ ${escape(g?.name||id)}</button>`}).join(''):`<p class="empty">${escape(t('prioritiesEmpty'))}</p>`;
  show('fullPins',a.mode!=='fixed'&&a.priorityGames.length>=32);
  show('cardFocus',view==='activity'&&a.mode==='cards'&&!needsLogin);
  text('cardCurrent',a.cardQueue[0]?.name||t(a.cardStatus==='checking'?'checkingCards':'cardFinished'));
  text('cardFocusInfo',a.cardQueue.length?t('cardFocusInfo',{remaining:a.cardQueue[0].remaining,games:a.cardQueue.length,drops:a.cardSessionDrops||0}):t('cardFallback'));
  text('cardChecked',a.cardCheckedAt?t('checked',{time:time(a.cardCheckedAt)}):t('waitingCards'));
  $('cardBadgeLink').href=a.cardQueue[0]?`https://steamcommunity.com/profiles/${a.steamId}/gamecards/${a.cardQueue[0].appid}/`:'https://steamcommunity.com/my/badges/';
  for(const mode of ['hours','cards','fixed']){$(mode).setAttribute('aria-pressed',a.mode===mode);$(mode).disabled=mutating||!reachable;}
  text('modeHelp',t(a.mode==='fixed'?(a.priorityGames.length?'fixedHelp':'fixedEmpty'):a.mode==='hours'?'hoursHelp':'cardsHelp'));
  text('batch',cardActive?`1 / ${a.cardQueue.length}`:a.batchCount?`${a.batchIndex+1} / ${a.batchCount}`:'—');text('lastReport',time(a.lastReportedAt));
  $('next').disabled=mutating||!running||cardActive||a.batchCount<=1;
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

function tick(){if(versionMismatch)return;const a=current();if(!a)return;text('uptime',a.connectedSince?duration(Date.now()-new Date(a.connectedSince)):'—');text('countdown',a.isPaused?t('status.paused'):a.nextBatchAt?Math.max(0,Math.ceil((a.nextBatchAt-Date.now())/60000))+' '+t('min'):'—');text('qrTimer',a.qrExpiresAt?t('qrRemaining',{minutes:Math.max(0,Math.ceil((a.qrExpiresAt-Date.now())/60000))}):'');}

async function poll(){
  if(quitting||versionMismatch)return;
  if(pollTask)return pollTask;
  pollTask=(async()=>{try{const response=await fetch('/api/status',{cache:'no-store'});if(!response.ok)throw Error();const data=await response.json();if(data.version&&data.version!==APP_VERSION){showVersionError();return;}accounts=data.accounts;reachable=true;lastSuccess=Date.now();if(!accounts.some(a=>a.name===selectedName))selectedName=accounts[0]?.name||'';render();}catch(error){console.error('Dashboard update failed',error);reachable=false;render();}finally{pollTask=null;}})();
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
  if(button.dataset.remove){openRemove(button.dataset.remove);return;}
  if(button.dataset.manage){selectAccount(button.dataset.manage);setView('activity');window.scrollTo({top:0});return;}
  if(button.dataset.filter){filter=button.dataset.filter;render();return;}
  if(button.dataset.pin){void togglePriority(Number(button.dataset.pin));return;}
  if(button.dataset.achievement){void checkAchievement(Number(button.dataset.achievement));return;}
  if(button.dataset.completeAchievements){void previewCompletion(Number(button.dataset.completeAchievements));return;}
  if(button.dataset.showPin){filter='priority';setView('library');return;}
  if(button.dataset.close){$(button.dataset.close).close();return;}
  if(button.dataset.control){if(['stop','logout'].includes(button.dataset.control)&&!confirm(t(button.dataset.control==='logout'?'logoutConfirm':'stopConfirm')))return;if(button.dataset.control==='start'){selectAccount(button.dataset.name);setView('activity');}void command(button.dataset.control,button.dataset.name);}
});
document.addEventListener('error',event=>{
  if(event.target instanceof window.HTMLImageElement && event.target.hasAttribute('data-avatar') && !event.target.src.endsWith('/avatar.svg'))event.target.src='/avatar.svg';
  if(event.target instanceof window.HTMLImageElement && event.target.hasAttribute('data-game-image')&&!event.target.hasAttribute('data-fallback')){event.target.setAttribute('data-fallback','');event.target.src='/logo.png';}
},true);

$('dismissToast').onclick=()=>toast('');
$('togglePassword').onclick=()=>{const visible=$('steamPassword').type==='password';$('steamPassword').type=visible?'text':'password';$('togglePassword').setAttribute('aria-pressed',String(visible));text('togglePassword',t(visible?'hidePassword':'showPassword'));};
async function startLogin(method,credentials={}){
  const a=current();if(!a||loginPending)return;loginMethod=method;loginLocalError='';loginPending=true;toast('');render();
  try{await request('/api/login',{name:a.name,method,...credentials});await poll();}
  catch(error){if(current()?.name===a.name)loginLocalError=errorMessage(error);}
  finally{$('steamPassword').value='';$('steamPassword').type='password';$('togglePassword').setAttribute('aria-pressed','false');text('togglePassword',t('showPassword'));loginPending=false;render();}
}
$('credentialsForm').onsubmit=event=>{event.preventDefault();void startLogin('credentials',{accountName:$('steamUsername').value.trim(),password:$('steamPassword').value});};
async function selectLoginMethod(method){
  loginMethod=method;loginLocalError='';toast('');
  if(method==='qr'&&current()?.authPhase!=='qr')await startLogin('qr');
  else if(method==='credentials'&&current()?.authPhase==='qr')await command('stop');
  render();
}
document.querySelectorAll('[data-login-method]').forEach(button=>{
  button.onclick=()=>selectLoginMethod(button.dataset.loginMethod);
  button.onkeydown=async event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){
    event.preventDefault();const other=event.key==='Home'?$('credentialsTab'):event.key==='End'?$('qrTab'):button.id==='qrTab'?$('credentialsTab'):$('qrTab');
    await selectLoginMethod(other.dataset.loginMethod);other.focus();
  }};
});
$('retryQR').onclick=()=>startLogin('qr');
$('cancelLogin').onclick=async()=>{await command('stop');loginLocalError='';render();};
$('guardForm').onsubmit=async event=>{event.preventDefault();const a=current();if(!a||loginPending)return;loginPending=true;loginLocalError='';render();try{await request('/api/guard',{name:a.name,code:$('guardCode').value.trim()});await poll();}catch(error){if(current()?.name===a.name)loginLocalError=errorMessage(error);}finally{$('guardCode').value='';loginPending=false;render();}};

document.querySelectorAll('[data-language]').forEach(b=>b.onclick=()=>{setLanguage(b.dataset.language);translate();});
$('language').onchange=()=>{setLanguage($('language').value);translate();};
$('search').oninput=()=>{$('libraryDetails').open=true;render();};
$('logout').onclick=()=>{if(confirm(t('logoutConfirm')))void command('logout');};
for(const id of ['activeDetails','libraryDetails','profileDetails'])$(id).addEventListener('toggle',render);
$('pause').onclick=()=>command(current()?.manualPaused?'resume':'pause');
$('connect').onclick=()=>{const a=current();if(!a)return;const action=['offline','error','skipped'].includes(a.status)?'start':'stop';if(action==='stop'&&!confirm(t('stopConfirm')))return;void command(action);};
$('next').onclick=()=>command('next');$('hours').onclick=()=>command('hours');$('cards').onclick=()=>command('cards');$('fixed').onclick=()=>command('fixed');
$('refreshCards').onclick=()=>command('refreshCards');$('refreshLibrary').onclick=()=>command('refreshLibrary');
$('scanAll').onclick=async()=>{await command('refreshLibrary');filter='all';setView('library');};
$('pauseAll').onclick=()=>command('pause','*');$('resumeAll').onclick=()=>command('resume','*');
$('showPriorities').onclick=()=>{filter='all';$('libraryDetails').open=true;setView('library');};
function openAdd(){text('addError','');$('newLabel').value='';$('addDialog').showModal();$('newLabel').focus();}
$('addAccount').onclick=openAdd;$('addAccount2').onclick=openAdd;$('addFirstAccount').onclick=openAdd;
$('addForm').onsubmit=async event=>{
  event.preventDefault();const button=event.submitter;button.disabled=true;text('addError','');
  try{const result=await request('/api/accounts',{label:$('newLabel').value.trim()});if(pollTask)await pollTask;await poll();selectAccount(result.name);$('addDialog').close();setView('activity');window.scrollTo({top:0});}
  catch(error){text('addError',errorMessage(error));}finally{button.disabled=false;}
};
function openRemove(name){const a=accounts.find(item=>item.name===name);if(!a||mutating||a.samBusy)return;$('removeDialog').dataset.name=name;text('removeLabel',a.label);text('removeError','');$('removeDialog').showModal();}
$('removeFromSettings').onclick=()=>{const name=$('settingsDialog').dataset.name;$('settingsDialog').close();openRemove(name);};
$('removeForm').onsubmit=async event=>{event.preventDefault();if(mutating)return;const name=$('removeDialog').dataset.name;mutating=true;render();$('confirmRemove').disabled=true;text('confirmRemove',t('removingAccount'));text('removeError','');
try{await request('/api/remove-account',{name,confirmed:true});$('removeDialog').close();if(selectedName===name){selectedName='';loginAccount='';profileResult=null;loginLocalError='';$('steamPassword').value='';$('guardCode').value='';try{localStorage.removeItem('steam-hourforge-x.account');}catch{}}if(pollTask)await pollTask;await poll();toast(t('accountRemoved'));}
catch(error){text('removeError',errorMessage(error));}finally{mutating=false;$('confirmRemove').disabled=false;text('confirmRemove',t('removeAccountConfirm'));render();}};
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
  catch(error){if(current()?.name===a.name)text('profileStatus',errorMessage(error));}
  finally{profileBusy=false;render();}
};
async function checkAchievement(appid){
  const a=current();if(!a)return;const key=a.name+':'+appid;if(achievementBusy.has(key))return;
  achievementBusy.add(key);achievementErrors.delete(key);render();
  try{await request('/api/achievements',{name:a.name,appid});await poll();}
  catch(error){achievementErrors.set(key,error.message);}
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
translate();poll();const pollTimer=setInterval(poll,3000),tickTimer=setInterval(tick,1000);
async function checkShutdown(){
  try{
    await fetch('/api/status',{cache:'no-store',signal:AbortSignal.timeout(2000)});
    shutdownPollTimer=setTimeout(checkShutdown,300);
  }catch(error){
    if(error.name==='TimeoutError'||error.name==='AbortError'){shutdownPollTimer=setTimeout(checkShutdown,500);return;}
    appClosed=true;shutdownPollTimer=null;render();
    try{window.close();}catch{/* Browser-owned tabs can refuse script closing; keep the closed screen. */}
  }
}
$('shutdownApp').onclick=async()=>{
  if(quitting||mutating||loginPending||accounts.some(account=>account.samBusy))return;
  const controls=[...document.querySelectorAll('button,input,select')].map(element=>[element,element.disabled]);
  quitting=true;render();
  try{
    await request('/api/shutdown',{confirmed:true});
    clearInterval(pollTimer);clearInterval(tickTimer);clearTimeout(toastTimer);
    $('steamPassword').value='';$('guardCode').value='';
    await checkShutdown();
  }catch(error){quitting=false;for(const [element,disabled] of controls)element.disabled=disabled;render();toast(errorMessage(error),true);}
};

async function previewCompletion(appid){
  const a=current();if(!a||samWriting)return;
  const sequence=++samPreviewSequence;
  samPreview=null;const dialog=$('achievementDialog');
  text('samGame',(a.library.find(game=>game.appid===appid)?.name||appid)+' · '+appid);text('samAccount',a.label+' · '+a.steamId);
  text('samStatus',t('samPreviewLoading'));$('samMissingList').innerHTML='';show('samWarning',false);show('applyAchievements',false);$('applyAchievements').disabled=true;
  if(!dialog.open)dialog.showModal();
  try{
    const result=await request('/api/achievement-preview',{name:a.name,appid});
    if(!dialog.open||sequence!==samPreviewSequence)return;
    samPreview={...result,name:a.name};
    const missing=result.achievements.filter(row=>!row.unlocked);
    text('samStatus',missing.length?t('samMissing',{count:missing.length}):t('samAllDone'));
    $('samMissingList').innerHTML=missing.map(row=>`<li><label class="achievement-choice"><input type="checkbox" name="samSelected" value="${escape(row.id)}" checked><span>${escape(row.name)} <small>${escape(row.id)}</small></span></label></li>`).join('');
    show('samWarning',Boolean(result.nonce));show('applyAchievements',Boolean(result.nonce));$('applyAchievements').disabled=!result.nonce;
    await poll();
  }catch(error){if(dialog.open&&sequence===samPreviewSequence)text('samStatus',errorMessage(error));}
}
function closeAchievement(){if(!samWriting){samPreviewSequence++;samPreview=null;$('achievementDialog').close();}}
$('closeAchievement').onclick=closeAchievement;$('cancelAchievement').onclick=closeAchievement;
$('achievementDialog').addEventListener('cancel',event=>{if(samWriting)event.preventDefault();else{samPreviewSequence++;samPreview=null;}});
$('samMissingList').addEventListener('change',()=>{$('applyAchievements').disabled=samWriting||!$('samMissingList').querySelector('input:checked');});
$('selectAllAchievements').onclick=()=>{$('samMissingList').querySelectorAll('input').forEach(input=>input.checked=true);$('samMissingList').dispatchEvent(new window.Event('change'));};
$('clearAchievements').onclick=()=>{$('samMissingList').querySelectorAll('input').forEach(input=>input.checked=false);$('samMissingList').dispatchEvent(new window.Event('change'));};
$('applyAchievements').onclick=async()=>{
  const preview=samPreview;if(!preview||!preview.nonce||samWriting)return;
  if(Date.now()>preview.expiresAt){text('samStatus',t('samExpired'));$('applyAchievements').disabled=true;return;}
  samWriting=true;$('applyAchievements').disabled=true;$('closeAchievement').disabled=true;$('cancelAchievement').disabled=true;text('samStatus',t('samWorking'));
  try{
    const ids=[...$('samMissingList').querySelectorAll('input:checked')].map(input=>input.value);
    const allSelected=ids.length===preview.achievements.filter(row=>!row.unlocked).length;
    const result=await request('/api/achievement-complete',{name:preview.name,appid:preview.appid,nonce:preview.nonce,confirmed:true,...(allSelected?{}:{ids})});
    text('samStatus',t('samComplete',{completed:result.completed,rejected:result.rejected}));
    samPreview=null;show('applyAchievements',false);show('samWarning',false);await poll();
  }catch(error){text('samStatus',errorMessage(error));samPreview=null;show('applyAchievements',false);}
  finally{samWriting=false;$('closeAchievement').disabled=false;$('cancelAchievement').disabled=false;gameSignatures.clear();render();}
};


