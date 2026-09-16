(()=>{
const SECURE_API='/api/secure-state';
const TOKEN_KEY='ballyhack-auth-token';
const PLAYER_KEY='ballyhack-current-player';
const QUEUE_KEY='ballyhack-sync-queue-v1';

// Carry a previous browser-wide sign-in into this tab once, then stop sharing it.
const legacyPlayer=localStorage.getItem(PLAYER_KEY);
const legacyToken=localStorage.getItem(TOKEN_KEY);
if(legacyPlayer&&legacyToken&&!sessionStorage.getItem(TOKEN_KEY)){
  sessionStorage.setItem(PLAYER_KEY,legacyPlayer);
  sessionStorage.setItem(TOKEN_KEY,legacyToken);
}
localStorage.removeItem(PLAYER_KEY);
localStorage.removeItem(TOKEN_KEY);
const entryUrl=new URL(location.href);
if(entryUrl.searchParams.get('switchPlayer')==='1'){
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(PLAYER_KEY);
  entryUrl.searchParams.delete('switchPlayer');
  const remaining=entryUrl.searchParams.toString();
  history.replaceState(null,'',entryUrl.pathname+(remaining?'?'+remaining:'')+entryUrl.hash);
}
let syncMessage='Checking connection…';
let syncTone='pending';
let lastSync='';
let lastRequestError='';
const originalScore=score;
const originalAdmin=admin;
const originalBind=bind;
const originalRender=render;

function authToken(){return sessionStorage.getItem(TOKEN_KEY)||''}
function switchPlayer(){
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(PLAYER_KEY);
  location.reload();
}
function updateHeaderIdentity(){
  const container=document.querySelector('#headerIdentity');
  if(!container)return;
  container.replaceChildren();
  const user=currentUser();
  if(!user||!authToken())return;
  container.append('Signed in as ');
  const name=document.createElement('button');
  name.type='button';
  name.className='sync-player-link';
  name.textContent=user;
  name.setAttribute('aria-label','Change player, currently signed in as '+user);
  name.addEventListener('click',switchPlayer);
  container.append(name);
  if(user==='David Glenn')container.append(' · Commissioner');
}
function mutationId(){
  return globalThis.crypto?.randomUUID?.()||
    Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
}
function queue(){
  try{return JSON.parse(localStorage.getItem(QUEUE_KEY)||'[]').map(({authToken,...item})=>item)}catch{return []}
}
function setQueue(items){localStorage.setItem(QUEUE_KEY,JSON.stringify(items))}
setQueue(queue()); // Remove tokens from older offline queue entries without discarding scores.
function setSync(message,tone='pending'){
  syncMessage=message; syncTone=tone;
  document.querySelectorAll('[data-sync-status]').forEach(el=>{
    el.textContent=message;
    el.className='sync-status '+tone;
  });
}
function queuePayload(payload){
  const items=queue();
  const {authToken,...safe}=payload;
  if(!items.some(x=>x.mutationId===payload.mutationId))items.push(safe);
  setQueue(items);
  setSync(items.length+' change'+(items.length===1?'':'s')+' saved on this phone — waiting to sync','pending');
}
function reapplyQueued(){
  for(const item of queue()){
    if(item.op==='score'&&item.actor===currentUser()&&(item.epoch??null)===(state.epoch??null)){
      state.scores[item.round]??={};
      state.scores[item.round][item.player]??={};
      state.scores[item.round][item.player][item.hole]=item.gross?String(item.gross):'';
    }
  }
}
const settingKeyFor=op=>({sideGame:'sideGames',nassauGroup:'nassauGroups',nassauBetConfig:'nassauBets',fortyBallSelection:'fortyBallSelections',fortyBallBet:'fortyBallBets'})[op];
const pendingSettings=new Map();
function secureRequest(payload,options={}){
  const key=settingKeyFor(payload.op);
  if(!key)return sendSecureRequest(payload,options);
  const snapshot=structuredClone(payload);
  const next=(pendingSettings.get(key)||Promise.resolve()).catch(()=>{}).then(()=>sendSecureRequest(snapshot,options));
  pendingSettings.set(key,next);
  next.finally(()=>{if(pendingSettings.get(key)===next)pendingSettings.delete(key)});
  return next;
}
async function sendSecureRequest(payload,{allowQueue=true}={}){
  lastRequestError='';
  const enriched={
    ...payload,
    actor:payload.actor||currentUser(),
    authToken:payload.authToken||authToken(),
    mutationId:payload.mutationId||mutationId(),
    epoch:payload.epoch??state.epoch??null,
    ...(settingKeyFor(payload.op)?{expectedRevision:state.revisions?.[settingKeyFor(payload.op)]??null}:{})
  };
  allowQueue=allowQueue&&enriched.op==='score';
  try{
    const response=await fetch(SECURE_API,{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify(enriched)
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok){
      lastRequestError=data.error||('API '+response.status);
      if(response.status===401){
        sessionStorage.removeItem(TOKEN_KEY);
        setSync('PIN sign-in required','bad');
      }else if(response.status===409){
        setSync('Another phone changed this entry — refresh and review','bad');
      }else setSync(data.error||'Change was not accepted','bad');
      const err=new Error(data.error||('API '+response.status));
      err.httpStatus=response.status;
      throw err;
    }
    lastSync=new Date().toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});
    if(data.settingKey){state.revisions??={};state.revisions[data.settingKey]=data.revision}
    setSync('All changes synced · '+lastSync,'good');
    return data;
  }catch(error){
    lastRequestError=error?.message||'Unable to reach the scoring service';
    if(allowQueue&&!error.httpStatus){
      queuePayload(enriched);
      return {queued:true};
    }
    if(error.httpStatus)loadShared().then(()=>render());
    else if(!allowQueue)setSync('Not saved — reconnect and retry','bad');
    return null;
  }
}
apiPost=(payload)=>secureRequest(payload);

loadShared=async()=>{
  try{
    const response=await fetch(SECURE_API,{
      cache:'no-store',
      headers:{
        'x-ballyhack-player':currentUser(),
        'x-ballyhack-token':authToken()
      }
    });
    if(!response.ok)throw new Error('API '+response.status);
    const remote=await response.json();
    state={
      ...state,
      ...remote,
      photos:{...(remote.photos||{})},
      setup:{...(remote.setup||{})},
      access:{...(remote.access||{})},
      scores:{...(remote.scores||{})},
      charges:{...(remote.charges||{})},
      locks:{...(remote.locks||{})},
      unlockRequests:{...(remote.unlockRequests||{})},
      audit:[...(remote.audit||[])],
      activity:[...(remote.activity||[])],
      testers:[...(remote.testers||[])],
      backups:[...(remote.backups||[])],
      revisions:{...(remote.revisions||{})},
      epoch:remote.epoch??null,
      sideGames:{1:'None',2:'None',3:'None',4:'None',...(remote.sideGames||{})}
    };
    reapplyQueued();
    save();
    lastSync=new Date().toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});
    const pending=queue(),stale=pending.some(x=>x.actor!==currentUser()||(x.epoch??null)!==(state.epoch??null));
    setSync(stale?'Pending scores need review — use Retry or Discard':pending.length?pending.length+' changes waiting to sync':'All changes synced · '+lastSync,stale?'bad':pending.length?'pending':'good');
    return true;
  }catch(error){
    setSync(queue().length?queue().length+' changes saved on this phone — offline':'Offline — new scores will be saved on this phone','pending');
    return false;
  }
};

