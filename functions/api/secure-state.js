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
function groupFor(round,player){return Number(Object.keys(GROUPS[round]||{}).find(g=>GROUPS[round][g].includes(player))||0)}
function inGroup(round,group,player){return !!GROUPS[round]?.[group]?.includes(player)}
function parse(value,fallback={}){try{return value==null?fallback:JSON.parse(value)}catch{return fallback}}
async function setting(db,key,fallback){const row=await db.prepare('SELECT value FROM tournament_settings WHERE key=?').bind(key).first();return parse(row?.value,fallback)}
async function putSetting(db,key,value){
  await db.prepare("INSERT INTO tournament_settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at")
    .bind(key,JSON.stringify(value),now()).run();
}

async function snapshot(db){
  const [scores,players,settings,charges]=await Promise.all([
    db.prepare('SELECT round_no,player,hole,gross FROM tournament_scores ORDER BY round_no,player,hole').all(),
    db.prepare('SELECT player,photo,setup_at,last_accessed_at FROM tournament_players').all(),
    db.prepare('SELECT key,value FROM tournament_settings').all(),
    db.prepare('SELECT player,amount FROM tournament_charges').all()
  ]);
  const out={scores:{},setup:{},access:{},photos:{},sideGames:{1:'None',2:'None',3:'None',4:'None'},fortyBallSelections:{},fortyBallBets:{},nassauGroups:{},nassauBets:{},charges:{},frozen:false};
  for(const s of scores.results){
    out.scores[s.round_no]??={};out.scores[s.round_no][s.player]??={};out.scores[s.round_no][s.player][s.hole]=String(s.gross);
  }
  for(const p of players.results){
    if(p.photo)out.photos[p.player]=p.photo;if(p.setup_at)out.setup[p.player]=p.setup_at;if(p.last_accessed_at)out.access[p.player]=p.last_accessed_at;
  }
  for(const s of settings.results){
    const value=parse(s.value,null);
    if(s.key==='sideGames')out.sideGames=value||out.sideGames;
    if(s.key==='fortyBallSelections')out.fortyBallSelections=value||{};
    if(s.key==='fortyBallBets')out.fortyBallBets=value||{};
    if(s.key==='nassauGroups')out.nassauGroups=value||{};
    if(s.key==='nassauBets')out.nassauBets=value||{};
    if(s.key==='frozen')out.frozen=!!value;
  }
  for(const c of charges.results)out.charges[c.player]=Number(c.amount);
  return out;
}

async function authenticate(db,request,body={}){
  const player=String(body.actor||request.headers.get('x-ballyhack-player')||'');
  const token=String(body.authToken||request.headers.get('x-ballyhack-token')||'');
  if(!PLAYERS.has(player)||!token)return null;
  const row=await db.prepare('SELECT player,token_hash,token_expires_at,role FROM tournament_credentials WHERE player=?').bind(player).first();
  if(!row?.token_hash||Date.parse(row.token_expires_at)<=Date.now()||!same(row.token_hash,await sha256(token)))return null;
  return {player,role:row.role};
}

async function createBackup(db,reason,actor,force=false){
  if(!force){
    const recent=await db.prepare("SELECT id FROM tournament_backups WHERE created_at > datetime('now','-15 minutes') LIMIT 1").first();
    if(recent)return recent.id;
  }
  const state=await snapshot(db);
  const result=await db.prepare('INSERT INTO tournament_backups (reason,snapshot,created_by,created_at) VALUES (?,?,?,?)')
    .bind(reason,JSON.stringify(state),actor,now()).run();
  await db.prepare('DELETE FROM tournament_backups WHERE id NOT IN (SELECT id FROM tournament_backups ORDER BY created_at DESC LIMIT 40)').run();
  return result.meta.last_row_id;
}

