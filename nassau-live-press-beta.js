/* Nassau wager and press entry directly on live Score page for 5-5-5-3 and 6-6-6. */
(() => {
  const hasNassau=(r,g)=>!!(state.nassauGroups?.[r]?.[g]||state.nassauGroups?.[String(r)]?.[String(g)]);
  const segmentsFor=(r,g)=>typeof window.nassauSegmentsFor==='function'?window.nassauSegmentsFor(r,g):NASSAU_SEGMENTS;
  const formatFor=(r,g)=>typeof window.nassauFormatFor==='function'?window.nassauFormatFor(r,g):'Nassau 5-5-5-3';
  const cfg=(r,g)=>{
    state.nassauBets??={}; state.nassauBets[r]??={};
    state.nassauBets[r][g]??={value:0,presses:[]};
    state.nassauBets[r][g].value=Number(state.nassauBets[r][g].value||0);
    state.nassauBets[r][g].presses=Array.isArray(state.nassauBets[r][g].presses)?state.nassauBets[r][g].presses:[];
    return state.nassauBets[r][g];
  };
  const persist=async(r,g)=>{ save(); await apiPost({op:'nassauBetConfig',round:r,group:g,config:cfg(r,g)}); };
  const shortTeam=t=>t.map(n=>n.split(' ')[0]).join(' / ');

  function liveStanding(r,g,seg){
    const x=nassauSegment(r,g,seg);
    const margin=Math.abs(x.aWins-x.bWins);
    const loser=!x.played||x.aWins===x.bWins?null:(x.aWins<x.bWins?'a':'b');
    return {x,margin,loser};
  }
  function pressStanding(r,g,seg,p){
    const teams=nassauTeams(roundGroupNames(r,g),seg.pairing);
    let aWins=0,bWins=0,played=0;
    for(const hole of seg.holes.filter(x=>x>=+p.fromHole)){
      if(!holeComplete(r,g,hole))continue;
      const a=teams[0].map(n=>netScore(r,n,hole)),b=teams[1].map(n=>netScore(r,n,hole));
      if(a.some(x=>x===null)||b.some(x=>x===null))continue;
      played++;
      const av=Math.min(...a),bv=Math.min(...b);
      if(av<bv)aWins++;else if(bv<av)bWins++;
    }
    return {teams,aWins,bWins,played,margin:aWins-bWins};
  }
  function teamPosition(standing,team){
    if(!standing?.played)return 'Not started';
    if(!standing.margin)return 'All square';
    const teamAhead=(team==='a'&&standing.margin>0)||(team==='b'&&standing.margin<0);
    const margin=Math.abs(standing.margin);
    return `${margin} hole${margin===1?'':'s'} ${teamAhead?'up':'down'}`;
  }
  function holeComplete(r,g,h){ return roundGroupNames(r,g).every(n=>+state.scores?.[r]?.[n]?.[h]>0); }
  function nextUnplayedHole(r,g,seg){ return seg.holes.find(h=>!holeComplete(r,g,h)) ?? null; }
  function sanitizePresses(r,g,si,seg,c,nextHole){
    const before=c.presses.length;
    if(seg.singleHole){
      c.presses=c.presses.filter(p=>+p.segment!==si);
    }else if(nextHole!==null){
      const minStart=seg.holes[1];
      c.presses=c.presses.filter(p=>+p.segment!==si || (+p.fromHole>=minStart && +p.fromHole<=nextHole));
    }
    const originals=new Map(c.presses.filter(p=>!p.parentPressId).map(p=>[String(p.id),p]));
    c.presses=c.presses.filter(p=>{
      if(!p.parentPressId)return true;
      const parent=originals.get(String(p.parentPressId));
      return !!parent&&+p.segment===+parent.segment&&p.pressedBy!==parent.pressedBy&&+p.fromHole>+parent.fromHole;
    });
    if(c.presses.length!==before){ persist(r,g).catch(()=>{}); return true; }
    return false;
  }
  function originalPressInSegment(c,si){ return c.presses.filter(p=>+p.segment===si&&!p.parentPressId).sort((a,b)=>(+a.fromHole)-(+b.fromHole))[0]||null; }
  function counterPressFor(c,p){ return p?c.presses.find(x=>String(x.parentPressId||'')===String(p.id)):null; }

  function addWagerToPicker(r,g){
    const picker=document.querySelector('.side-game-picker'),scoreSide=document.querySelector('#scoreSideGame');
    if(!picker||!scoreSide||!hasNassau(r,g)||picker.querySelector('.nlp-wager'))return;
    const c=cfg(r,g),host=scoreSide.closest('div')||picker;
    host.insertAdjacentHTML('beforeend',`<label class="nlp-wager">Wager Amount $<input type="text" inputmode="numeric" pattern="[0-9]*" maxlength="3" autocomplete="off" data-nlp-wager data-r="${r}" data-g="${g}" value="${c.value||''}" placeholder="5" aria-label="Nassau wager amount"></label>`);
  }
  function removeSideGameWagerInputs(){ document.querySelectorAll('.side-result-panel .nb-controls').forEach(x=>{const label=x.querySelector('label');if(label)label.remove();}); }

  function enhanceScore(){
    const app=document.querySelector('#app'); if(!app)return;
    const scoreSide=document.querySelector('#scoreSideGame'); if(!scoreSide){removeSideGameWagerInputs();return;}
    const r=+(sessionStorage.r||1),g=+(sessionStorage.group||1),h=+(sessionStorage.hole||1);
    if(!hasNassau(r,g))return;
    addWagerToPicker(r,g); if(app.querySelector('.nlp-card'))return;
    const segments=segmentsFor(r,g),si=segments.findIndex(s=>s.holes.includes(h)); if(si<0)return;
    const seg=segments[si],teams=nassauTeams(roundGroupNames(r,g),seg.pairing),c=cfg(r,g),fmt=formatFor(r,g);
    const firstHole=seg.holes[0],nextHole=nextUnplayedHole(r,g,seg),singleHole=!!seg.singleHole;
    sanitizePresses(r,g,si,seg,c,nextHole);

    const isFirstHole=h===firstHole,isNextHole=h===nextHole,standing=liveStanding(r,g,seg);
    const segmentPresses=c.presses.filter(p=>+p.segment===si),activePress=originalPressInSegment(c,si),counterPress=counterPressFor(c,activePress),pressRecorded=!!activePress,counterRecorded=!!counterPress;
    const loser=(!singleHole&&!pressRecorded&&!isFirstHole&&isNextHole)?standing.loser:null;
    const losingTeam=loser==='a'?teams[0]:loser==='b'?teams[1]:null;
    const counterTeamKey=activePress?(activePress.pressedBy==='a'?'b':'a'):null;
    const counterTeam=counterTeamKey?(counterTeamKey==='a'?teams[0]:teams[1]):null;
    const activeStanding=activePress?pressStanding(r,g,seg,activePress):null;

    let status='';
    if(singleHole) status=`${seg.label} is a standalone one-hole match worth the Nassau wager. Presses are not available on one-hole matches.`;
    else if(counterRecorded) status=`${shortTeam(counterTeam)} pressed the press on Hole ${counterPress.fromHole}. Both press bets are active.`;
    else if(pressRecorded&&nextHole===null) status='This Nassau match and its press are complete.';
    else if(pressRecorded&&h<=+activePress.fromHole) status=`The original press starts on Hole ${activePress.fromHole}. Press the Press becomes available on the next unplayed hole.`;
    else if(pressRecorded&&!isNextHole) status=`Press the Press may only start on the next unplayed hole, Hole ${nextHole}.`;
    else if(pressRecorded) status=`${shortTeam(counterTeam)} may Press the Press on Hole ${h}. This creates a separate ${c.value?`$${c.value}`:'same-value'} wager.`;
    else if(isFirstHole) status=`Presses are not available on the first hole of a match. The earliest press can start is Hole ${seg.holes[1]}.`;
    else if(nextHole===null) status='This Nassau match is complete.';
    else if(!isNextHole) status=`Presses may only be elected on the next unplayed hole, Hole ${nextHole}.`;
    else if(losingTeam) status=`${shortTeam(losingTeam)} are currently ${standing.margin} down. Tapping Press Now starts the press on Hole ${h}.`;
    else status='No press available while this match is tied.';

    const canOriginalPress=!singleHole&&!pressRecorded&&!isFirstHole&&isNextHole&&!!losingTeam&&c.value>0;
    const canCounterPress=!singleHole&&pressRecorded&&!counterRecorded&&isNextHole&&h>+activePress.fromHole&&c.value>0;
    const canPress=canOriginalPress||canCounterPress;
    const pressTeam=counterRecorded?(counterPress.pressedBy==='a'?teams[0]:teams[1]):pressRecorded?counterTeam:losingTeam;
    const downBy=singleHole?'—':pressRecorded?teamPosition(activeStanding,counterTeamKey):(losingTeam?`${standing.margin} hole${standing.margin===1?'':'s'} down`:'—');
    const startText=singleHole?'No press':counterRecorded?`Hole ${counterPress.fromHole}`:canPress?`Hole ${h}`:'—';
    const buttonText=singleHole?'No Press':counterRecorded?'Press the Press Recorded':pressRecorded?'Press the Press':'Press Now';
    const pressSummary=pressRecorded?` · Original press: Hole ${activePress.fromHole}${counterRecorded?` · Press the Press: Hole ${counterPress.fromHole}`:''}`:'';
    const html=`<section class="card nlp-card"><div class="eyebrow">LIVE NASSAU · ${fmt.replace('Nassau ','')}</div><h2>Press Bet</h2><p class="muted">Current match: ${seg.label}. ${status}</p><div class="nlp-grid"><button type="button" class="primary" data-nlp-add data-r="${r}" data-g="${g}" data-si="${si}" data-hole="${h}" disabled>${buttonText}</button><div class="nlp-side"><span>Pressing side</span><b>${pressTeam?shortTeam(pressTeam):'—'}</b></div><div class="nlp-side"><span>${pressRecorded?'Original press standing':'Down By'}</span><b>${downBy}</b></div><div class="nlp-side"><span>New bet starts</span><b>${startText}</b></div></div><div class="nlp-foot">${singleHole?`Standalone match value: ${c.value?`$${c.value}`:'enter Nassau wager above'} · No press permitted`:`<b>${segmentPresses.length}</b> press bet${segmentPresses.length===1?'':'s'} recorded in this match · Each uses the Nassau wager ${c.value?`($${c.value})`:'amount'}${pressSummary}${!c.value?' · Enter the Nassau wager above before pressing.':''}`}</div></section>`;
    const scoreCard=scoreSide.closest('.card')||app.querySelector('.card');
    if(scoreCard){scoreCard.insertAdjacentHTML('afterend',html);const b=app.querySelector('.nlp-card [data-nlp-add]');if(b&&!singleHole)b.disabled=!canPress;}
  }

  function style(){
    if(document.querySelector('#nlp-style'))return;
    const s=document.createElement('style');s.id='nlp-style';s.textContent=`.nlp-wager{display:grid;gap:4px;margin-top:8px;font-size:10px;font-weight:800;color:var(--muted);max-width:160px}.nlp-wager input{width:100%;font-size:16px;font-weight:900}.nlp-card{border:2px solid rgba(23,54,93,.18)}.nlp-card h2{margin-bottom:4px}.nlp-grid{display:grid;grid-template-columns:auto repeat(3,minmax(0,1fr));gap:8px;align-items:stretch}.nlp-grid button{min-width:120px}.nlp-side{display:grid;gap:4px;font-size:10px;font-weight:800;color:var(--muted);padding:9px 10px;border:1px solid var(--line);border-radius:8px}.nlp-side b{font-size:13px;color:var(--text)}.nlp-grid button:disabled{opacity:.5}.nlp-foot{margin-top:9px;padding-top:8px;border-top:1px solid var(--line);font-size:11px;color:var(--muted)}.side-result-panel .nb-controls{grid-template-columns:1fr}@media(max-width:650px){.nlp-grid{grid-template-columns:1fr 1fr}.nlp-grid button{width:100%;min-width:0}.nlp-grid .nlp-side:last-child{grid-column:2}.nlp-wager{max-width:none}}`;document.head.appendChild(s);
  }

  document.addEventListener('input',e=>{const w=e.target.closest?.('[data-nlp-wager]');if(!w)return;w.value=w.value.replace(/\D/g,'').slice(0,3);});
  document.addEventListener('change',e=>{const w=e.target.closest?.('[data-nlp-wager]');if(!w)return;const r=+w.dataset.r,g=+w.dataset.g,c=cfg(r,g);c.value=Math.min(999,Math.max(0,parseInt(w.value,10)||0));w.value=c.value||'';persist(r,g).then(()=>render());});
  document.addEventListener('click',e=>{
    const b=e.target.closest?.('[data-nlp-add]');if(!b)return;
    const r=+b.dataset.r,g=+b.dataset.g,si=+b.dataset.si,h=+b.dataset.hole,c=cfg(r,g),segments=segmentsFor(r,g),seg=segments[si];if(!seg)return;
    if(seg.singleHole){alert('Presses are not available on the standalone one-hole matches on 16, 17, and 18.');render();return;}
    const nextHole=nextUnplayedHole(r,g,seg);sanitizePresses(r,g,si,seg,c,nextHole);
    const original=originalPressInSegment(c,si),counter=counterPressFor(c,original);
    if(original){
      if(counter){alert('The original press has already been pressed back.');render();return;}
      if(h<=+original.fromHole){alert(`Press the Press becomes available after Hole ${original.fromHole} is completed.`);render();return;}
      if(h!==nextHole){alert(`Press the Press can only start on the next unplayed hole, Hole ${nextHole}.`);render();return;}
      const amount=Math.min(999,Math.max(0,+c.value||0));if(!amount){alert('Enter the Nassau wager amount first.');return;}
      c.presses.push({id:`p${Date.now()}${Math.random().toString(36).slice(2,6)}`,segment:si,fromHole:h,pressedBy:original.pressedBy==='a'?'b':'a',amount,parentPressId:original.id});persist(r,g).then(()=>render());return;
    }
    if(h===seg.holes[0]){alert(`A press cannot start on the first hole of a Nassau match. The earliest press is Hole ${seg.holes[1]}.`);render();return;}
    if(h!==nextHole){alert(`A press can only be elected on the next unplayed hole, Hole ${nextHole}.`);render();return;}
    const loser=liveStanding(r,g,seg).loser;if(!loser){alert('A press can only be entered by the team currently losing this Nassau match.');render();return;}
    const amount=Math.min(999,Math.max(0,+c.value||0));if(!amount){alert('Enter the Nassau wager amount first.');return;}
    c.presses.push({id:`p${Date.now()}${Math.random().toString(36).slice(2,6)}`,segment:si,fromHole:h,pressedBy:loser,amount});persist(r,g).then(()=>render());
  });

  style();
  const prior=render;render=function(){prior();setTimeout(()=>{enhanceScore();removeSideGameWagerInputs()},0);};
  setTimeout(()=>{enhanceScore();removeSideGameWagerInputs()},0);
})();
