const PAR=[4,5,3,4,4,4,3,4,5,5,4,4,3,4,5,4,3,4];
const SI=[3,11,15,1,5,13,17,9,7,12,14,4,16,6,10,2,18,8];
const CH={'David Glenn':14,'Nick Condeni':6,'Bill McCombs':15,'Will Long':13};
const NAMES=Object.keys(CH);
function json(data,status=200){return Response.json(data,{status,headers:{'cache-control':'no-store'}})}
function parse(value,fallback={}){try{return value==null?fallback:JSON.parse(value)}catch{return fallback}}
function strokes(ch,si){return Math.floor(ch/18)+(si<=ch%18?1:0)}
export async function onRequestGet({env}){
  if(!env.DB)return json({ok:false,error:'DB binding missing'},503);
  try{
    const rows=(await env.DB.prepare('SELECT player,hole,gross FROM tournament_scores WHERE round_no=1 ORDER BY player,hole').all()).results.filter(x=>NAMES.includes(x.player));
    const setting=await env.DB.prepare("SELECT value FROM tournament_settings WHERE key='fortyBallSelections'").first();
    const all=parse(setting?.value,{});
    const selected=all?.['1']?.['1']||all?.[1]?.[1]||{};
    const scored=rows.map(r=>{
      const hole=Number(r.hole),gross=Number(r.gross),net=gross-strokes(CH[r.player],SI[hole-1]);
      return {key:r.player+'|'+hole,player:r.player,hole,gross,net,rel:net-PAR[hole-1]};
    });
    const best40=[...scored].sort((a,b)=>a.rel-b.rel||a.net-b.net||a.key.localeCompare(b.key)).slice(0,40);
    const selectedKeys=new Set(Object.entries(selected).filter(([,v])=>v).map(([k])=>k));
    const bestKeys=new Set(best40.map(x=>x.key));
    const selectedNotBest=[...selectedKeys].filter(k=>!bestKeys.has(k));
    const bestNotSelected=[...bestKeys].filter(k=>!selectedKeys.has(k));
    const selectedRel=scored.filter(x=>selectedKeys.has(x.key)).reduce((a,x)=>a+x.rel,0);
    const bestRel=best40.reduce((a,x)=>a+x.rel,0);
    return json({ok:true,selectedCount:selectedKeys.size,best40Count:bestKeys.size,exactMatch:selectedNotBest.length===0&&bestNotSelected.length===0,selectedRel,bestRel,selectedNotBest,bestNotSelected});
  }catch(error){return json({ok:false,error:'analysis failed'},500)}
}
