import {hasScores,validateWagerChange,validAmount} from '../../lib/wager-rules.js';
const PLAYERS = new Set(['Tyler Bohannon','Nick Condeni','David Glenn','Scott Karl','Will Long','Bill McCombs','Joe Phelan','Jason Wain']);
const GROUPS = {
  1:{1:['David Glenn','Nick Condeni','Bill McCombs','Will Long'],2:['Jason Wain','Joe Phelan','Tyler Bohannon','Scott Karl']},
  2:{1:['Tyler Bohannon','Scott Karl','Bill McCombs','Will Long'],2:['David Glenn','Nick Condeni','Jason Wain','Joe Phelan']},
  3:{1:['Jason Wain','Joe Phelan','Bill McCombs','Will Long'],2:['David Glenn','Nick Condeni','Tyler Bohannon','Scott Karl']},
  4:{1:['Nick Condeni','Joe Phelan','Scott Karl','Will Long'],2:['David Glenn','Jason Wain','Tyler Bohannon','Bill McCombs']}
};

function json(data,status=200){
  return Response.json(data,{status,headers:{'cache-control':'no-store'}});
}
function now(){return new Date().toISOString()}
let activityReady;
async function ensureActivity(db){
  activityReady??=db.prepare('CREATE TABLE IF NOT EXISTS tournament_activity (id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT NOT NULL, action TEXT NOT NULL, detail TEXT, created_at TEXT NOT NULL)').run().catch(error=>{activityReady=null;throw error});
  await activityReady;
}
async function activity(db,actor,action,detail=''){
  await db.prepare('INSERT INTO tournament_activity (actor,action,detail,created_at) VALUES (?,?,?,?)').bind(actor,action,detail,now()).run();
}
function hex(bytes){return [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('')}
function randomHex(size=32){const bytes=new Uint8Array(size);crypto.getRandomValues(bytes);return hex(bytes)}
function same(a,b){
  if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;
  let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;
}
async function sha256(value){return hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(value))))}
async function pinHash(pin,salt){
  const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(String(pin)),'PBKDF2',false,['deriveBits']);
  return hex(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:new TextEncoder().encode(salt),iterations:100000},material,256));
}
async function loginAttempts(db){
  await db.prepare('CREATE TABLE IF NOT EXISTS tournament_login_attempts (player TEXT PRIMARY KEY, failed_count INTEGER NOT NULL, window_start INTEGER NOT NULL, locked_until INTEGER NOT NULL DEFAULT 0)').run();
}
let sessionsReady;
async function loginSessions(db){
  sessionsReady??=db.prepare('CREATE TABLE IF NOT EXISTS tournament_login_sessions (token_hash TEXT PRIMARY KEY, player TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL)').run().catch(error=>{sessionsReady=null;throw error});
  await sessionsReady;
}
function waitForLogin(lockedUntil,clock){
  const seconds=Math.max(1,Math.ceil((lockedUntil-clock)/1000));
  return json({error:`Too many incorrect PIN attempts. Try again in ${seconds} seconds.`,retryAfterSeconds:seconds},429);
}
async function recordBadPin(db,player,clock){
  const cutoff=clock-15*60*1000;
  const row=await db.prepare(`INSERT INTO tournament_login_attempts (player,failed_count,window_start,locked_until)
    VALUES (?,1,?,0) ON CONFLICT(player) DO UPDATE SET
      locked_until=CASE WHEN window_start<=? THEN 0 WHEN failed_count+1<5 THEN 0
        WHEN failed_count+1=5 THEN ?+60000 WHEN failed_count+1=6 THEN ?+300000 ELSE ?+900000 END,
      failed_count=CASE WHEN window_start<=? THEN 1 ELSE failed_count+1 END,
      window_start=CASE WHEN window_start<=? THEN ? ELSE window_start END
    RETURNING failed_count,locked_until`).bind(player,clock,cutoff,clock,clock,clock,cutoff,cutoff,clock).first();
  return Number(row.locked_until)>clock?waitForLogin(Number(row.locked_until),clock):json({error:'Incorrect PIN'},401);
}
function groupFor(round,player){return Number(Object.keys(GROUPS[round]||{}).find(g=>GROUPS[round][g].includes(player))||0)}
function inGroup(round,group,player){return !!GROUPS[round]?.[group]?.includes(player)}
function parse(value,fallback={}){try{return value==null?fallback:JSON.parse(value)}catch{return fallback}}
async function setting(db,key,fallback){const row=await db.prepare('SELECT value FROM tournament_settings WHERE key=?').bind(key).first();return parse(row?.value,fallback)}
async function putSetting(db,key,value){
  await db.prepare("INSERT INTO tournament_settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at")
    .bind(key,JSON.stringify(value),now()).run();
}
// Compare-and-swap: a stale phone must refresh instead of overwriting another phone's edit.
async function modifySetting(db,key,expected,change){
  const row=await db.prepare('SELECT value,updated_at FROM tournament_settings WHERE key=?').bind(key).first();
  if((row?.updated_at||null)!==(expected??null))return json({error:'This side-game setting changed on another phone. The latest version is loading; please review and try again.'},409);
  const value=change(parse(row?.value,{})),revision=now()+'-'+randomHex(4);
  const result=row
    ?await db.prepare('UPDATE tournament_settings SET value=?,updated_at=? WHERE key=? AND updated_at=?').bind(JSON.stringify(value),revision,key,row.updated_at).run()
    :await db.prepare('INSERT OR IGNORE INTO tournament_settings (key,value,updated_at) VALUES (?,?,?)').bind(key,JSON.stringify(value),revision).run();
  if(result.meta.changes!==1)return json({error:'Another phone saved this setting first. Refresh and try again.'},409);
  return json({ok:true,revision,settingKey:key});
}
async function mutateServerSetting(db,key,change){
  for(let attempt=0;attempt<4;attempt++){
    const row=await db.prepare('SELECT updated_at FROM tournament_settings WHERE key=?').bind(key).first();
    const result=await modifySetting(db,key,row?.updated_at||null,change);
    if(result.status!==409)return result;
  }
  return json({error:'Another scorecard request changed; please retry'},409);
}

