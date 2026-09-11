import { getDatabase } from '@netlify/database';

const PLAYERS = new Set(['Tyler Bohannon','Nick Condeni','David Glenn','Scott Karl','Will Long','Bill McCombs','Joe Phelan','Jason Wain']);

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  });
}

async function snapshot(db) {
  const [scores, players, settings, charges] = await Promise.all([
    db.sql`SELECT round_no, player, hole, gross FROM tournament_scores ORDER BY round_no, player, hole`,
    db.sql`SELECT player, photo, setup_at, last_accessed_at FROM tournament_players`,
    db.sql`SELECT key, value FROM tournament_settings`,
    db.sql`SELECT player, amount FROM tournament_charges`
  ]);
  const out = { scores:{}, setup:{}, access:{}, photos:{}, sideGames:{1:'None',2:'None',3:'None',4:'None'}, fortyBallSelections:{}, nassauGroups:{}, nassauBets:{}, charges:{}, frozen:false };
  for (const s of scores) {
    out.scores[s.round_no] ??= {};
    out.scores[s.round_no][s.player] ??= {};
    out.scores[s.round_no][s.player][s.hole] = String(s.gross);
  }
  for (const p of players) {
    if (p.photo) out.photos[p.player] = p.photo;
    if (p.setup_at) out.setup[p.player] = p.setup_at;
    if (p.last_accessed_at) out.access[p.player] = p.last_accessed_at;
  }
  for (const s of settings) {
    if (s.key === 'sideGames') out.sideGames = s.value;
    if (s.key === 'fortyBallSelections') out.fortyBallSelections = s.value || {};
    if (s.key === 'nassauGroups') out.nassauGroups = s.value || {};
    if (s.key === 'nassauBets') out.nassauBets = s.value || {};
    if (s.key === 'frozen') out.frozen = !!s.value;
  }
  for (const c of charges) out.charges[c.player] = Number(c.amount);
  return out;
}

