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
  const pending=new Map();
  const persist=(r,g)=>{
    save();
    const key=`${r}:${g}`;
    const next=(pending.get(key)||Promise.resolve()).catch(()=>{}).then(()=>apiPost({op:'nassauBetConfig',round:r,group:g,config:cfg(r,g)}));
    pending.set(key,next);return next;
  };
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
      return !!parent&&+p.segment===+parent.segment&&p.pressedBy!==parent.pressedBy&&+p.fromHole>=+parent.fromHole;
    });
    if(c.presses.length!==before){ persist(r,g).catch(()=>{}); return true; }
    return false;
  }
  function originalPressInSegment(c,si){ return c.presses.filter(p=>+p.segment===si&&!p.parentPressId).sort((a,b)=>(+a.fromHole)-(+b.fromHole))[0]||null; }
  function counterPressFor(c,p){ return p?c.presses.find(x=>String(x.parentPressId||'')===String(p.id)):null; }

  function addWagerToPicker(r,g){
    const picker=document.querySelector('.side-game-picker'),scoreSide=document.querySelector('#scoreSideGame');
    if(!picker||!scoreSide||!hasNassau(r,g)||picker.querySelector('.nlp-wager'))return;
    const c=cfg(r,g),value=typeof sideGameWasSelected==='function'&&sideGameWasSelected(r,g)?c.value:0,host=scoreSide.closest('div')||picker;
    host.insertAdjacentHTML('beforeend',`<label class="nlp-wager ${value?'':'needs-wager'}"><span class="wager-next">Next step: enter the wager for this side game</span><strong>Wager Amount</strong><span class="wager-entry"><span aria-hidden="true">$</span><input type="text" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="off" data-nlp-wager data-r="${r}" data-g="${g}" value="${value||''}" aria-label="Nassau wager amount"></span></label>`);
  }
  function removeSideGameWagerInputs(){ document.querySelectorAll('.side-result-panel .nb-controls').forEach(x=>{const label=x.querySelector('label');if(label)label.remove();}); }
  function pairingSummary(r,g){
    return segmentsFor(r,g).map(seg=>{
      const teams=nassauTeams(roundGroupNames(r,g),seg.pairing);
      return `${seg.label}: ${shortTeam(teams[0])} vs ${shortTeam(teams[1])}`;
    }).join(' · ');
  }
  function moveSelectedPicker(r,g,target){
    const picker=document.querySelector('.side-game-picker');
    if(!picker||!target||!cfg(r,g).value||typeof sideGameWasSelected!=='function'||!sideGameWasSelected(r,g))return;
    picker.classList.add('side-game-picker-detached');
    picker.querySelector('.nlp-wager .wager-next')?.replaceChildren('Wager Set');
    let pairings=picker.querySelector('.nlp-pairings');
    if(!pairings){
      pairings=document.createElement('div');
      pairings.className='nlp-pairings';
      picker.appendChild(pairings);
    }
    pairings.innerHTML=`<b>Pairings</b><span>${pairingSummary(r,g)}</span>`;
    target.insertAdjacentElement('afterend',picker);
  }

  function enhanceScore(){
    const app=document.querySelector('#app'); if(!app)return;
    const scoreSide=document.querySelector('#scoreSideGame'); if(!scoreSide){removeSideGameWagerInputs();return;}
    const r=+(sessionStorage.r||1),g=+(sessionStorage.group||1),h=+(sessionStorage.hole||1);
    const selected=state.sideGames?.[r]||'None';
    if(selected==='40 Ball'||selected==='None'||!hasNassau(r,g)){
      document.querySelectorAll('.nlp-wager,.nlp-card').forEach(x=>x.remove());
      return;
    }
    addWagerToPicker(r,g);
    const existingCard=app.querySelector('.nlp-card');
    if(existingCard){
      moveSelectedPicker(r,g,existingCard);
      return;
    }
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

    if(singleHole)return;
    const cards=[];
    const wagerCard=(label,p,teamKey,pressState)=>`<div class="nlp-wager-card recorded"><div><span class="nlp-bet-label">${label}</span><h3>${shortTeam(teamKey==='a'?teams[0]:teams[1])}</h3></div><div class="nlp-side"><span>Starts</span><b>Hole ${p.fromHole}</b></div><div class="nlp-side"><span>${pressState.played===seg.holes.filter(x=>x>=+p.fromHole).length?'Final':'Standing'}</span><b>${teamPosition(pressState,teamKey)}</b></div><div class="nlp-side"><span>Wager</span><b>$${p.amount}</b></div></div>`;

    if(activePress){
      cards.push(wagerCard('PRESS',activePress,activePress.pressedBy,activeStanding));
      if(counterPress){
        cards.push(wagerCard('PRESS THE PRESS',counterPress,counterPress.pressedBy,pressStanding(r,g,seg,counterPress)));
      }else if(nextHole!==null&&nextHole>=+activePress.fromHole){
        cards.push(`<div class="nlp-wager-card available"><div><span class="nlp-bet-label">PRESS THE PRESS</span><h3>${shortTeam(counterTeam)}</h3><small data-nlp-base>Wager: ${c.value?'$'+c.value:'not entered'}</small></div><div class="nlp-side"><span>New Bet Starts</span><b>Hole ${nextHole}</b></div><div class="nlp-side"><span>Remaining Holes</span><b>${seg.holes.filter(x=>x>=nextHole).length}</b></div><button type="button" class="primary" data-nlp-add data-r="${r}" data-g="${g}" data-si="${si}" data-hole="${nextHole}" ${c.value?'':'disabled'}>Press the Press</button></div>`);
      }
    }else if(nextHole!==null&&nextHole!==firstHole){
      cards.push(`<div class="nlp-wager-card available"><div><span class="nlp-bet-label">PRESS</span><h3>${losingTeam?shortTeam(losingTeam):'No team eligible'}</h3><small data-nlp-base>Wager: ${c.value?'$'+c.value:'not entered'}</small></div><div class="nlp-side"><span>Current Match</span><b>${losingTeam?`${standing.margin} down`:'All square'}</b></div><div class="nlp-side"><span>New Bet Starts</span><b>Hole ${nextHole}</b></div>${losingTeam?`<button type="button" class="primary" data-nlp-add data-r="${r}" data-g="${g}" data-si="${si}" data-hole="${nextHole}" ${c.value?'':'disabled'}>Press</button>`:''}</div>`);
    }
    if(!cards.length){ moveSelectedPicker(r,g,scoreSide.closest('.card')||app.querySelector('.card')); return; }
    const html=`<section class="card nlp-card"><div class="eyebrow">LIVE NASSAU · ${fmt.replace('Nassau ','')}</div><h2>Press Wagers</h2><p class="muted">Each wager is separate and runs from its starting hole through the end of ${seg.label}.</p><div class="nlp-wagers">${cards.join('')}</div>${!c.value?'<p class="notice" data-nlp-hint>Set Wager Amount in the Side Game selection above to activate Press.</p>':''}</section>`;
    const scoreCard=scoreSide.closest('.card')||app.querySelector('.card');
    scoreCard?.insertAdjacentHTML('afterend',html);
    const pressCard=app.querySelector('.nlp-card');
    moveSelectedPicker(r,g,pressCard);
  }

  function style(){
    if(document.querySelector('#nlp-style'))return;
    const s=document.createElement('style');s.id='nlp-style';s.textContent=`.nlp-wager{display:grid;gap:4px;margin-top:8px;font-size:10px;font-weight:800;color:var(--muted);max-width:160px}.nlp-wager input{width:100%;font-size:16px;font-weight:900}.side-game-picker-detached{grid-column:span 12;width:100%;max-width:none;margin-top:14px;padding:14px;border:2px solid var(--navy);border-radius:10px;background:#fff;color:var(--navy)}.side-game-picker-detached .wager-next{display:block;font-size:15px;font-weight:900;color:var(--navy)}.side-game-picker-detached .wager-entry{display:flex;align-items:center;gap:8px;padding:0 12px;border:1px solid var(--line);border-radius:8px;background:#fff;font-size:20px}.side-game-picker-detached .wager-entry input{flex:1;min-width:0;width:100%;padding:10px 0;border:0;outline:0;background:transparent;font-size:20px}.nlp-pairings{margin-top:10px;padding-top:9px;border-top:1px solid var(--line);font-size:11px;line-height:1.45;color:var(--muted)}.nlp-pairings b{display:block;margin-bottom:3px;color:var(--navy);font-size:10px;letter-spacing:.05em;text-transform:uppercase}.nlp-pairings span{display:block}.nlp-card{border:2px solid rgba(23,54,93,.18)}.nlp-card h2{margin-bottom:4px}.nlp-wagers{display:grid;gap:10px;margin-top:14px}.nlp-wager-card{display:grid;grid-template-columns:minmax(150px,1.4fr) repeat(2,minmax(100px,1fr)) auto;gap:10px;align-items:center;padding:13px;border:1px solid var(--line);border-radius:12px;background:#fff}.nlp-wager-card.recorded{border-left:5px solid #17365d}.nlp-wager-card.available{border-left:5px solid #e11}.nlp-bet-label{display:block;color:#e11;font-size:10px;font-weight:900;letter-spacing:.08em}.nlp-wager-card h3{margin:3px 0 0}.nlp-side{display:grid;gap:4px;font-size:10px;font-weight:800;color:var(--muted);padding:9px 10px;border:1px solid var(--line);border-radius:8px}.nlp-side b{font-size:13px;color:var(--text)}.nlp-wager-card button{min-width:140px}.nlp-wager-card button:disabled{opacity:.5}.side-result-panel .nb-controls{grid-template-columns:1fr}@media(max-width:650px){.nlp-wager{max-width:none}.nlp-wager-card{grid-template-columns:1fr 1fr}.nlp-wager-card>div:first-child{grid-column:1/3}.nlp-wager-card button{grid-column:1/3;width:100%}}`;document.head.appendChild(s);
  }

  document.addEventListener('input',e=>{const w=e.target.closest?.('[data-nlp-wager]');if(!w)return;w.value=w.value.replace(/\D/g,'').slice(0,4);const c=cfg(+w.dataset.r,+w.dataset.g);c.value=+w.value||0;w.closest('.nlp-wager')?.classList.toggle('needs-wager',!c.value);save();const card=document.querySelector('.nlp-card');card?.querySelectorAll('[data-nlp-add]').forEach(b=>b.disabled=!c.value);card?.querySelectorAll('[data-nlp-base]').forEach(el=>el.textContent=`Wager: ${c.value?'$'+c.value:'not entered'}`);const hint=card?.querySelector('[data-nlp-hint]');if(hint)hint.hidden=!!c.value;});
  document.addEventListener('change',e=>{const w=e.target.closest?.('[data-nlp-wager]');if(!w)return;const r=+w.dataset.r,g=+w.dataset.g,c=cfg(r,g);if(typeof sideGameWasSelected==='function'){const key='ballyhack-side-selected-'+r+'-'+g;if(c.value)sessionStorage.setItem(key,'1');else sessionStorage.removeItem(key);}persist(r,g).then(()=>render()).catch(()=>{});});
  document.addEventListener('click',e=>{
    const b=e.target.closest?.('[data-nlp-add]');if(!b)return;
    const r=+b.dataset.r,g=+b.dataset.g,si=+b.dataset.si,h=+b.dataset.hole,c=cfg(r,g),segments=segmentsFor(r,g),seg=segments[si];if(!seg)return;
    if(seg.singleHole){alert('Presses are not available on the standalone one-hole matches on 16, 17, and 18.');render();return;}
    const nextHole=nextUnplayedHole(r,g,seg);sanitizePresses(r,g,si,seg,c,nextHole);
    const original=originalPressInSegment(c,si),counter=counterPressFor(c,original);
    if(original){
      if(counter){alert('The original press has already been pressed back.');render();return;}
      if(h<+original.fromHole){alert(`Press the Press can start on Hole ${original.fromHole} or a later unplayed hole.`);render();return;}
      if(h!==nextHole){alert(`Press the Press can only start on the next unplayed hole, Hole ${nextHole}.`);render();return;}
      const amount=Math.min(9999,Math.max(0,+c.value||0));if(!amount){alert('Enter the Nassau wager amount first.');return;}
      c.presses.push({id:`p${Date.now()}${Math.random().toString(36).slice(2,6)}`,segment:si,fromHole:h,pressedBy:original.pressedBy==='a'?'b':'a',amount,parentPressId:original.id});persist(r,g).then(()=>render());return;
    }
    if(h===seg.holes[0]){alert(`A press cannot start on the first hole of a Nassau match. The earliest press is Hole ${seg.holes[1]}.`);render();return;}
    if(h!==nextHole){alert(`A press can only be elected on the next unplayed hole, Hole ${nextHole}.`);render();return;}
    const loser=liveStanding(r,g,seg).loser;if(!loser){alert('A press can only be entered by the team currently losing this Nassau match.');render();return;}
    const amount=Math.min(9999,Math.max(0,+c.value||0));if(!amount){alert('Enter the Nassau wager amount first.');return;}
    c.presses.push({id:`p${Date.now()}${Math.random().toString(36).slice(2,6)}`,segment:si,fromHole:h,pressedBy:loser,amount});persist(r,g).then(()=>render());
  });

  style();
  const prior=render;render=function(){prior();setTimeout(()=>{enhanceScore();removeSideGameWagerInputs()},0);};
  setTimeout(()=>{enhanceScore();removeSideGameWagerInputs()},0);
})();
