const GROUPS = {
  1:{1:['David Glenn','Nick Condeni','Bill McCombs','Will Long'],2:['Jason Wain','Joe Phelan','Tyler Bohannon','Scott Karl']},
  2:{1:['Tyler Bohannon','Scott Karl','Bill McCombs','Will Long'],2:['David Glenn','Nick Condeni','Jason Wain','Joe Phelan']},
  3:{1:['Jason Wain','Joe Phelan','Bill McCombs','Will Long'],2:['David Glenn','Nick Condeni','Tyler Bohannon','Scott Karl']},
  4:{1:['Nick Condeni','Joe Phelan','Scott Karl','Will Long'],2:['David Glenn','Jason Wain','Tyler Bohannon','Bill McCombs']}
};

function json(data,status=200){
  return Response.json(data,{status,headers:{'cache-control':'no-store'}});
}

export async function onRequestGet({env}){
  if(!env.DB)return json({ok:false,error:'DB binding missing'},503);
  try{
    const rows=(await env.DB.prepare(
      'SELECT round_no, player, COUNT(*) AS score_count FROM tournament_scores GROUP BY round_no, player ORDER BY round_no, player'
    ).all()).results;
    const locks=(await env.DB.prepare(
      'SELECT round_no, group_no FROM tournament_group_locks ORDER BY round_no, group_no'
    ).all()).results;

    const rounds={};
    for(let r=1;r<=4;r++){
      rounds[r]={1:{count:0,expected:72},2:{count:0,expected:72}};
      for(const g of [1,2]){
        const names=GROUPS[r][g];
        rounds[r][g].count=rows
          .filter(x=>Number(x.round_no)===r&&names.includes(x.player))
          .reduce((sum,x)=>sum+Number(x.score_count||0),0);
        rounds[r][g].locked=locks.some(x=>Number(x.round_no)===r&&Number(x.group_no)===g);
      }
    }
    return json({ok:true,rounds});
  }catch(error){
    return json({ok:false,error:'health query failed'},500);
  }
}