async function snapshot(db){
  const [scores,players,settings,charges,locks]=await Promise.all([
    db.prepare('SELECT round_no,player,hole,gross FROM tournament_scores ORDER BY round_no,player,hole').all(),
    db.prepare('SELECT player,photo,setup_at,last_accessed_at FROM tournament_players').all(),
    db.prepare('SELECT key,value,updated_at FROM tournament_settings').all(),
    db.prepare('SELECT player,amount FROM tournament_charges').all(),
    db.prepare('SELECT round_no,group_no,locked_by,locked_at FROM tournament_group_locks').all()
  ]);
  const out={backupVersion:2,scores:{},setup:{},access:{},photos:{},sideGames:{1:'None',2:'None',3:'None',4:'None'},fortyBallSelections:{},fortyBallBets:{},nassauGroups:{},nassauBets:{},unlockRequests:{},charges:{},locks:{},revisions:{},frozen:false,epoch:null};
  for(const s of scores.results){
    out.scores[s.round_no]??={};out.scores[s.round_no][s.player]??={};out.scores[s.round_no][s.player][s.hole]=String(s.gross);
  }
  for(const p of players.results){
    if(p.photo)out.photos[p.player]=p.photo;if(p.setup_at)out.setup[p.player]=p.setup_at;if(p.last_accessed_at)out.access[p.player]=p.last_accessed_at;
  }
  for(const s of settings.results){
    out.revisions[s.key]=s.updated_at;
    const value=parse(s.value,null);
    if(s.key==='epoch')out.epoch=value;
    if(s.key==='sideGames')out.sideGames=value||out.sideGames;
    if(s.key==='fortyBallSelections')out.fortyBallSelections=value||{};
    if(s.key==='fortyBallBets')out.fortyBallBets=value||{};
    if(s.key==='nassauGroups')out.nassauGroups=value||{};
    if(s.key==='nassauBets')out.nassauBets=value||{};
    if(s.key==='unlockRequests')out.unlockRequests=value||{};
    if(s.key==='frozen')out.frozen=!!value;
  }
  for(const c of charges.results)out.charges[c.player]=Number(c.amount);
  for(const lock of locks.results){out.locks[lock.round_no]??={};out.locks[lock.round_no][lock.group_no]={lockedBy:lock.locked_by,lockedAt:lock.locked_at}}
  return out;
}

async function authenticate(db,request,body={}){
  const player=String(body.actor||request.headers.get('x-ballyhack-player')||'');
  const token=String(body.authToken||request.headers.get('x-ballyhack-token')||'');
  if(!PLAYERS.has(player)||!token)return null;
  await loginSessions(db);
  const digest=await sha256(token);
  const session=await db.prepare('SELECT expires_at FROM tournament_login_sessions WHERE player=? AND token_hash=?').bind(player,digest).first();
  const row=await db.prepare('SELECT player,token_hash,token_expires_at,role FROM tournament_credentials WHERE player=?').bind(player).first();
  if(!row)return null;
  if(session){
    if(Date.parse(session.expires_at)<=Date.now())return null;
    if(Date.parse(session.expires_at)-Date.now()<30*86400000){
      await db.prepare('UPDATE tournament_login_sessions SET expires_at=? WHERE player=? AND token_hash=?')
        .bind(new Date(Date.now()+365*86400000).toISOString(),player,digest).run();
    }
  }else{
    // Existing signed-in devices migrate without asking for their PIN again.
    if(!row.token_hash||Date.parse(row.token_expires_at)<=Date.now()||!same(row.token_hash,digest))return null;
    await db.prepare('INSERT OR IGNORE INTO tournament_login_sessions (token_hash,player,created_at,expires_at) VALUES (?,?,?,?)')
      .bind(digest,player,now(),new Date(Date.now()+365*86400000).toISOString()).run();
  }
  return {player,role:row.role};
}