export default async (req) => {
  const db = getDatabase();
  try {
    const url = new URL(req.url);
    if (req.method === 'GET' && url.searchParams.get('resetOnce') === 'bhfc-20260911-1231') {
      await db.sql`TRUNCATE tournament_scores, tournament_players, tournament_settings, tournament_charges`;
      return json({ok:true, reset:true});
    }
    if (req.method === 'GET') return json(await snapshot(db));
    if (req.method !== 'POST') return json({error:'Method not allowed'}, 405);
    const body = await req.json();
    const op = body?.op;
    if (body.player && !PLAYERS.has(body.player)) return json({error:'Unknown player'}, 400);

    if (op === 'score') {
      const r=Number(body.round), h=Number(body.hole), g=Number(body.gross);
      if (!(r>=1&&r<=4&&h>=1&&h<=18&&PLAYERS.has(body.player))) return json({error:'Invalid score location'},400);
      if (!g) {
        await db.sql`DELETE FROM tournament_scores WHERE round_no=${r} AND player=${body.player} AND hole=${h}`;
      } else {
        if (!(g>=1&&g<=20)) return json({error:'Invalid score'},400);
        await db.sql`INSERT INTO tournament_scores (round_no,player,hole,gross,updated_at) VALUES (${r},${body.player},${h},${g},NOW()) ON CONFLICT (round_no,player,hole) DO UPDATE SET gross=EXCLUDED.gross,updated_at=NOW()`;
      }
    } else if (op === 'photo') {
      const photo = String(body.photo || '');
      if (photo.length > 500000) return json({error:'Photo too large'},413);
      await db.sql`INSERT INTO tournament_players (player,photo,updated_at) VALUES (${body.player},${photo},NOW()) ON CONFLICT (player) DO UPDATE SET photo=EXCLUDED.photo,updated_at=NOW()`;
    } else if (op === 'setup') {
      await db.sql`INSERT INTO tournament_players (player,setup_at,last_accessed_at,updated_at) VALUES (${body.player},NOW(),NOW(),NOW()) ON CONFLICT (player) DO UPDATE SET setup_at=COALESCE(tournament_players.setup_at,NOW()),last_accessed_at=NOW(),updated_at=NOW()`;
    } else if (op === 'access') {
      await db.sql`INSERT INTO tournament_players (player,last_accessed_at,updated_at) VALUES (${body.player},NOW(),NOW(),NOW()) ON CONFLICT (player) DO UPDATE SET last_accessed_at=NOW(),updated_at=NOW()`;
    } else if (op === 'charge') {
      const amount=Number(body.amount||0);
      await db.sql`INSERT INTO tournament_charges (player,amount,updated_at) VALUES (${body.player},${amount},NOW()) ON CONFLICT (player) DO UPDATE SET amount=EXCLUDED.amount,updated_at=NOW()`;
    } else if (op === 'sideGame') {
      const current = (await db.sql`SELECT value FROM tournament_settings WHERE key='sideGames'`)[0]?.value || {1:'None',2:'None',3:'None',4:'None'};
      current[String(body.round)] = body.value;
      await db.sql`INSERT INTO tournament_settings (key,value,updated_at) VALUES ('sideGames',${JSON.stringify(current)}::jsonb,NOW()) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value,updated_at=NOW()`;
    } else if (op === 'nassauGroup') {
      const r=Number(body.round), g=Number(body.group);
      if (!(r>=1&&r<=4&&g>=1&&g<=2)) return json({error:'Invalid Nassau group'},400);
      const current = (await db.sql`SELECT value FROM tournament_settings WHERE key='nassauGroups'`)[0]?.value || {};
      current[String(r)] ??= {};
      if (body.value) {
        const format = body.value === 'Nassau 6-6-6' ? 'Nassau 6-6-6' : 'Nassau 5-5-5-3';
        current[String(r)][String(g)] = format;
      } else delete current[String(r)][String(g)];
      await db.sql`INSERT INTO tournament_settings (key,value,updated_at) VALUES ('nassauGroups',${JSON.stringify(current)}::jsonb,NOW()) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value,updated_at=NOW()`;
    } else if (op === 'nassauBetConfig') {
      const r=Number(body.round), g=Number(body.group);
      if (!(r>=1&&r<=4&&g>=1&&g<=2)) return json({error:'Invalid Nassau bet group'},400);
      const raw=body.config||{};
      const value=Math.max(0,Math.min(10000,Number(raw.value||0)));
      const presses=(Array.isArray(raw.presses)?raw.presses:[]).slice(0,40).map((p,i)=>({
        id:String(p.id||`p${Date.now()}${i}`).slice(0,80),
        segment:Math.max(0,Math.min(3,Number(p.segment)||0)),
        fromHole:Math.max(1,Math.min(18,Number(p.fromHole)||1)),
        pressedBy:p.pressedBy==='b'?'b':'a',
        amount:Math.max(0,Math.min(10000,Number(p.amount||0)))
      }));
      const current = (await db.sql`SELECT value FROM tournament_settings WHERE key='nassauBets'`)[0]?.value || {};
      current[String(r)] ??= {};
      current[String(r)][String(g)] = {value,presses};
      await db.sql`INSERT INTO tournament_settings (key,value,updated_at) VALUES ('nassauBets',${JSON.stringify(current)}::jsonb,NOW()) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value,updated_at=NOW()`;
    } else if (op === 'fortyBallSelection') {
      const r=Number(body.round), g=Number(body.group), h=Number(body.hole);
      if (!(r>=1&&r<=4&&g>=1&&g<=2&&h>=1&&h<=18&&PLAYERS.has(body.player))) return json({error:'Invalid 40 Ball selection'},400);
      const current = (await db.sql`SELECT value FROM tournament_settings WHERE key='fortyBallSelections'`)[0]?.value || {};
      current[String(r)] ??= {};
      current[String(r)][String(g)] ??= {};
      const key = `${body.player}|${h}`;
      if (body.value) current[String(r)][String(g)][key] = true;
      else delete current[String(r)][String(g)][key];
      await db.sql`INSERT INTO tournament_settings (key,value,updated_at) VALUES ('fortyBallSelections',${JSON.stringify(current)}::jsonb,NOW()) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value,updated_at=NOW()`;
    } else if (op === 'frozen') {
      await db.sql`INSERT INTO tournament_settings (key,value,updated_at) VALUES ('frozen',${JSON.stringify(!!body.value)}::jsonb,NOW()) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value,updated_at=NOW()`;
    } else if (op === 'clearScores') {
      await db.sql`TRUNCATE tournament_scores`;
    } else if (op === 'reset') {
      await db.sql`TRUNCATE tournament_scores, tournament_players, tournament_settings, tournament_charges`;
    } else return json({error:'Unknown operation'},400);
    return json({ok:true});
  } catch (e) {
    console.error(e);
    return json({error:'Database operation failed'},500);
  }
};