async function flushQueue(){
  if(!navigator.onLine||!authToken())return;
  const items=queue();
  if(!items.length)return;
  const remaining=[];
  for(const item of items){
    if(item.actor!==currentUser()){
      remaining.push(item);
      setSync('Pending scores belong to '+item.actor+' — sign in as that golfer to sync','bad');
      continue;
    }
    const result=await secureRequest(item,{allowQueue:false});
    if(!result)remaining.push(item);
  }
  setQueue(remaining);
  if(!remaining.length){
    await loadShared();
    render();
  }else if(remaining.some(item=>item.actor!==currentUser())){
    setSync('Pending scores belong to another golfer — sign in as that golfer to sync','bad');
  }else setSync(remaining.length+' changes need review or another sync attempt','pending');
}
function locked(round,group){return !!state.locks?.[round]?.[group]}
function canEdit(round,group){
  return currentUser()==='David Glenn'||roundGroupNames(round,group).includes(currentUser());
}
function groupProgress(round,group){
  const names=roundGroupNames(round,group);
  let entered=0;
  for(const name of names)for(let hole=1;hole<=18;hole++){
    if(+(state.scores?.[round]?.[name]?.[hole]||0)>0)entered++;
  }
  return {entered,missing:72-entered,complete:entered===72,names};
}
function firstMissingScore(round,group){
  const names=roundGroupNames(round,group);
  for(let hole=1;hole<=18;hole++)for(const name of names){
    if(+(state.scores?.[round]?.[name]?.[hole]||0)<=0)return {name,hole};
  }
  return null;
}
function setScoreLanding(player){
  const round=defaultRoundForToday();
  const group=roundGroupNames(round,1).includes(player)?1:2;
  const missing=firstMissingScore(round,group);
  sessionStorage.r=String(round);
  sessionStorage.group=String(group);
  sessionStorage.hole=String(missing?.hole||18);
  sessionStorage.scoreRoundDate=easternDateKey();
  tab='Score';
}
function focusMissingScore(missing){
  const input=[...document.querySelectorAll('[data-score-player]')].find(x=>
    x.dataset.scorePlayer===missing.name&&+x.dataset.hole===missing.hole
  );
  if(!input)return;
  input.classList.add('missing-score-target');
  input.scrollIntoView({behavior:'smooth',block:'center'});
  input.focus({preventScroll:true});
  input.select?.();
  const playerCard=input.closest('.score-player');
  playerCard?.insertAdjacentHTML('afterbegin','<div class="missing-score-label">Missing score · Hole '+missing.hole+'</div>');
}
function syncPanel(){
  return '<div class="sync-panel"><span class="sync-dot"></span><strong data-sync-status class="sync-status '+syncTone+'">'+syncMessage+'</strong>'+
    (queue().length?'<button class="secondary small" id="retrySync">Retry Now</button><button class="secondary small" id="discardQueue">Discard Pending</button>':'')+'</div>';
}
function commissionerUnlockPanel(){
  if(currentUser()!=='David Glenn')return '';
  if(!document.querySelector('#unlock-request-style')){
    const style=document.createElement('style');style.id='unlock-request-style';
    style.textContent='.unlock-request-panel{margin:12px 0;padding:14px;border:2px solid #d89a12;border-radius:12px;background:#fff8dc}.unlock-request-panel h3{margin:3px 0 10px}.unlock-request-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 0;border-top:1px solid #ead398}.unlock-request-row small{display:block;margin-top:3px;color:#6b5a2b}@media(max-width:760px){.unlock-request-row{align-items:stretch;flex-direction:column}.unlock-request-row button{width:100%}}';
    document.head.appendChild(style);
  }
  const requests=Object.values(state.unlockRequests||{});
  if(!requests.length)return '';
  return '<section class="unlock-request-panel"><div class="eyebrow">UNLOCK REQUESTS</div><h3>Scorecard Correction Requested</h3>'+requests.map(request=>
    '<div class="unlock-request-row"><span><b>Round '+request.round+' · Group '+request.group+'</b><small>'+roundGroupNames(+request.round,+request.group).join(', ')+'</small><small>Requested by '+request.requestedBy+(request.requestedAt?' · '+new Date(request.requestedAt).toLocaleString():'')+'</small></span><button class="primary small" data-approve-unlock="'+request.round+'-'+request.group+'">Unlock Scorecard</button></div>'
  ).join('')+'</section>';
}

