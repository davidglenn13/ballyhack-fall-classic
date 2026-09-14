import { getDatabase } from '@netlify/database';
import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import baseState from './state.mjs';

const PLAYERS = new Set(['Tyler Bohannon','Nick Condeni','David Glenn','Scott Karl','Will Long','Bill McCombs','Joe Phelan','Jason Wain']);
const GROUPS = {
  1:{1:['David Glenn','Nick Condeni','Bill McCombs','Will Long'],2:['Jason Wain','Joe Phelan','Tyler Bohannon','Scott Karl']},
  2:{1:['Tyler Bohannon','Scott Karl','Bill McCombs','Will Long'],2:['David Glenn','Nick Condeni','Jason Wain','Joe Phelan']},
  3:{1:['Jason Wain','Joe Phelan','Bill McCombs','Will Long'],2:['David Glenn','Nick Condeni','Tyler Bohannon','Scott Karl']},
  4:{1:['Nick Condeni','Joe Phelan','Scott Karl','Will Long'],2:['David Glenn','Jason Wain','Tyler Bohannon','Bill McCombs']}
};

function json(data,status=200){
  return new Response(JSON.stringify(data),{
    status,
    headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}
  });
}
function hash(value,salt){
  return scryptSync(String(value),String(salt),32).toString('hex');
}
function tokenHash(value){
  return createHash('sha256').update(String(value)).digest('hex');
}
function sameHex(a,b){
  try{
    const aa=Buffer.from(a,'hex'), bb=Buffer.from(b,'hex');
    return aa.length===bb.length && timingSafeEqual(aa,bb);
  }catch{return false}
}
function groupFor(round,player){
  const groups=GROUPS[round]||{};
  return Object.keys(groups).find(g=>groups[g].includes(player));
}
function inGroup(round,group,player){
  return !!GROUPS[round]?.[group]?.includes(player);
}
async function authenticate(db,req,body={}){
  const player=String(body.actor||req.headers.get('x-ballyhack-player')||'');
  const token=String(body.authToken||req.headers.get('x-ballyhack-token')||'');
  if(!PLAYERS.has(player)||!token)return null;
  const [row]=await db.sql`SELECT player,token_hash,token_expires_at,role FROM tournament_credentials WHERE player=${player}`;
  if(!row?.token_hash||new Date(row.token_expires_at)<=new Date())return null;
  if(!sameHex(row.token_hash,tokenHash(token)))return null;
  return {player,role:row.role};
}
async function baseSnapshot(req){
  const response=await baseState(new Request(req.url,{method:'GET',headers:req.headers}));
  return await response.json();
}
async function createBackup(db,req,reason,actor,force=false){
  if(!force){
    const [recent]=await db.sql`SELECT id FROM tournament_backups WHERE created_at > NOW() - INTERVAL '15 minutes' LIMIT 1`;
    if(recent)return recent.id;
  }
  const snapshot=await baseSnapshot(req);
  const [row]=await db.sql`INSERT INTO tournament_backups (reason,snapshot,created_by) VALUES (${reason},${JSON.stringify(snapshot)}::jsonb,${actor}) RETURNING id`;
  await db.sql`DELETE FROM tournament_backups WHERE id NOT IN (SELECT id FROM tournament_backups ORDER BY created_at DESC LIMIT 40)`;
  return row.id;
}
function basePost(req,body){
  return baseState(new Request(req.url,{
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify(body)
  }));
}
async function authAction(db,body){
  const player=String(body.player||'');
  const pin=String(body.pin||'');
  if(!PLAYERS.has(player))return json({error:'Select a golfer'},400);
  if(!/^\d{4}$/.test(pin))return json({error:'PIN must be exactly four digits'},400);
  const [existing]=await db.sql`SELECT pin_hash,salt,role FROM tournament_credentials WHERE player=${player}`;
  let role=player==='David Glenn'?'admin':'player';
  if(existing){
    if(!sameHex(existing.pin_hash,hash(pin,existing.salt)))return json({error:'Incorrect PIN'},401);
    role=existing.role;
  }else{
    const salt=randomBytes(16).toString('hex');
    await db.sql`INSERT INTO tournament_credentials (player,pin_hash,salt,role) VALUES (${player},${hash(pin,salt)},${salt},${role})`;
  }
  const token=randomBytes(32).toString('hex');
  await db.sql`UPDATE tournament_credentials SET token_hash=${tokenHash(token)},token_expires_at=NOW()+INTERVAL '30 days',updated_at=NOW() WHERE player=${player}`;
  return json({ok:true,player,role,token,firstUse:!existing});
}

