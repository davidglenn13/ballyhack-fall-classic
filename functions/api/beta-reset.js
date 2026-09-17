const RESET_SECRET='913a569760ee84ea05933f91645bf7c97119c70e504c5071';
const TABLES=['tournament_scores','tournament_players','tournament_settings','tournament_charges','tournament_credentials','tournament_score_audit','tournament_group_locks','tournament_backups','tournament_activity','tournament_login_attempts','tournament_login_sessions'];
function same(a,b){if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0}
async function runReset(request,env){
  const url=new URL(request.url); const supplied=request.headers.get('x-beta-reset-secret')||url.searchParams.get('secret')||'';
  if(!same(supplied,RESET_SECRET))return new Response('Not found',{status:404});
  if(!env.DB)return Response.json({error:'Database unavailable'},{status:503});
  const results=[];
  for(const table of TABLES){const result=await env.DB.prepare(`DELETE FROM ${table}`).run();results.push({table,deleted:result.meta?.changes||0})}
  return Response.json({ok:true,results},{headers:{'cache-control':'no-store'}});
}
export async function onRequestPost({request,env}){return runReset(request,env)}
export async function onRequestGet({request,env}){return runReset(request,env)}