score=function(){
  const round=+(sessionStorage.r||1);
  const group=+(sessionStorage.group||1);
  const progress=groupProgress(round,group);
  const isLocked=locked(round,group);
  const unlockRequest=state.unlockRequests?.[round+'-'+group];
  const mayRequest=isLocked&&currentUser()!=='David Glenn'&&canEdit(round,group);
  let html=originalScore();
  const review='<section class="score-review '+(isLocked?'locked':'')+'">'+
    '<div><div class="eyebrow">SCORECARD CONTROL</div><h3>'+(isLocked?'Scorecard Locked':'Review & Confirm Foursome')+'</h3>'+
    (!isLocked?'<p>'+(progress.complete?'All 72 gross scores are entered. Review the card before locking it.':progress.missing+' of 72 gross scores are still missing.')+'</p>':(unlockRequest?'<p>Unlock requested by '+unlockRequest.requestedBy+'.</p>':''))+'</div>'+
    '<div class="review-actions">'+
    (!isLocked&&!progress.complete?'<button class="secondary" id="findMissingScore">Find Missing Score</button>':'')+
    (!isLocked&&progress.complete&&canEdit(round,group)?'<button class="primary" id="lockGroup">Confirm & Lock</button>':'')+
    (mayRequest&&!unlockRequest?'<button class="secondary" id="requestUnlock">Request Unlock</button>':'')+
    (mayRequest&&unlockRequest?'<button class="secondary" disabled>Unlock Requested</button>':'')+
    (isLocked&&currentUser()==='David Glenn'?'<button class="secondary" id="unlockGroup">Commissioner Unlock</button>':'')+
    '</div></section>';
  html=html.replace('<section class="card scoring-card">','<section class="card scoring-card">'+syncPanel()+commissionerUnlockPanel());
  return html.replace('</section>',review+'</section>');
};

