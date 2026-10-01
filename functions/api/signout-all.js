function json(data,status=200){return Response.json(data,{status,headers:{'cache-control':'no-store'}})}

export async function onRequestPost({request,env}){
  if(!env.DB)return json({ok:false,error:'DB binding missing'},503);
  try{
    const body=await request.json().catch(()=>({}));
    if(body.confirm!=='SIGN_OUT_ALL_20261001')return json({ok:false,error:'Confirmation required'},403);

    const scoreCount=await env.DB.prepare('SELECT COUNT(*) AS count FROM tournament_scores WHERE round_no=1').first();
    if(Number(scoreCount?.count||0)!==144)return json({ok:false,error:'Round 1 integrity check failed'},409);

    const sessions=await env.DB.prepare('SELECT COUNT(*) AS count FROM tournament_login_sessions').first();
    const legacy=await env.DB.prepare('SELECT COUNT(*) AS count FROM tournament_credentials WHERE token_hash IS NOT NULL').first();

    await env.DB.batch([
      env.DB.prepare('DELETE FROM tournament_login_sessions'),
      env.DB.prepare('UPDATE tournament_credentials SET token_hash=NULL, token_expires_at=NULL, updated_at=?').bind(new Date().toISOString())
    ]);

    return json({
      ok:true,
      signedOutSessions:Number(sessions?.count||0),
      clearedLegacyTokens:Number(legacy?.count||0),
      round1Scores:Number(scoreCount?.count||0)
    });
  }catch(error){
    return json({ok:false,error:'Sign-out operation failed'},500);
  }
}