async function createBackup(db,reason,actor,force=false){
  if(!force){
    const recent=await db.prepare("SELECT id FROM tournament_backups WHERE datetime(created_at) > datetime('now','-15 minutes') LIMIT 1").first();
    if(recent)return recent.id;
  }
  const state=await snapshot(db);
  const result=await db.prepare('INSERT INTO tournament_backups (reason,snapshot,created_by,created_at) VALUES (?,?,?,?)')
    .bind(reason,JSON.stringify(state),actor,now()).run();
  await db.prepare('DELETE FROM tournament_backups WHERE id NOT IN (SELECT id FROM tournament_backups ORDER BY created_at DESC LIMIT 40)').run();
  return result.meta.last_row_id;
}

async function restoreBackup(db,id,actor){
  const row=await db.prepare('SELECT snapshot FROM tournament_backups WHERE id=?').bind(id).first();
  if(!row)return json({error:'Backup not found'},404);
  const saved=parse(row.snapshot,null);
  if(saved?.backupVersion!==2||!saved.scores||!saved.locks||!saved.nassauBets)return json({error:'This older backup cannot be restored in the app'},409);
  const scores=[],players=[],charges=[],locks=[],stamp=now();
  for(const [r,perPlayer] of Object.entries(saved.scores))for(const [name,holes] of Object.entries(perPlayer))for(const [h,gross] of Object.entries(holes)){
    if(!GROUPS[Number(r)]||!PLAYERS.has(name)||!(Number(h)>=1&&Number(h)<=18)||!(Number(gross)>=1&&Number(gross)<=20))return json({error:'Invalid backup score'},409);
    scores.push([Number(r),name,Number(h),Number(gross)]);
  }
  for(const name of PLAYERS)if(saved.photos?.[name]||saved.setup?.[name]||saved.access?.[name])players.push([name,saved.photos?.[name]||null,saved.setup?.[name]||null,saved.access?.[name]||null]);
  for(const [name,amount] of Object.entries(saved.charges||{})){if(!PLAYERS.has(name)||!Number.isFinite(Number(amount)))return json({error:'Invalid backup charge'},409);charges.push([name,Number(amount)])}
  for(const [r,groups] of Object.entries(saved.locks))for(const [g,lock] of Object.entries(groups)){
    if(!GROUPS[Number(r)]?.[Number(g)]||!PLAYERS.has(lock.lockedBy))return json({error:'Invalid backup lock'},409);
    locks.push([Number(r),Number(g),lock.lockedBy,lock.lockedAt]);
  }
  // A single D1 batch is transactional. Preserve credentials, history and all backup rows.
  await createBackup(db,`Before restoring backup ${id}`,actor,true);
  const epoch=randomHex(12);
  const statements=[
    db.prepare('DELETE FROM tournament_scores'),db.prepare('DELETE FROM tournament_players'),
    db.prepare('DELETE FROM tournament_settings'),db.prepare('DELETE FROM tournament_charges'),db.prepare('DELETE FROM tournament_group_locks'),
    db.prepare("INSERT INTO tournament_scores (round_no,player,hole,gross,updated_at) SELECT json_extract(value,'$[0]'),json_extract(value,'$[1]'),json_extract(value,'$[2]'),json_extract(value,'$[3]'),? FROM json_each(?)").bind(stamp,JSON.stringify(scores)),
    db.prepare("INSERT INTO tournament_players (player,photo,setup_at,last_accessed_at,updated_at) SELECT json_extract(value,'$[0]'),json_extract(value,'$[1]'),json_extract(value,'$[2]'),json_extract(value,'$[3]'),? FROM json_each(?)").bind(stamp,JSON.stringify(players)),
    db.prepare("INSERT INTO tournament_charges (player,amount,updated_at) SELECT json_extract(value,'$[0]'),json_extract(value,'$[1]'),? FROM json_each(?)").bind(stamp,JSON.stringify(charges)),
    db.prepare("INSERT INTO tournament_group_locks (round_no,group_no,locked_by,locked_at) SELECT json_extract(value,'$[0]'),json_extract(value,'$[1]'),json_extract(value,'$[2]'),json_extract(value,'$[3]') FROM json_each(?)").bind(JSON.stringify(locks))
  ];
  for(const key of ['sideGames','fortyBallSelections','fortyBallBets','nassauGroups','nassauBets','frozen']){
    statements.push(db.prepare('INSERT INTO tournament_settings (key,value,updated_at) VALUES (?,?,?)').bind(key,JSON.stringify(saved[key]??(key==='frozen'?false:{})),stamp+'-'+randomHex(4)));
  }
  statements.push(db.prepare('INSERT INTO tournament_settings (key,value,updated_at) VALUES (?,?,?)').bind('epoch',JSON.stringify(epoch),stamp+'-'+randomHex(4)));
  await db.batch(statements);
  await activity(db,actor,'Backup restored',`Backup ${id}`);
  return json({ok:true,epoch});
}

