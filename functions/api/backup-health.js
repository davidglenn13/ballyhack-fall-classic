const GROUP1 = new Set(['David Glenn','Nick Condeni','Bill McCombs','Will Long']);
const GROUP2 = new Set(['Jason Wain','Joe Phelan','Tyler Bohannon','Scott Karl']);

function json(data,status=200){
  return Response.json(data,{status,headers:{'cache-control':'no-store'}});
}

function roundOneScores(snapshot,names){
  let count=0;
  const perPlayer=snapshot?.scores?.['1']||snapshot?.scores?.[1]||{};
  for(const [name,holes] of Object.entries(perPlayer)){
    if(names.has(name))count+=Object.keys(holes||{}).filter(h=>Number(holes[h])>0).length;
  }
  return count;
}
function selectionCount(snapshot,group){
  const selections=snapshot?.fortyBallSelections?.['1']?.[String(group)]||
    snapshot?.fortyBallSelections?.[1]?.[group]||{};
  return Object.values(selections).filter(Boolean).length;
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
        round1:{
          group1:roundOneScores(snapshot,GROUP1),
          group2:roundOneScores(snapshot,GROUP2),
          sideGame:snapshot?.sideGames?.['1']||snapshot?.sideGames?.[1]||'None',
          group1Selections:selectionCount(snapshot,1),
          group2Selections:selectionCount(snapshot,2),
          wager:Number(snapshot?.fortyBallBets?.['1']||snapshot?.fortyBallBets?.[1]||0)
        }
      };
    });
    return json({ok:true,backups});
  }catch(error){
    return json({ok:false,error:'backup health query failed'},500);
  }
}