admin=function(){
  let html=originalAdmin();
  if(currentUser()!=='David Glenn'||!authToken())return html;
  const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const when=value=>value?new Date(value).toLocaleString():'—';
  const testers=state.testers||[];
  const testerRows=testers.length?testers.map(x=>'<tr><td>'+escapeHtml(x.player)+'</td><td>'+when(x.pin_created_at)+'</td><td>'+when(x.last_sign_in)+'</td><td>'+when(x.last_activity)+'</td></tr>').join(''):'<tr><td colspan="4">No PINs created yet.</td></tr>';
  const events=(state.activity||[]).slice(0,100);
  const eventRows=events.length?events.map(x=>'<tr><td>'+when(x.created_at)+'</td><td>'+escapeHtml(x.actor)+'</td><td>'+escapeHtml(x.action)+'</td><td>'+escapeHtml(x.detail)+'</td></tr>').join(''):'<tr><td colspan="4">No activity recorded yet.</td></tr>';
  const audit=(state.audit||[]).slice(0,30);
  const backupOptions=(state.backups||[]).map(x=>'<option value="'+Number(x.id)+'">'+escapeHtml(new Date(x.created_at).toLocaleString()+' · '+x.reason+' · '+x.created_by)+'</option>').join('');
  const auditRows=audit.length?audit.map(x=>
    '<tr><td>'+new Date(x.created_at).toLocaleString()+'</td><td>'+x.actor+'</td><td>R'+x.round_no+' · H'+x.hole+' · '+x.player+'</td><td>'+
    (x.old_gross??'—')+' → '+(x.new_gross??'—')+'</td><td>'+(x.undone_at?'Undone':'<button class="secondary small" data-undo="'+x.id+'">Undo</button>')+'</td></tr>'
  ).join(''):'<tr><td colspan="5">No score changes recorded yet.</td></tr>';
  const integrity='<section class="card"><h2>Tournament Integrity</h2>'+syncPanel()+
    '<p><b>Signed in:</b> '+(currentUser()||'None')+(currentUser()==='David Glenn'?' · Commissioner':'')+'</p>'+
    '<div class="integrity-actions"><button class="primary" id="manualBackup">Create Backup</button>'+
    '<button class="secondary" id="exportCsv">Download Scores CSV</button>'+
    '<button class="secondary" id="exportJson">Download Current State</button>'+
    '<button class="secondary" id="changePlayer">Change Player / PIN</button></div>'+
    '<div class="pin-reset"><label><b>Restore a Saved Checkpoint</b><select id="restoreBackupId"><option value="">Select backup</option>'+backupOptions+'</select></label><button class="secondary" id="restoreBackup" '+(backupOptions?'':'disabled')+'>Restore Selected Backup</button></div>'+
    '<p class="notice">Restoring saves a new checkpoint first. It replaces scores, wagers, charges, and scorecard locks, but does not change PINs or erase the audit history. Other phones must refresh; pending offline scores need review.</p>'+
    '<div class="pin-reset"><label><b>Commissioner PIN Recovery</b><select id="resetPinPlayer"><option value="">Select golfer</option>'+
    PLAYERS.filter(p=>p.name!=='David Glenn').map(p=>'<option>'+p.name+'</option>').join('')+
    '</select></label><button class="secondary" id="resetPlayerPin">Reset Selected PIN</button></div>'+
    '<p class="notice">Automatic checkpoints are saved during scoring and whenever a foursome is locked. Latest backup: '+
    (state.latestBackup?new Date(state.latestBackup.created_at).toLocaleString():'not created yet')+'.</p></section>'+
    '<section class="card"><h2>Score Change History</h2><div class="table-wrap"><table><thead><tr><th>Time</th><th>Changed By</th><th>Score</th><th>Change</th><th>Action</th></tr></thead><tbody>'+
    auditRows+'</tbody></table></div></section>';
  const activityPanel='<section class="card"><h2>Tester Activity</h2><p class="muted">Commissioner only. PIN creation is shown separately from sign-ins and changes. Events begin when this feature is published.</p><div class="table-wrap"><table><thead><tr><th>Golfer</th><th>PIN Created</th><th>Last Sign-In</th><th>Last Change</th></tr></thead><tbody>'+testerRows+'</tbody></table></div><h3>Recent Events</h3><div class="table-wrap"><table><thead><tr><th>Time</th><th>Golfer</th><th>Action</th><th>Details</th></tr></thead><tbody>'+eventRows+'</tbody></table></div></section>';
  return layout(activityPanel)+html+layout(integrity);
};

