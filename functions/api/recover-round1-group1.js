const NAMES=['David Glenn','Nick Condeni','Bill McCombs','Will Long'];
const NAMESET=new Set(NAMES);

function json(data,status=200){
  return Response.json(data,{status,headers:{'cache-control':'no-store'}});
}
function parse(value,fallback={}){try{return value==null?fallback:JSON.parse(value)}catch{return fallback}}
function now(){return new Date().toISOString()}

export async function onRequestPost({env}){
  if(!env.DB)return json({ok:false,error:'DB binding missing'},503);
  try{
    const current=await env.DB.prepare(
      'SELECT COUNT(*) AS count FROM tournament_scores WHERE round_no=1 AND player IN (?,?,?,?)'
    ).bind(...NAMES).first();
    const currentCount=Number(current?.count||0);
    if(currentCount===72)return json({ok:true,skipped:true,reason:'already recovered',currentCount});
    if(currentCount!==0)return json({ok:false,error:'Production Group 1 is partially populated; automatic recovery stopped',currentCount},409);

    const sourceResponse=await fetch('https://ballyhack-fall-classic.pages.dev/api/export-round1-group1?recover='+Date.now(),{
      headers:{'cache-control':'no-cache'}
    });
    if(!sourceResponse.ok)return json({ok:false,error:'Beta recovery source unavailable',status:sourceResponse.status},502);
    const source=await sourceResponse.json();
    if(!source?.ok||Number(source.scoreCount)!==72||!Array.isArray(source.scores)){
      return json({ok:false,error:'Beta recovery source does not contain exactly 72 scores'},409);
    }

    const seen=new Set();
    for(const row of source.scores){
      const player=String(row.player||''),hole=Number(row.hole),gross=Number(row.gross);
      const key=player+'|'+hole;
      if(!NAMESET.has(player)||!Number.isInteger(hole)||hole<1||hole>18||!Number.isInteger(gross)||gross<1||gross>20||seen.has(key)){
        return json({ok:false,error:'Beta recovery payload failed validation'},409);
      }
      seen.add(key);
    }
    if(seen.size!==72)return json({ok:false,error:'Beta recovery payload is incomplete'},409);

    const gameRow=await env.DB.prepare("SELECT value FROM tournament_settings WHERE key='sideGames'").first();
    const sideGames=parse(gameRow?.value,{});
    const productionGame=sideGames?.['1']||sideGames?.[1]||'None';

    const sourceSelections=source.selections||{};
    const sourceSelectionCount=Object.values(sourceSelections).filter(Boolean).length;
    if(productionGame==='40 Ball'&&(source.sideGame!=='40 Ball'||sourceSelectionCount!==40)){
      return json({ok:false,error:'40 Ball recovery requires exactly 40 beta selections',productionGame,sourceGame:source.sideGame,sourceSelectionCount},409);
    }

    const stamp=now();
    const statements=source.scores.map(row=>
      env.DB.prepare('INSERT OR IGNORE INTO tournament_scores (round_no,player,hole,gross,updated_at) VALUES (1,?,?,?,?)')
        .bind(row.player,Number(row.hole),Number(row.gross),stamp)
    );

    if(productionGame==='40 Ball'){
      const selectionRow=await env.DB.prepare("SELECT value FROM tournament_settings WHERE key='fortyBallSelections'").first();
      const selections=parse(selectionRow?.value,{});
      selections['1']??={};
      selections['1']['1']=sourceSelections;
      statements.push(
        env.DB.prepare("INSERT INTO tournament_settings (key,value,updated_at) VALUES ('fortyBallSelections',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at")
          .bind(JSON.stringify(selections),stamp)
      );
    }

    if(source.lock){
      statements.push(
        env.DB.prepare('INSERT OR IGNORE INTO tournament_group_locks (round_no,group_no,locked_by,locked_at) VALUES (1,1,?,?)')
          .bind(String(source.lock.locked_by||'David Glenn'),String(source.lock.locked_at||stamp))
      );
    }

    await env.DB.batch(statements);

    const verified=await env.DB.prepare(
      'SELECT COUNT(*) AS count FROM tournament_scores WHERE round_no=1 AND player IN (?,?,?,?)'
    ).bind(...NAMES).first();
    const recoveredCount=Number(verified?.count||0);
    if(recoveredCount!==72)return json({ok:false,error:'Recovery verification failed',recoveredCount},500);

    return json({
      ok:true,
      recoveredCount,
      productionGame,
      recoveredSelections:productionGame==='40 Ball'?sourceSelectionCount:0,
      restoredLock:!!source.lock
    });
  }catch(error){
    return json({ok:false,error:'Recovery failed'},500);
  }
}