async function authAction(db,body){
  const player=String(body.player||''),pin=String(body.pin||'');
  if(!PLAYERS.has(player))return json({error:'Select a golfer'},400);
  if(!/^\d{4}$/.test(pin))return json({error:'PIN must be exactly four digits'},400);
  await loginAttempts(db);
  const clock=Date.now();
  const attempts=await db.prepare('SELECT locked_until FROM tournament_login_attempts WHERE player=?').bind(player).first();
  if(Number(attempts?.locked_until)>clock)return waitForLogin(Number(attempts.locked_until),clock);
  const existing=await db.prepare('SELECT pin_hash,salt,role FROM tournament_credentials WHERE player=?').bind(player).first();
  let role=player==='David Glenn'?'admin':'player';
  if(existing){
    if(!same(existing.pin_hash,await pinHash(pin,existing.salt)))return recordBadPin(db,player,clock);
    role=existing.role;
  }else{
    const salt=randomHex(16);
    await db.prepare('INSERT INTO tournament_credentials (player,pin_hash,salt,role,created_at,updated_at) VALUES (?,?,?,?,?,?)')
      .bind(player,await pinHash(pin,salt),salt,role,now(),now()).run();
    await activity(db,player,'PIN created');
  }
  await db.prepare('DELETE FROM tournament_login_attempts WHERE player=?').bind(player).run();
  await loginSessions(db);
  const token=randomHex(32),expires=new Date(Date.now()+365*86400000).toISOString();
  await db.prepare('INSERT INTO tournament_login_sessions (token_hash,player,created_at,expires_at) VALUES (?,?,?,?)')
    .bind(await sha256(token),player,now(),expires).run();
  await db.prepare('UPDATE tournament_credentials SET updated_at=? WHERE player=?').bind(now(),player).run();
  await activity(db,player,'Signed in');
  return json({ok:true,player,role,token,firstUse:!existing});
}

