const NAMES=['David Glenn','Nick Condeni','Bill McCombs','Will Long'];

function json(data,status=200){
  return Response.json(data,{status,headers:{'cache-control':'no-store'}});
}
function parse(value,fallback={}){try{return value==null?fallback:JSON.parse(value)}catch{return fallback}}

export async function onRequestGet({env}){
  if(!env.DB)return json({ok:false,error:'DB binding missing'},503);
  try{
    const rows=(await env.DB.prepare(
      'SELECT player,hole,gross FROM tournament_scores WHERE round_no=1 ORDER BY player,hole'
    ).all()).results.filter(x=>NAMES.includes(x.player));
    const lock=await env.DB.prepare(
      'SELECT locked_by,locked_at FROM tournament_group_locks WHERE round_no=1 AND group_no=1'
    ).first();
    const settings=await env.DB.prepare(
      "SELECT key,value FROM tournament_settings WHERE key IN ('sideGames','fortyBallSelections')"
    ).all();
    const map=Object.fromEntries(settings.results.map(x=>[x.key,parse(x.value,{})]));
    const selections=map.fortyBallSelections?.['1']?.['1']||map.fortyBallSelections?.[1]?.[1]||{};
    return json({
      ok:true,
      round:1,
      group:1,
      names:NAMES,
      scores:rows,
      scoreCount:rows.length,
      sideGame:map.sideGames?.['1']||map.sideGames?.[1]||'None',
      selections,
      selectionCount:Object.values(selections).filter(Boolean).length,
      lock:lock||null
    });
  }catch(error){
    return json({ok:false,error:'export failed'},500);
  }
}