async function authAction(db,body){
  const player=String(body.player||''),pin=String(body.pin||'');
  if(!PLAYERS.has(player))return json({error:'Select a golfer'},400);
  if(!/^\d{4}$/.test(pin))return json({error:'PIN must be exactly four digits'},400);
  const existing=await db.prepare('SELECT pin_hash,salt,role FROM tournament_credentials WHERE player=?').bind(player).first();
  let role=player==='David Glenn'?'admin':'player';
  if(existing){
    if(!same(existing.pin_hash,await pinHash(pin,existing.salt)))return json({error:'Incorrect PIN'},401);
    role=existing.role;
  }else{
    const salt=randomHex(16);
    await db.prepare('INSERT INTO tournament_credentials (player,pin_hash,salt,role,created_at,updated_at) VALUES (?,?,?,?,?,?)')
      .bind(player,await pinHash(pin,salt),salt,role,now(),now()).run();
  }
  const token=randomHex(32),expires=new Date(Date.now()+30*86400000).toISOString();
  await db.prepare('UPDATE tournament_credentials SET token_hash=?,token_expires_at=?,updated_at=? WHERE player=?')
    .bind(await sha256(token),expires,now(),player).run();
  return json({ok:true,player,role,token,firstUse:!existing});
}

async function baseOperation(db,body){
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
    const current=await setting(db,'sideGames',{1:'None',2:'None',3:'None',4:'None'});current[String(body.round)]=body.value;await putSetting(db,'sideGames',current);
  }else if(op==='nassauGroup'){
    const round=Number(body.round),group=Number(body.group);if(!(round>=1&&round<=4&&group>=1&&group<=2))return json({error:'Invalid Nassau group'},400);
    const current=await setting(db,'nassauGroups',{});current[String(round)]??={};
    if(body.value)current[String(round)][String(group)]=body.value==='Nassau 6-6-6'?'Nassau 6-6-6':'Nassau 5-5-5-3';else delete current[String(round)][String(group)];
    await putSetting(db,'nassauGroups',current);
  }else if(op==='nassauBetConfig'){
    const round=Number(body.round),group=Number(body.group);if(!(round>=1&&round<=4&&group>=1&&group<=2))return json({error:'Invalid Nassau bet group'},400);
    const raw=body.config||{},value=Math.max(0,Math.min(10000,Number(raw.value||0)));
    const presses=(Array.isArray(raw.presses)?raw.presses:[]).slice(0,40).map((p,i)=>({id:String(p.id||`p${Date.now()}${i}`).slice(0,80),segment:Math.max(0,Math.min(3,Number(p.segment)||0)),fromHole:Math.max(1,Math.min(18,Number(p.fromHole)||1)),pressedBy:p.pressedBy==='b'?'b':'a',amount:Math.max(0,Math.min(10000,Number(p.amount||0)))}));
    const current=await setting(db,'nassauBets',{});current[String(round)]??={};current[String(round)][String(group)]={value,presses};await putSetting(db,'nassauBets',current);
  }else if(op==='fortyBallSelection'){
    const round=Number(body.round),group=Number(body.group),hole=Number(body.hole);if(!(round>=1&&round<=4&&group>=1&&group<=2&&hole>=1&&hole<=18&&PLAYERS.has(body.player)))return json({error:'Invalid 40 Ball selection'},400);
    const current=await setting(db,'fortyBallSelections',{});current[String(round)]??={};current[String(round)][String(group)]??={};const key=`${body.player}|${hole}`;
    if(body.value)current[String(round)][String(group)][key]=true;else delete current[String(round)][String(group)][key];await putSetting(db,'fortyBallSelections',current);
  }else if(op==='fortyBallBet'){
    const round=Number(body.round),value=Math.max(0,Math.min(999,Number(body.value||0)));if(!(round>=1&&round<=4))return json({error:'Invalid 40 Ball wager'},400);
    const current=await setting(db,'fortyBallBets',{});current[String(round)]=value;await putSetting(db,'fortyBallBets',current);
  }else if(op==='frozen')await putSetting(db,'frozen',!!body.value);
  else if(op==='clearScores')await db.prepare('DELETE FROM tournament_scores').run();
  else if(op==='reset')await db.batch([
    db.prepare('DELETE FROM tournament_scores'),db.prepare('DELETE FROM tournament_players'),db.prepare('DELETE FROM tournament_settings'),db.prepare('DELETE FROM tournament_charges')
  ]);
  else return json({error:'Unknown operation'},400);
  return json({ok:true});
}