bind=function(){
  document.querySelectorAll('[data-score-player]').forEach(input=>input.addEventListener('change',event=>{
    const value=Number(event.currentTarget.value);
    if(value&&((value<1||value>20)||(value>12&&!confirm('Confirm a gross score above 12?')))){
      event.preventDefault();
      event.stopImmediatePropagation();
      event.currentTarget.value=event.currentTarget.defaultValue;
      setSync('Score was not changed','bad');
    }
  },true));
  originalBind();
  document.querySelector('#retrySync')?.addEventListener('click',flushQueue);
  document.querySelector('#discardQueue')?.addEventListener('click',async()=>{
    if(!confirm('Permanently discard the unsynced score changes on this device?'))return;
    setQueue([]);await loadShared();render();
  });
  document.querySelector('#findMissingScore')?.addEventListener('click',()=>{
    const round=+(sessionStorage.r||1),group=+(sessionStorage.group||1);
    const missing=firstMissingScore(round,group);
    if(!missing)return;
    sessionStorage.hole=missing.hole;
    render();
    requestAnimationFrame(()=>focusMissingScore(missing));
  });
  document.querySelector('#requestUnlock')?.addEventListener('click',async()=>{
    const round=+(sessionStorage.r||1),group=+(sessionStorage.group||1);
    if(!confirm('Ask the commissioner to unlock this scorecard for a correction?'))return;
    const result=await apiPost({op:'requestUnlock',round,group});
    if(result){await loadShared();render();alert('Unlock request sent to David.')}
  });
  document.querySelectorAll('[data-approve-unlock]').forEach(button=>button.addEventListener('click',async()=>{
    const [round,group]=button.dataset.approveUnlock.split('-').map(Number);
    if(!confirm('Unlock Round '+round+', Group '+group+' for corrections?'))return;
    const result=await apiPost({op:'unlockGroup',round,group});
    if(result){sessionStorage.r=round;sessionStorage.group=group;await loadShared();render()}
  }));
  document.querySelector('#lockGroup')?.addEventListener('click',async()=>{
    const round=+(sessionStorage.r||1),group=+(sessionStorage.group||1);
    if(!confirm('Confirm all scores for this foursome and lock the scorecard?'))return;
    const result=await apiPost({op:'lockGroup',round,group});
    if(result){await loadShared();render()}
  });
  document.querySelector('#unlockGroup')?.addEventListener('click',async()=>{
    const round=+(sessionStorage.r||1),group=+(sessionStorage.group||1);
    if(!confirm('Unlock this foursome scorecard for corrections?'))return;
    const result=await apiPost({op:'unlockGroup',round,group});
    if(result){await loadShared();render()}
  });
  document.querySelectorAll('[data-undo]').forEach(button=>button.addEventListener('click',async()=>{
    if(!confirm('Undo this score change? A backup will be created first.'))return;
    const result=await apiPost({op:'undoScore',auditId:+button.dataset.undo});
    if(result){await loadShared();render()}
  }));
  document.querySelector('#manualBackup')?.addEventListener('click',async()=>{
    const result=await apiPost({op:'backup'});
    if(result){await loadShared();render();alert('Backup created.')}
  });
  document.querySelector('#restoreBackup')?.addEventListener('click',async()=>{
    const backupId=Number(document.querySelector('#restoreBackupId')?.value);
    if(!backupId)return;
    if(queue().length){alert('Sync or discard the pending scores on this device before restoring a backup.');return}
    if(prompt('This replaces the beta scores, wagers, charges, and locks for everyone. Type RESTORE to continue:')!=='RESTORE')return;
    const result=await apiPost({op:'restoreBackup',backupId});
    if(result){await loadShared();render();alert('Checkpoint restored. Ask other testers to refresh before making changes.')}
  });
  document.querySelector('#exportCsv')?.addEventListener('click',downloadCsv);
  document.querySelector('#exportJson')?.addEventListener('click',downloadJson);
  document.querySelector('#resetPlayerPin')?.addEventListener('click',async()=>{
    const player=document.querySelector('#resetPinPlayer')?.value;
    if(!player||!confirm('Reset '+player+"'s PIN? They will create a new PIN on their next visit."))return;
    const result=await apiPost({op:'resetPin',player});
    if(result)alert(player+' can now create a new PIN.');
  });
  document.querySelector('#changePlayer')?.addEventListener('click',()=>{
    switchPlayer();
  });
};

