const TABLES=['tournament_scores','tournament_players','tournament_settings','tournament_charges','tournament_credentials','tournament_score_audit','tournament_group_locks','tournament_backups'];
const KEY='79B6j9LkhfOpG5w9UHtutNB2eUHtyIWBDSgRWo5859-PxXq6HMgojLqsktWqa3w-';
async function handle({request,env}){
  if(new URL(request.url).hostname!=='ballyhack-fall-classic.pages.dev'||request.headers.get('authorization')!=='Bearer '+KEY)return new Response('Not found',{status:404});
  if(!env.DB)return Response.json({error:'Missing beta DB binding'},{status:503});
  const db=env.DB;
  const counts=async()=>Object.fromEntries(await Promise.all(TABLES.map(async table=>[table,Number((await db.prepare('SELECT COUNT(*) AS n FROM '+table).first()).n)])));
  if(request.method==='GET')return Response.json({counts:await counts()});
  if(request.method!=='POST')return new Response('Method not allowed',{status:405});
  const before=await counts();
  await db.batch(TABLES.map(table=>db.prepare('DELETE FROM '+table)));
  return Response.json({before,after:await counts()});
}
export const onRequestGet=handle;
export const onRequestPost=handle;