async function handle(context){
  const {request,env}=context,db=env.DB;
  if(!db)return json({error:'Cloudflare D1 binding DB is not configured'},503);
  try{
    if(request.method==='GET'){
      const out=await snapshot(db),actor=await authenticate(db,request);
      const locks=await db.prepare('SELECT round_no,group_no,locked_by,locked_at FROM tournament_group_locks ORDER BY round_no,group_no').all();out.locks={};
      for(const lock of locks.results){out.locks[lock.round_no]??={};out.locks[lock.round_no][lock.group_no]={lockedBy:lock.locked_by,lockedAt:lock.locked_at}}
      out.safeguards={authenticated:!!actor,actor:actor?.player||null,role:actor?.role||'spectator'};
      if(actor?.role==='admin'){
        out.audit=(await db.prepare('SELECT id,round_no,group_no,player,hole,old_gross,new_gross,actor,action,created_at,undone_at,undone_by FROM tournament_score_audit ORDER BY created_at DESC LIMIT 75').all()).results;
        out.latestBackup=await db.prepare('SELECT id,reason,created_by,created_at FROM tournament_backups ORDER BY created_at DESC LIMIT 1').first();
      }
      return json(out);
    }
    if(request.method!=='POST')return json({error:'Method not allowed'},405);
    const body=await request.json();
    if(body?.op==='diagnoseAuth'){
      let columns=[],databaseError='',crypto=false,cryptoError='';
      try{columns=(await db.prepare('PRAGMA table_info(tournament_credentials)').all()).results.map(row=>row.name)}catch(error){databaseError=String(error?.message||error)}
      try{crypto=(await pinHash('0000','diagnostic')).length===64}catch(error){cryptoError=String(error?.message||error)}
      return json({ok:!databaseError&&!cryptoError,columns,databaseError,crypto,cryptoError});
    }
    if(body?.op==='auth')return authAction(db,body);
    const actor=await authenticate(db,request,body);if(!actor)return json({error:'Sign in with your player PIN'},401);
    const op=String(body?.op||'');
    if(op==='lockGroup'){
      const round=Number(body.round),group=Number(body.group);if(!inGroup(round,group,actor.player)&&actor.role!=='admin')return json({error:'You can only confirm your own foursome'},403);
      const names=GROUPS[round]?.[group]||[],count=await db.prepare('SELECT COUNT(*) AS count FROM tournament_scores WHERE round_no=? AND player IN (?,?,?,?)').bind(round,...names).first();
      if(Number(count.count)!==72)return json({error:`Cannot lock: ${72-Number(count.count)} scores are still missing`},409);
      await createBackup(db,`Before Round ${round} Group ${group} lock`,actor.player,true);
      await db.prepare('INSERT OR IGNORE INTO tournament_group_locks (round_no,group_no,locked_by,locked_at) VALUES (?,?,?,?)').bind(round,group,actor.player,now()).run();return json({ok:true});
    }
    if(op==='unlockGroup'){
      if(actor.role!=='admin')return json({error:'Commissioner access required'},403);const round=Number(body.round),group=Number(body.group);
      await createBackup(db,`Before Round ${round} Group ${group} unlock`,actor.player,true);await db.prepare('DELETE FROM tournament_group_locks WHERE round_no=? AND group_no=?').bind(round,group).run();return json({ok:true});
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
      ]);return json({ok:true});
    }
    if(op==='resetPin'){
      if(actor.role!=='admin')return json({error:'Commissioner access required'},403);const target=String(body.player||'');if(!PLAYERS.has(target)||target==='David Glenn')return json({error:'Select another golfer'},400);
      await db.prepare('DELETE FROM tournament_credentials WHERE player=?').bind(target).run();return json({ok:true});
    }
    if(op==='backup'){
      if(actor.role!=='admin')return json({error:'Commissioner access required'},403);return json({ok:true,backupId:await createBackup(db,'Manual commissioner backup',actor.player,true)});
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
      const before=await db.prepare('SELECT gross FROM tournament_scores WHERE round_no=? AND player=? AND hole=?').bind(round,target,hole).first();await createBackup(db,'Automatic scoring checkpoint',actor.player,false);
      const result=await baseOperation(db,body);if(!result.ok)return result;
      await db.prepare('INSERT INTO tournament_score_audit (mutation_id,round_no,group_no,player,hole,old_gross,new_gross,actor,action,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
        .bind(mutation,round,group,target,hole,before?.gross??null,Number(body.gross)||null,actor.player,'score',now()).run();return json({ok:true});
    }
    return baseOperation(db,body);
  }catch(error){console.error(error);return json({error:'Cloudflare database operation failed'},500)}
}

export const onRequestGet=handle;
export const onRequestPost=handle;
export const onRequestOptions=()=>new Response(null,{status:204});