render=function(){
  const nav=document.querySelector('#nav');
  const commissioner=currentUser()==='David Glenn'&&!!authToken();
  let commissionerTab=nav?.querySelector('button[data-tab="More"]');
  if(commissioner&&!commissionerTab){
    commissionerTab=document.createElement('button');
    commissionerTab.dataset.tab='More';
    commissionerTab.textContent='Commissioner';
    nav.appendChild(commissionerTab);
  }else if(!commissioner){
    commissionerTab?.remove();
    if(tab==='More')tab='Score';
  }
  originalRender();
  updateHeaderIdentity();
  if(tab==='Score'){
    const round=+(sessionStorage.r||1),group=+(sessionStorage.group||1);
    const disabled=locked(round,group)||!canEdit(round,group)||!authToken();
    document.querySelectorAll('[data-score-player]').forEach(input=>{
      input.disabled=disabled;
      input.min='1'; input.max='20';
      input.title=locked(round,group)?'Scorecard locked':(!canEdit(round,group)?'Only this foursome or the commissioner may edit':'');
    });
    if(disabled&&!locked(round,group)&&authToken()){
      document.querySelector('.scoring-card')?.insertAdjacentHTML('afterbegin','<div class="permission-note">Viewing only — switch to your assigned foursome to enter scores.</div>');
    }
  }
};

