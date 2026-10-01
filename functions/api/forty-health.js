function json(data,status=200){
  return Response.json(data,{status,headers:{'cache-control':'no-store'}});
}
function parse(value,fallback={}){try{return value==null?fallback:JSON.parse(value)}catch{return fallback}}

export async function onRequestGet({env}){
  if(!env.DB)return json({ok:false,error:'DB binding missing'},503);
  try{
    const rows=(await env.DB.prepare(
      "SELECT key,value FROM tournament_settings WHERE key IN ('sideGames','fortyBallSelections','fortyBallBets')"
    ).all()).results;
    const map=Object.fromEntries(rows.map(x=>[x.key,parse(x.value,{})]));
    const selections=map.fortyBallSelections?.['1']||map.fortyBallSelections?.[1]||{};
    const g1=selections?.['1']||selections?.[1]||{};
    const g2=selections?.['2']||selections?.[2]||{};
    return json({
      ok:true,
      round1SideGame:map.sideGames?.['1']||map.sideGames?.[1]||'None',
      round1Wager:Number(map.fortyBallBets?.['1']||map.fortyBallBets?.[1]||0),
      group1Selections:Object.values(g1).filter(Boolean).length,
      group2Selections:Object.values(g2).filter(Boolean).length
    });
  }catch(error){
    return json({ok:false,error:'40 Ball health query failed'},500);
  }
}