async function groupScores(db,round,group){
  const rows=await db.prepare('SELECT player,hole,gross FROM tournament_scores WHERE round_no=?').bind(round).all();
  const names=GROUPS[round][group],scores={};
  for(const row of rows.results)if(names.includes(row.player)){scores[row.player]??={};scores[row.player][row.hole]=row.gross}
  return scores;
}
async function isLocked(db,round,group){return !!await db.prepare('SELECT 1 AS yes FROM tournament_group_locks WHERE round_no=? AND group_no=?').bind(round,group).first()}
async function baseOperation(db,body,actor){
  const op=body?.op;
  if(body.player&&!PLAYERS.has(body.player))return json({error:'Unknown player'},400);
  if(op==='score'){
    const round=Number(body.round),hole=Number(body.hole),gross=Number(body.gross);
    if(!(round>=1&&round<=4&&hole>=1&&hole<=18&&PLAYERS.has(body.player)))return json({error:'Invalid score location'},400);
    if(!gross)await db.prepare('DELETE FROM tournament_scores WHERE round_no=? AND player=? AND hole=?').bind(round,body.player,hole).run();
    else{
      if(!(gross>=1&&gross<=20))return json({error:'Invalid score'},400);
      await db.prepare('INSERT INTO tournament_scores (round_no,player,hole,gross,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(round_no,player,hole) DO UPDATE SET gross=excluded.gross,updated_at=excluded.updated_at')
        .bind(round,body.player,hole,gross,now()).run();
    }
  }else if(op==='photo'){
    const photo=String(body.photo||'');if(photo.length>500000)return json({error:'Photo too large'},413);
    await db.prepare('INSERT INTO tournament_players (player,photo,updated_at) VALUES (?,?,?) ON CONFLICT(player) DO UPDATE SET photo=excluded.photo,updated_at=excluded.updated_at')
      .bind(body.player,photo,now()).run();
  }else if(op==='setup'){
    const timestamp=now();
    await db.prepare('INSERT INTO tournament_players (player,setup_at,last_accessed_at,updated_at) VALUES (?,?,?,?) ON CONFLICT(player) DO UPDATE SET setup_at=COALESCE(tournament_players.setup_at,excluded.setup_at),last_accessed_at=excluded.last_accessed_at,updated_at=excluded.updated_at')
      .bind(body.player,timestamp,timestamp,timestamp).run();
  }else if(op==='access'){
    const timestamp=now();
    await db.prepare('INSERT INTO tournament_players (player,last_accessed_at,updated_at) VALUES (?,?,?) ON CONFLICT(player) DO UPDATE SET last_accessed_at=excluded.last_accessed_at,updated_at=excluded.updated_at')
      .bind(body.player,timestamp,timestamp).run();
  }else if(op==='charge'){
    const amount=Number(body.amount||0);
    await db.prepare('INSERT INTO tournament_charges (player,amount,updated_at) VALUES (?,?,?) ON CONFLICT(player) DO UPDATE SET amount=excluded.amount,updated_at=excluded.updated_at')
      .bind(body.player,amount,now()).run();
  }else if(op==='sideGame'){
    const round=Number(body.round);
    if(!GROUPS[round]||!['None','40 Ball','Nassau 5-5-5-1-1-1','Nassau 5-5-5-3','Nassau 6-6-6'].includes(body.value))return json({error:'Invalid side game'},400);
    if(await isLocked(db,round,1)||await isLocked(db,round,2))return json({error:'Unlock both scorecards before changing the side game'},423);
    const beforeGames=await setting(db,'sideGames',{});
    const before=beforeGames[round]??beforeGames[String(round)]??'None';
    if(actor?.role!=='admin'&&(hasScores(GROUPS[round][1],await groupScores(db,round,1))||hasScores(GROUPS[round][2],await groupScores(db,round,2)))){
      if(before!==body.value)return json({error:'Ask the commissioner to change the side game after scoring begins'},409);
    }
    const result=await modifySetting(db,'sideGames',body.expectedRevision,current=>{current[String(round)]=body.value;return current});
    if(!result.ok)return result;
    if(body.value==='None'||(before==='None'&&body.value==='40 Ball')){
      const cleared=await mutateServerSetting(db,'fortyBallSelections',current=>{delete current[String(round)];return current});
      if(!cleared.ok)return cleared;
    }
    return result;
  }else if(op==='nassauGroup'){
    const round=Number(body.round),group=Number(body.group);if(!(round>=1&&round<=4&&group>=1&&group<=2))return json({error:'Invalid Nassau group'},400);
    if(body.value&& !['Nassau 6-6-6','Nassau 5-5-5-1-1-1','Nassau 5-5-5-3'].includes(body.value))return json({error:'Invalid Nassau format'},400);
    if(await isLocked(db,round,group))return json({error:'Unlock the scorecard before changing its side game'},423);
    const existing=await setting(db,'nassauGroups',{}),old=existing[round]?.[group]||null,value=body.value?(body.value==='Nassau 6-6-6'?'Nassau 6-6-6':'Nassau 5-5-5-1-1-1'):null;
    const wagers=await setting(db,'nassauBets',{});
    if(old!==value&&(wagers[round]?.[group]?.presses||[]).length)return json({error:'Remove recorded presses before changing the Nassau format'},409);
    if(old!==value&&hasScores(GROUPS[round][group],await groupScores(db,round,group))&&actor?.role!=='admin')return json({error:'Ask the commissioner to change a format after scoring begins'},409);
    return modifySetting(db,'nassauGroups',body.expectedRevision,current=>{current[String(round)]??={};if(value)current[String(round)][String(group)]=value;else delete current[String(round)][String(group)];return current});
  }else if(op==='nassauBetConfig'){
    const round=Number(body.round),group=Number(body.group);if(!(round>=1&&round<=4&&group>=1&&group<=2))return json({error:'Invalid Nassau bet group'},400);
    if(await isLocked(db,round,group))return json({error:'Unlock the scorecard before changing wagers'},423);
    const current=await setting(db,'nassauBets',{}),previous=current[round]?.[group]||{value:0,presses:[]},formats=await setting(db,'nassauGroups',{}),format=formats[round]?.[group];
    const games=await setting(db,'sideGames',{});if(games[round]==='40 Ball')return json({error:'Nassau wagers are unavailable during 40 Ball'},409);
    const error=validateWagerChange({names:GROUPS[round][group],format,scores:await groupScores(db,round,group),previous,next:body.config,actor:actor?.player,admin:actor?.role==='admin'});
    if(error)return json({error},409);
    return modifySetting(db,'nassauBets',body.expectedRevision,value=>{value[String(round)]??={};value[String(round)][String(group)]=body.config;return value});
  }else if(op==='fortyBallSelection'){
    const round=Number(body.round),group=Number(body.group),hole=Number(body.hole);if(!(round>=1&&round<=4&&group>=1&&group<=2&&hole>=1&&hole<=18&&PLAYERS.has(body.player)))return json({error:'Invalid 40 Ball selection'},400);
    if(!inGroup(round,group,body.player))return json({error:'Golfer is not in this group'},400);
    if(await isLocked(db,round,group))return json({error:'Unlock the scorecard before changing 40 Ball selections'},423);
    const games=await setting(db,'sideGames',{});if(games[round]!=='40 Ball')return json({error:'40 Ball is not selected for this round'},409);
    const scored=await db.prepare('SELECT gross FROM tournament_scores WHERE round_no=? AND player=? AND hole=?').bind(round,body.player,hole).first();
    if(body.value&&!scored)return json({error:'Enter a score before counting it in 40 Ball'},409);
    const existingSelections=await setting(db,'fortyBallSelections',{});
    const existingGroup=existingSelections?.[round]?.[group]||{};
    const selectionKey=`${body.player}|${hole}`;
    if(body.value&&!existingGroup[selectionKey]&&Object.values(existingGroup).filter(Boolean).length>=40){
      return json({error:'40 scores are already counted for this group'},409);
    }
    return modifySetting(db,'fortyBallSelections',body.expectedRevision,current=>{current[String(round)]??={};current[String(round)][String(group)]??={};const key=`${body.player}|${hole}`;if(body.value)current[String(round)][String(group)][key]=true;else delete current[String(round)][String(group)][key];return current});
  }else if(op==='fortyBallBet'){
    const round=Number(body.round),value=Number(body.value);if(!GROUPS[round]||!validAmount(value))return json({error:'Invalid 40 Ball wager'},400);
    if(await isLocked(db,round,1)||await isLocked(db,round,2))return json({error:'Unlock both scorecards before changing the wager'},423);
    const current=await setting(db,'fortyBallBets',{});
    if(actor?.role!=='admin'&&Number(current[round]||0)!==value&&(hasScores(GROUPS[round][1],await groupScores(db,round,1))||hasScores(GROUPS[round][2],await groupScores(db,round,2))))return json({error:'Ask the commissioner to change a wager after scoring begins'},409);
    return modifySetting(db,'fortyBallBets',body.expectedRevision,current=>{current[String(round)]=value;return current});
  }else if(op==='frozen')await putSetting(db,'frozen',!!body.value);
  else if(op==='clearScores')await db.prepare('DELETE FROM tournament_scores').run();
  else if(op==='reset')return json({error:'Partial reset is disabled. Use a checkpoint restore or a verified beta reset procedure.'},409);
  else return json({error:'Unknown operation'},400);
  return json({ok:true});
}