function download(name,type,content){
  const link=document.createElement('a');
  link.href=URL.createObjectURL(new Blob([content],{type}));
  link.download=name;
  link.click();
  setTimeout(()=>URL.revokeObjectURL(link.href),1000);
}
function downloadJson(){
  download('Ballyhack-Fall-Classic-backup-'+new Date().toISOString().slice(0,10)+'.json','application/json',JSON.stringify(state,null,2));
}
function csvCell(value){
  const s=String(value??'');
  return '"'+s.replaceAll('"','""')+'"';
}
function downloadCsv(){
  const rows=[['Round','Player','Hole','Gross','Net Stableford Points']];
  for(let round=1;round<=4;round++)for(const p of PLAYERS)for(let hole=1;hole<=18;hole++){
    const gross=+(state.scores?.[round]?.[p.name]?.[hole]||0);
    if(gross)rows.push([round,p.name,hole,gross,stableford(gross,PAR[hole-1],strokes(p.ch,SI[hole-1]))]);
  }
  download('Ballyhack-Fall-Classic-scores.csv','text/csv',rows.map(row=>row.map(csvCell).join(',')).join('\n'));
}

identityGate=function(){
  if(currentUser()&&authToken())return;
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(PLAYER_KEY);
  document.querySelector('.identity-overlay')?.remove();
  const overlay=document.createElement('div');
  overlay.className='identity-overlay';
  overlay.innerHTML='<div class="identity-card"><img src="assets/ballyhack-logo.png" alt="Ballyhack">'+
    '<h2>Golfer Sign In</h2><p>Select your name and enter your private four-digit PIN. If you are returning to David Glenn, select David and enter the same PIN you used before. A new golfer chooses a PIN on their first visit.</p>'+
    '<select id="identitySelect"><option value="">Select golfer</option>'+PLAYERS.map(p=>'<option>'+p.name+'</option>').join('')+'</select>'+
    '<input id="identityPin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="current-password" placeholder="4-digit PIN">'+
    '<p class="login-error" id="loginError"></p><button type="button" class="primary" id="identitySave">Continue</button></div>';
  document.body.appendChild(overlay);
  overlay.querySelector('#identitySave').onclick=async()=>{
    const player=overlay.querySelector('#identitySelect').value;
    const pin=overlay.querySelector('#identityPin').value;
    const error=overlay.querySelector('#loginError');
    if(!player||!/^\d{4}$/.test(pin)){error.textContent='Select your name and enter exactly four digits.';return}
    const button=overlay.querySelector('#identitySave');
    button.disabled=true;
    button.textContent='Working…';
    error.textContent='Creating or checking PIN… this can take about 10 seconds.';
    const result=await secureRequest({op:'auth',player,pin,actor:player,authToken:''},{allowQueue:false});
    button.disabled=false;
    button.textContent='Continue';
    if(!result){error.textContent=lastRequestError||'That PIN was not accepted. Try again.';return}
    sessionStorage.setItem(PLAYER_KEY,player);
    sessionStorage.setItem(TOKEN_KEY,result.token);
    overlay.remove();
    await markAccess();
    await loadShared();
    setScoreLanding(player);
    render();
  };
};

window.addEventListener('online',flushQueue);
window.addEventListener('offline',()=>setSync('Offline — new scores will be saved on this phone','pending'));
setInterval(flushQueue,10000);
setTimeout(()=>{
  render();
  identityGate();
  flushQueue();
},0);
})();
