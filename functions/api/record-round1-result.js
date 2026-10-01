function json(data,status=200){return Response.json(data,{status,headers:{'cache-control':'no-store'}})}
function parse(value,fallback={}){try{return value==null?fallback:JSON.parse(value)}catch{return fallback}}
export async function onRequestPost({request,env}){
  if(!env.DB)return json({ok:false,error:'DB binding missing'},503);
  try{
    const body=await request.json().catch(()=>({}));
    if(body.confirm!=='ROUND1_40BALL_80_FIRST_GROUP')return json({ok:false,error:'Confirmation required'},403);
    const count=await env.DB.prepare('SELECT COUNT(*) AS count FROM tournament_scores WHERE round_no=1').first();
    if(Number(count?.count||0)!==144)return json({ok:false,error:'Round 1 integrity check failed',count:Number(count?.count||0)},409);
    const sideRow=await env.DB.prepare("SELECT value FROM tournament_settings WHERE key='sideGames'").first();
    const betRow=await env.DB.prepare("SELECT value FROM tournament_settings WHERE key='fortyBallBets'").first();
    const officialRow=await env.DB.prepare("SELECT value FROM tournament_settings WHERE key='fortyBallOfficialResults'").first();
    const side=parse(sideRow?.value,{1:'None',2:'None',3:'None',4:'None'});
    const bets=parse(betRow?.value,{});
    const official=parse(officialRow?.value,{});
    side['1']='40 Ball';
    bets['1']=80;
    official['1']={winnerGroup:1,wager:80,confirmedBy:'David Glenn',confirmedAt:new Date().toISOString()};
    const stamp=new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare("INSERT INTO tournament_settings (key,value,updated_at) VALUES ('sideGames',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at").bind(JSON.stringify(side),stamp+'-side'),
      env.DB.prepare("INSERT INTO tournament_settings (key,value,updated_at) VALUES ('fortyBallBets',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at").bind(JSON.stringify(bets),stamp+'-bet'),
      env.DB.prepare("INSERT INTO tournament_settings (key,value,updated_at) VALUES ('fortyBallOfficialResults',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at").bind(JSON.stringify(official),stamp+'-official')
    ]);
    return json({ok:true,round1Scores:144,sideGame:side['1'],wager:bets['1'],winnerGroup:official['1'].winnerGroup});
  }catch(error){return json({ok:false,error:'Official result write failed'},500)}
}
