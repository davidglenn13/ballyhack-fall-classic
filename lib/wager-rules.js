// Shared server-side rules; this is a library module, not a public Pages Function route.
export const GROUPS = {
  1:{1:['David Glenn','Nick Condeni','Bill McCombs','Will Long'],2:['Jason Wain','Joe Phelan','Tyler Bohannon','Scott Karl']},
  2:{1:['Tyler Bohannon','Scott Karl','Bill McCombs','Will Long'],2:['David Glenn','Nick Condeni','Jason Wain','Joe Phelan']},
  3:{1:['Jason Wain','Joe Phelan','Bill McCombs','Will Long'],2:['David Glenn','Nick Condeni','Tyler Bohannon','Scott Karl']},
  4:{1:['Nick Condeni','Joe Phelan','Scott Karl','Will Long'],2:['David Glenn','Jason Wain','Tyler Bohannon','Bill McCombs']}
};

const HANDICAPS={'David Glenn':14,'Nick Condeni':6,'Jason Wain':18,'Joe Phelan':17,'Tyler Bohannon':16,'Scott Karl':9,'Bill McCombs':15,'Will Long':13};
const SI=[3,11,15,1,5,13,17,9,7,12,14,4,16,6,10,2,18,8];
const SEG55=[{holes:[1,2,3,4,5],pairing:0},{holes:[6,7,8,9,10],pairing:1},{holes:[11,12,13,14,15],pairing:2},{holes:[16],pairing:0,singleHole:true},{holes:[17],pairing:1,singleHole:true},{holes:[18],pairing:2,singleHole:true}];
const SEG66=[{holes:[1,2,3,4,5,6],pairing:0},{holes:[7,8,9,10,11,12],pairing:1},{holes:[13,14,15,16,17,18],pairing:2}];
export const segmentsFor=format=>format==='Nassau 6-6-6'?SEG66:SEG55;
export const validAmount=value=>Number.isInteger(value)&&value>=0&&value<=9999;
export function teamsFor(names,pairing){
  const [a,b,c,d]=names;
  return pairing===0?[[a,b],[c,d]]:pairing===1?[[a,c],[b,d]]:[[a,d],[b,c]];
}
export function nextUnplayed(names,holes,scores){
  return holes.find(h=>!names.every(n=>Number(scores[n]?.[h])>0))??null;
}
export function hasScores(names,scores){return names.some(n=>Object.keys(scores[n]||{}).some(h=>Number(scores[n][h])>0))}
function net(n,h,scores){
  const gross=Number(scores[n]?.[h]||0),handicap=HANDICAPS[n];
  return gross?gross-Math.floor(handicap/18)-(SI[h-1]<=handicap%18?1:0):null;
}
function losingTeam(names,seg,scores,beforeHole){
  const teams=teamsFor(names,seg.pairing);let a=0,b=0;
  for(const h of seg.holes){
    if(h>=beforeHole)break;
    if(!names.every(n=>net(n,h,scores)!==null))continue;
    const left=Math.min(...teams[0].map(n=>net(n,h,scores))),right=Math.min(...teams[1].map(n=>net(n,h,scores)));
    if(left<right)a++;else if(right<left)b++;
  }
  return a===b?null:a<b?'a':'b';
}
export function validateWagerChange({names,format,scores,previous,next,actor,admin=false}){
  if(!format)return 'Select a Nassau format first';
  if(!next||!validAmount(next.value)||!Array.isArray(next.presses))return 'Enter a valid four-digit wager amount';
  const old=previous||{value:0,presses:[]},oldPresses=old.presses||[],segs=segmentsFor(format);
  const wagerChanged=Number(old.value)!==next.value;
  // Wager entry is correctable while the scorecard is unlocked. Existing
  // presses must remain intact and simply follow the corrected base amount.
  if(wagerChanged&&oldPresses.length){
    for(const oldPress of oldPresses){
      const updated=next.presses.find(p=>String(p.id)===String(oldPress.id));
      if(!updated)return 'Recorded presses must remain when correcting the wager';
      const {amount:oldAmount,...oldShape}=oldPress;
      const {amount:newAmount,...newShape}=updated;
      if(JSON.stringify(oldShape)!==JSON.stringify(newShape)||Number(newAmount)!==Number(next.value)){
        return 'Recorded presses must keep the same terms and use the corrected wager amount';
      }
    }
  }
  if(next.presses.length>segs.length*2)return 'Too many presses';
  const oldById=new Map(oldPresses.map(p=>[String(p.id),p])),ids=new Set();
  for(const p of next.presses){
    if(!p||typeof p.id!=='string'||!/^[-\w]{1,80}$/.test(p.id)||ids.has(p.id))return 'Invalid or duplicate press ID';
    ids.add(p.id);
    if(!Number.isInteger(p.segment)||!Number.isInteger(p.fromHole)||!validAmount(p.amount)||p.amount!==next.value||!['a','b'].includes(p.pressedBy))return 'Press must use the original wager amount';
    const seg=segs[p.segment];
    if(!seg||seg.singleHole||!seg.holes.includes(p.fromHole)||p.fromHole===seg.holes[0])return 'A press cannot start on the first or a one-hole match';
    const oldP=oldById.get(p.id);
    if(oldP){
      const {amount:oldAmount,...oldShape}=oldP;
      const {amount:newAmount,...newShape}=p;
      const amountOnlyCorrection=wagerChanged&&JSON.stringify(oldShape)===JSON.stringify(newShape)&&Number(newAmount)===Number(next.value);
      if(JSON.stringify(oldP)!==JSON.stringify(p)&&!amountOnlyCorrection)return 'Recorded presses cannot be edited';
      continue;
    }
    if(p.fromHole!==nextUnplayed(names,seg.holes,scores))return 'Press must start on the next unplayed hole';
    const peers=next.presses.filter(x=>x.segment===p.segment);
    if(!p.parentPressId){
      if(peers.filter(x=>!x.parentPressId).length!==1)return 'Only one original press is allowed per match';
      if(p.pressedBy!==losingTeam(names,seg,scores,p.fromHole))return 'Only the team losing the match may press';
    }else{
      const parent=peers.find(x=>x.id===p.parentPressId&&!x.parentPressId);
      if(!parent||!oldById.has(parent.id)||peers.filter(x=>x.parentPressId).length!==1||p.pressedBy===parent.pressedBy||p.fromHole<parent.fromHole)return 'Press the Press requires the recorded opposing press';
    }
    if(!teamsFor(names,seg.pairing)[p.pressedBy==='a'?0:1].includes(actor))return 'Only the pressing team may place this wager';
  }
  for(const p of next.presses){
    if(p.parentPressId&&!next.presses.some(x=>x.id===p.parentPressId&&!x.parentPressId))return 'Press the Press has no original press';
  }
  for(const p of oldPresses){
    const nextHole=nextUnplayed(names,segs[p.segment]?.holes||[],scores);
    if(!ids.has(String(p.id))&&!admin&&(nextHole===null||p.fromHole<nextHole))return 'A started press cannot be removed by a golfer';
  }
  return null;
}