async function handle(context){
  const {request,env}=context,db=env.DB;
  if(!db)return json({error:'Cloudflare D1 binding DB is not configured'},503);
  try{
    await ensureActivity(db);

    // One-time beta-only clean slate for manual testing on 2026-09-21 14:16 ET.
    // Preserve credentials, player setup/photos, backups, and activity history.
    const resetMarker='2026-09-21T18:16-beta-clean-v3';
    if((await setting(db,'betaResetMarker',null))!==resetMarker){
      await db.batch([
        db.prepare('DELETE FROM tournament_scores'),
        db.prepare('DELETE FROM tournament_charges'),
        db.prepare('DELETE FROM tournament_group_locks'),
        db.prepare('DELETE FROM tournament_score_audit')
      ]);
      await putSetting(db,'sideGames',{1:'None',2:'None',3:'None',4:'None'});
      await putSetting(db,'fortyBallSelections',{});
      await putSetting(db,'fortyBallBets',{});
      await putSetting(db,'nassauGroups',{});
      await putSetting(db,'nassauBets',{});
      await putSetting(db,'unlockRequests',{});
      await putSetting(db,'frozen',false);
      await putSetting(db,'epoch',randomHex(12));
      await putSetting(db,'betaResetMarker',resetMarker);
      await activity(db,'System','Beta test data reset','Scores, side games, wagers, selections, locks, charges, and score audit cleared');
    }
    if(request.method==='GET'){
      const out=await snapshot(db),actor=await authenticate(db,request);
      if(actor?.role!=='admin'){
        out.unlockRequests=Object.fromEntries(Object.entries(out.unlockRequests||{}).filter(([,request])=>
          actor&&inGroup(Number(request.round),Number(request.group),actor.player)
        ));
      }
      out.safeguards={authenticated:!!actor,actor:actor?.player||null,role:actor?.role||'spectator'};
      if(actor?.role==='admin'){
        out.audit=(await db.prepare('SELECT id,round_no,group_no,player,hole,old_gross,new_gross,actor,action,created_at,undone_at,undone_by FROM tournament_score_audit ORDER BY created_at DESC LIMIT 75').all()).results;
        out.latestBackup=await db.prepare('SELECT id,reason,created_by,created_at FROM tournament_backups ORDER BY created_at DESC LIMIT 1').first();
        out.backups=(await db.prepare("SELECT id,reason,created_by,created_at FROM tournament_backups WHERE json_extract(snapshot,'$.backupVersion')=2 ORDER BY id DESC LIMIT 10").all()).results;
        out.activity=(await db.prepare('SELECT actor,action,detail,created_at FROM tournament_activity ORDER BY id DESC LIMIT 100').all()).results;
        out.testers=(await db.prepare("SELECT c.player,c.created_at AS pin_created_at,c.updated_at AS last_sign_in,(SELECT MAX(a.created_at) FROM tournament_activity a WHERE a.actor=c.player AND a.action NOT IN ('Signed in','PIN created')) AS last_activity FROM tournament_credentials c ORDER BY c.player").all()).results;
      }
      return json(out);
    }
    if(request.method!=='POST')return json({error:'Method not allowed'},405);
    const body=await request.json();
    if(body?.op==='auth')return authAction(db,body);
    const actor=await authenticate(db,request,body);if(!actor)return json({error:'Sign in with your player PIN'},401);
    const epoch=await setting(db,'epoch',null);
    if((body.epoch??null)!==epoch)return json({error:'Tournament state was restored. Refresh before submitting changes; pending offline scores need review.'},409);
    const op=String(body?.op||'');
    if(op==='lockGroup'){
      const round=Number(body.round),group=Number(body.group);if(!inGroup(round,group,actor.player)&&actor.role!=='admin')return json({error:'You can only confirm your own foursome'},403);
      const names=GROUPS[round]?.[group]||[],count=await db.prepare('SELECT COUNT(*) AS count FROM tournament_scores WHERE round_no=? AND player IN (?,?,?,?)').bind(round,...names).first();
      if(Number(count.count)!==72)return json({error:`Cannot lock: ${72-Number(count.count)} scores are still missing`},409);
      await createBackup(db,`Before Round ${round} Group ${group} lock`,actor.player,true);
      await db.prepare('INSERT OR IGNORE INTO tournament_group_locks (round_no,group_no,locked_by,locked_at) VALUES (?,?,?,?)').bind(round,group,actor.player,now()).run();
      await activity(db,actor.player,'Scorecard locked',`Round ${round}, Group ${group}`);
      const cleared=await mutateServerSetting(db,'unlockRequests',requests=>{delete requests[round+'-'+group];return requests});if(!cleared.ok)return cleared;
      return json({ok:true});
    }
    if(op==='requestUnlock'){
      const round=Number(body.round),group=Number(body.group);
      if(!(round>=1&&round<=4&&group>=1&&group<=2))return json({error:'Invalid scorecard'},400);
      if(!inGroup(round,group,actor.player)&&actor.role!=='admin')return json({error:'You can only request access to your own foursome'},403);
      const locked=await db.prepare('SELECT 1 AS yes FROM tournament_group_locks WHERE round_no=? AND group_no=?').bind(round,group).first();
      if(!locked)return json({error:'This scorecard is already open'},409);
      const saved=await mutateServerSetting(db,'unlockRequests',requests=>{requests[round+'-'+group]={round,group,requestedBy:actor.player,requestedAt:now()};return requests});if(!saved.ok)return saved;
      await activity(db,actor.player,'Unlock requested',`Round ${round}, Group ${group}`);
      return json({ok:true});
    }
    if(op==='unlockGroup'){
      if(actor.role!=='admin')return json({error:'Commissioner access required'},403);const round=Number(body.round),group=Number(body.group);
      await createBackup(db,`Before Round ${round} Group ${group} unlock`,actor.player,true);
      await db.prepare('DELETE FROM tournament_group_locks WHERE round_no=? AND group_no=?').bind(round,group).run();
      await activity(db,actor.player,'Scorecard unlocked',`Round ${round}, Group ${group}`);
      const cleared=await mutateServerSetting(db,'unlockRequests',requests=>{delete requests[round+'-'+group];return requests});if(!cleared.ok)return cleared;
      return json({ok:true});
    }
    if(op==='undoScore'){
      if(actor.role!=='admin')return json({error:'Commissioner access required'},403);
      const change=await db.prepare('SELECT * FROM tournament_score_audit WHERE id=? AND undone_at IS NULL').bind(Number(body.auditId)).first();if(!change)return json({error:'Change is unavailable or already undone'},409);
      const locked=await db.prepare('SELECT 1 AS yes FROM tournament_group_locks WHERE round_no=? AND group_no=?').bind(change.round_no,change.group_no).first();if(locked)return json({error:'Unlock this foursome before undoing a score'},423);
      await createBackup(db,`Before undoing audit ${change.id}`,actor.player,true);
      const result=await baseOperation(db,{op:'score',round:change.round_no,player:change.player,hole:change.hole,gross:change.old_gross||0});if(!result.ok)return result;
      const timestamp=now(),mutation=String(body.mutationId||randomHex(12)).slice(0,100);
      await db.batch([
        db.prepare('UPDATE tournament_score_audit SET undone_at=?,undone_by=? WHERE id=?').bind(timestamp,actor.player,change.id),
        db.prepare('INSERT INTO tournament_score_audit (mutation_id,round_no,group_no,player,hole,old_gross,new_gross,actor,action,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)').bind(mutation,change.round_no,change.group_no,change.player,change.hole,change.new_gross,change.old_gross,actor.player,'undo',timestamp)
      ]);await activity(db,actor.player,'Score change undone',`Round ${change.round_no}, ${change.player}, Hole ${change.hole}`);return json({ok:true});
    }
    if(op==='resetPin'){
      if(actor.role!=='admin')return json({error:'Commissioner access required'},403);const target=String(body.player||'');if(!PLAYERS.has(target)||target==='David Glenn')return json({error:'Select another golfer'},400);
      await db.prepare('DELETE FROM tournament_credentials WHERE player=?').bind(target).run();
      await loginAttempts(db);
      await db.prepare('DELETE FROM tournament_login_attempts WHERE player=?').bind(target).run();
      await loginSessions(db);
      await db.prepare('DELETE FROM tournament_login_sessions WHERE player=?').bind(target).run();
      await activity(db,actor.player,'PIN reset',target);return json({ok:true});
    }
    if(op==='backup'){
      if(actor.role!=='admin')return json({error:'Commissioner access required'},403);const backupId=await createBackup(db,'Manual commissioner backup',actor.player,true);await activity(db,actor.player,'Backup created');return json({ok:true,backupId});
    }
    if(op==='restoreBackup'){
      if(actor.role!=='admin')return json({error:'Commissioner access required'},403);
      return restoreBackup(db,Number(body.backupId),actor.player);
    }
    const adminOnly=new Set(['charge','frozen','clearScores','reset']);if(adminOnly.has(op)&&actor.role!=='admin')return json({error:'Commissioner access required'},403);
    if(op==='photo'&&body.player!==actor.player&&actor.role!=='admin')return json({error:'You can only change your own photo'},403);
    if((op==='setup'||op==='access')&&body.player!==actor.player&&actor.role!=='admin')return json({error:'Invalid player action'},403);
    if((op==='nassauGroup'||op==='nassauBetConfig'||op==='fortyBallSelection')&&actor.role!=='admin'&&!inGroup(Number(body.round),Number(body.group),actor.player))return json({error:'You can only manage your own foursome'},403);
    if(op==='score'){
      const round=Number(body.round),hole=Number(body.hole),target=String(body.player||''),group=groupFor(round,target);
      if(!group||(!inGroup(round,group,actor.player)&&actor.role!=='admin'))return json({error:'You can only score your own foursome'},403);
      if(await db.prepare('SELECT 1 AS yes FROM tournament_group_locks WHERE round_no=? AND group_no=?').bind(round,group).first())return json({error:'This foursome scorecard is locked'},423);
      const mutation=String(body.mutationId||randomHex(12)).slice(0,100);if(await db.prepare('SELECT id FROM tournament_score_audit WHERE mutation_id=?').bind(mutation).first())return json({ok:true,duplicate:true});
      const before=await db.prepare('SELECT gross FROM tournament_scores WHERE round_no=? AND player=? AND hole=?').bind(round,target,hole).first();
      if(Number(body.expectedGross??0)!==Number(before?.gross??0))return json({error:'This score changed on another phone. Refresh and review before editing it.'},409);
      const gross=Number(body.gross||0);if(!(Number.isInteger(gross)&&gross>=0&&gross<=20))return json({error:'Invalid gross score'},400);
      await createBackup(db,'Automatic scoring checkpoint',actor.player,false);
      const saved=!gross
        ?await db.prepare('DELETE FROM tournament_scores WHERE round_no=? AND player=? AND hole=? AND gross=?').bind(round,target,hole,Number(body.expectedGross)).run()
        :before
          ?await db.prepare('UPDATE tournament_scores SET gross=?,updated_at=? WHERE round_no=? AND player=? AND hole=? AND gross=?').bind(gross,now(),round,target,hole,Number(body.expectedGross)).run()
          :await db.prepare('INSERT OR IGNORE INTO tournament_scores (round_no,player,hole,gross,updated_at) VALUES (?,?,?,?,?)').bind(round,target,hole,gross,now()).run();
      if(saved.meta.changes!==1)return json({error:'This score changed on another phone. Refresh and review before editing it.'},409);
      await db.prepare('INSERT INTO tournament_score_audit (mutation_id,round_no,group_no,player,hole,old_gross,new_gross,actor,action,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
        .bind(mutation,round,group,target,hole,before?.gross??null,Number(body.gross)||null,actor.player,'score',now()).run();
      await activity(db,actor.player,'Score edited',`Round ${round}, ${target}, Hole ${hole}: ${before?.gross??'blank'} → ${Number(body.gross)||'blank'}`);
      return json({ok:true});
    }
    const result=await baseOperation(db,body,actor);
    if(result.ok&&['sideGame','nassauGroup','nassauBetConfig','fortyBallBet','fortyBallSelection','charge','frozen','clearScores','reset'].includes(op)){
      const scope=`Round ${body.round||'all'}${body.group?', Group '+body.group:''}${body.hole?', Hole '+body.hole:''}`;
      const detail=op==='charge'?`${body.player}: $${Number(body.amount||0)}`:op==='frozen'?'Index freeze '+(body.value?'enabled':'disabled'):op==='sideGame'?`${scope}: ${body.value}`:op==='nassauGroup'?`${scope}: ${body.value||'none'}`:op==='nassauBetConfig'?`${scope}: $${Number(body.config?.value||0)}, ${(body.config?.presses||[]).length} presses`:op==='fortyBallBet'?`${scope}: $${Number(body.value||0)}`:op==='fortyBallSelection'?`${scope}, ${body.player}: ${body.value?'count':'exclude'}`:scope;
      await activity(db,actor.player,({sideGame:'Side game changed',nassauGroup:'Nassau format changed',nassauBetConfig:'Nassau wager changed',fortyBallBet:'40 Ball wager changed',fortyBallSelection:'40 Ball selection changed',charge:'Charge changed',frozen:'Index freeze changed',clearScores:'Scores cleared',reset:'Demo data reset'})[op],detail);
    }
    return result;
  }catch(error){console.error(error);return json({error:'Cloudflare database operation failed'},500)}
}

export const onRequestGet=handle;
export const onRequestPost=handle;
export const onRequestOptions=()=>new Response(null,{status:204});