export default async (req)=>{
  const db=getDatabase();
  try{
    if(req.method==='GET'){
      const out=await baseSnapshot(req);
      const actor=await authenticate(db,req);
      const locks=await db.sql`SELECT round_no,group_no,locked_by,locked_at FROM tournament_group_locks ORDER BY round_no,group_no`;
      out.locks={};
      for(const lock of locks){
        out.locks[lock.round_no]??={};
        out.locks[lock.round_no][lock.group_no]={lockedBy:lock.locked_by,lockedAt:lock.locked_at};
      }
      out.safeguards={authenticated:!!actor,actor:actor?.player||null,role:actor?.role||'spectator'};
      if(actor?.role==='admin'){
        out.audit=await db.sql`SELECT id,round_no,group_no,player,hole,old_gross,new_gross,actor,action,created_at,undone_at,undone_by FROM tournament_score_audit ORDER BY created_at DESC LIMIT 75`;
        const [backup]=await db.sql`SELECT id,reason,created_by,created_at FROM tournament_backups ORDER BY created_at DESC LIMIT 1`;
        out.latestBackup=backup||null;
      }
      return json(out);
    }
    if(req.method!=='POST')return json({error:'Method not allowed'},405);
    const body=await req.json();
    if(body?.op==='auth')return authAction(db,body);
    const actor=await authenticate(db,req,body);
    if(!actor)return json({error:'Sign in with your player PIN'},401);
    const op=String(body?.op||'');

    if(op==='lockGroup'){
      const round=Number(body.round), group=Number(body.group);
      if(!inGroup(round,group,actor.player)&&actor.role!=='admin')return json({error:'You can only confirm your own foursome'},403);
      const [{count}]=await db.sql`SELECT COUNT(*)::int AS count FROM tournament_scores WHERE round_no=${round} AND player=ANY(${GROUPS[round]?.[group]||[]})`;
      if(Number(count)!==72)return json({error:`Cannot lock: ${72-Number(count)} scores are still missing`},409);
      await createBackup(db,req,`Before Round ${round} Group ${group} lock`,actor.player,true);
      await db.sql`INSERT INTO tournament_group_locks (round_no,group_no,locked_by) VALUES (${round},${group},${actor.player}) ON CONFLICT (round_no,group_no) DO NOTHING`;
      return json({ok:true});
    }

    if(op==='unlockGroup'){
      if(actor.role!=='admin')return json({error:'Commissioner access required'},403);
      const round=Number(body.round), group=Number(body.group);
      await createBackup(db,req,`Before Round ${round} Group ${group} unlock`,actor.player,true);
      await db.sql`DELETE FROM tournament_group_locks WHERE round_no=${round} AND group_no=${group}`;
      return json({ok:true});
    }

    if(op==='undoScore'){
      if(actor.role!=='admin')return json({error:'Commissioner access required'},403);
      const [change]=await db.sql`SELECT * FROM tournament_score_audit WHERE id=${Number(body.auditId)} AND undone_at IS NULL`;
      if(!change)return json({error:'Change is unavailable or already undone'},409);
      const [locked]=await db.sql`SELECT 1 FROM tournament_group_locks WHERE round_no=${change.round_no} AND group_no=${change.group_no}`;
      if(locked)return json({error:'Unlock this foursome before undoing a score'},423);
      await createBackup(db,req,`Before undoing audit ${change.id}`,actor.player,true);
      const response=await basePost(req,{op:'score',round:change.round_no,player:change.player,hole:change.hole,gross:change.old_gross||0});
      if(!response.ok)return response;
      await db.sql`UPDATE tournament_score_audit SET undone_at=NOW(),undone_by=${actor.player} WHERE id=${change.id}`;
      await db.sql`INSERT INTO tournament_score_audit (mutation_id,round_no,group_no,player,hole,old_gross,new_gross,actor,action) VALUES (${String(body.mutationId||randomBytes(12).toString('hex'))},${change.round_no},${change.group_no},${change.player},${change.hole},${change.new_gross},${change.old_gross},${actor.player},'undo')`;
      return json({ok:true});
    }

    if(op==='resetPin'){
      if(actor.role!=='admin')return json({error:'Commissioner access required'},403);
      const target=String(body.player||'');
      if(!PLAYERS.has(target)||target==='David Glenn')return json({error:'Select another golfer'},400);
      await db.sql`DELETE FROM tournament_credentials WHERE player=${target}`;
      return json({ok:true});
    }

    if(op==='backup'){
      if(actor.role!=='admin')return json({error:'Commissioner access required'},403);
      const id=await createBackup(db,req,'Manual commissioner backup',actor.player,true);
      return json({ok:true,backupId:id});
    }

    const adminOnly=new Set(['charge','frozen','clearScores','reset']);
    if(adminOnly.has(op)&&actor.role!=='admin')return json({error:'Commissioner access required'},403);
    if(op==='photo'&&body.player!==actor.player&&actor.role!=='admin')return json({error:'You can only change your own photo'},403);
    if((op==='setup'||op==='access')&&body.player!==actor.player&&actor.role!=='admin')return json({error:'Invalid player action'},403);
    if((op==='nassauGroup'||op==='nassauBetConfig'||op==='fortyBallSelection')&&actor.role!=='admin'){
      const round=Number(body.round), group=Number(body.group);
      if(!inGroup(round,group,actor.player))return json({error:'You can only manage your own foursome'},403);
    }

    if(op==='score'){
      const round=Number(body.round), hole=Number(body.hole), target=String(body.player||'');
      const group=Number(groupFor(round,target));
      if(!group||(!inGroup(round,group,actor.player)&&actor.role!=='admin'))return json({error:'You can only score your own foursome'},403);
      const [locked]=await db.sql`SELECT 1 FROM tournament_group_locks WHERE round_no=${round} AND group_no=${group}`;
      if(locked)return json({error:'This foursome scorecard is locked'},423);
      const mutationId=String(body.mutationId||randomBytes(12).toString('hex')).slice(0,100);
      const [duplicate]=await db.sql`SELECT id FROM tournament_score_audit WHERE mutation_id=${mutationId}`;
      if(duplicate)return json({ok:true,duplicate:true});
      const [before]=await db.sql`SELECT gross FROM tournament_scores WHERE round_no=${round} AND player=${target} AND hole=${hole}`;
      await createBackup(db,req,'Automatic scoring checkpoint',actor.player,false);
      const response=await basePost(req,body);
      if(!response.ok)return response;
      const next=Number(body.gross)||null;
      await db.sql`INSERT INTO tournament_score_audit (mutation_id,round_no,group_no,player,hole,old_gross,new_gross,actor) VALUES (${mutationId},${round},${group},${target},${hole},${before?.gross||null},${next},${actor.player})`;
      return json({ok:true});
    }

    const response=await basePost(req,body);
    return response;
  }catch(error){
    console.error(error);
    return json({error:'Safeguarded database operation failed'},500);
  }
};

export const config={path:'/api/secure-state'};
