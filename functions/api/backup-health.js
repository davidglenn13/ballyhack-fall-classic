const GROUP1 = new Set(['David Glenn','Nick Condeni','Bill McCombs','Will Long']);
const GROUP2 = new Set(['Jason Wain','Joe Phelan','Tyler Bohannon','Scott Karl']);

function json(data,status=200){
  return Response.json(data,{status,headers:{'cache-control':'no-store'}});
}

function countRoundOne(snapshot,names){
  let count=0;
  const perPlayer=snapshot?.scores?.['1']||snapshot?.scores?.[1]||{};
  for(const [name,holes] of Object.entries(perPlayer)){
    if(names.has(name))count+=Object.keys(holes||{}).filter(h=>Number(holes[h])>0).length;
  }
  return count;
}

export async function onRequestGet({env}){
  if(!env.DB)return json({ok:false,error:'DB binding missing'},503);
  try{
    const rows=(await env.DB.prepare(
      'SELECT id,reason,created_by,created_at,snapshot FROM tournament_backups ORDER BY id DESC LIMIT 30'
    ).all()).results;
    const backups=rows.map(row=>{
      let snapshot={};
      try{snapshot=JSON.parse(row.snapshot||'{}')}catch{}
      return {
        id:row.id,
        reason:row.reason,
        createdBy:row.created_by,
        createdAt:row.created_at,
        backupVersion:snapshot.backupVersion||null,
        round1:{group1:countRoundOne(snapshot,GROUP1),group2:countRoundOne(snapshot,GROUP2)}
      };
    });
    return json({ok:true,backups});
  }catch(error){
    return json({ok:false,error:'backup health query failed'},500);
  }
}
