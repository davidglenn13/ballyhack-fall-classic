/* Group-specific Nassau selection + saved side-game results beta. Supports 5-5-5-1-1-1 and 6-6-6. */
(() => {
  state.nassauGroups ??= {};

  const N55='Nassau 5-5-5-1-1-1';
  const LEGACY_N55='Nassau 5-5-5-3';
  const N66='Nassau 6-6-6';
  const FORTY='40 Ball';
  const SEG55=[
    {label:'Holes 1–5',holes:[1,2,3,4,5],pairing:0},
    {label:'Holes 6–10',holes:[6,7,8,9,10],pairing:1},
    {label:'Holes 11–15',holes:[11,12,13,14,15],pairing:2},
    {label:'Hole 16',holes:[16],pairing:0,singleHole:true},
    {label:'Hole 17',holes:[17],pairing:1,singleHole:true},
    {label:'Hole 18',holes:[18],pairing:2,singleHole:true}
  ];
  const SEG66=[
    {label:'Holes 1–6',holes:[1,2,3,4,5,6],pairing:0},
    {label:'Holes 7–12',holes:[7,8,9,10,11,12],pairing:1},
    {label:'Holes 13–18',holes:[13,14,15,16,17,18],pairing:2}
  ];

  function roundNo(){ return +(sessionStorage.r||1); }
  function groupNo(){ return +(sessionStorage.group||1); }
  function sideRound(){ return +(sessionStorage.sideRound||sessionStorage.r||1); }
  function nassauMap(r){
    state.nassauGroups ??= {};
    state.nassauGroups[r] ??= {};
    return state.nassauGroups[r];
  }
  function formatFor(r,g){
    const v=state.nassauGroups?.[r]?.[g] ?? state.nassauGroups?.[String(r)]?.[String(g)];
    if(v===N66)return N66;
    if(v===N55||v===LEGACY_N55||v)return N55;
    return null;
  }
  function segmentsFor(r,g){ return formatFor(r,g)===N66?SEG66:SEG55; }
  function hasNassau(r,g){ return !!formatFor(r,g); }
  function activeNassauGroups(r){ return [1,2].filter(g=>hasNassau(r,g)); }
  function fortyActive(r){ return (state.sideGames?.[r]??state.sideGames?.[String(r)]??'None')===FORTY; }
  function fallbackRoundGame(r,excludingGroup=0){
    for(const g of [1,2]){
      if(g===excludingGroup)continue;
      const fmt=formatFor(r,g);
      if(fmt)return fmt;
    }
    return 'None';
  }
  function firstNames(r,g){ return roundGroupNames(r,g).map(n=>n.split(' ')[0]).join(' · '); }
  function money(v){
    const n=Math.max(0,Number(v||0));
    return `$${n.toFixed(Number.isInteger(n)?0:2)}`;
  }
  function esc(s){ return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  window.nassauFormatFor=formatFor;
  window.nassauSegmentsFor=segmentsFor;

  async function setRoundGame(r,value){
    state.sideGames[r]=value;
    save();
    if(!await apiPost({op:'sideGame',round:r,value}))throw new Error('Side game was not saved');
  }
  async function setNassauGroup(r,g,value){
    const map=nassauMap(r);
    if(value) map[g]=value; else delete map[g];
    save();
    if(!await apiPost({op:'nassauGroup',round:r,group:g,value:value||false}))throw new Error('Nassau format was not saved');
  }

  function clearFortyWager(r){
    state.fortyBallBets??={};
    state.fortyBallBets[r]=0;
    save();
    // The game change must never be blocked by a wager-reset sync conflict.
    // Keep the UI reset locally and sync the zero in the background.
    Promise.resolve(window.__fortyWagerPending).catch(()=>{}).finally(()=>{
      apiPost({op:'fortyBallBet',round:r,value:0}).catch?.(()=>{});
    });
  }
  function clearNassauWager(r,g){
    state.nassauBets??={};
    state.nassauBets[r]??={};
    state.nassauBets[r][g]={value:0,presses:[]};
    save();
    apiPost({
      op:'nassauBetConfig',
      round:r,
      group:g,
      config:{value:0,presses:[]}
    }).catch?.(()=>{});
  }

  async function handleFortyChange(select){
    const r=roundNo(), turningOn=select.value==='on', wasActive=fortyActive(r);
    try{
      if(turningOn){
        await setRoundGame(r,FORTY);
        if(!wasActive){
          clearFortyWager(r);
          sessionStorage.removeItem('ballyhack-side-selected-'+r+'-1');
          sessionStorage.removeItem('ballyhack-side-selected-'+r+'-2');
        }
      }else if(wasActive){
        await setRoundGame(r,formatFor(r,groupNo())||fallbackRoundGame(r)||'None');
        clearFortyWager(r);
        sessionStorage.removeItem('ballyhack-side-selected-'+r+'-1');
        sessionStorage.removeItem('ballyhack-side-selected-'+r+'-2');
      }
      render();
    }catch(error){
      await loadShared();
      render();
      alert('That 40 Ball change was not saved. Review the current choice and try again.');
    }
  }

  async function handleNassauChange(select){
    const r=roundNo(),g=groupNo(),value=select.value||false,previous=formatFor(r,g);
    try{
      await setNassauGroup(r,g,value);
      if(previous!==(value||null)){
        clearNassauWager(r,g);
        sessionStorage.removeItem('ballyhack-side-selected-'+r+'-'+g);
      }
      if(!fortyActive(r))await setRoundGame(r,value||fallbackRoundGame(r,g)||'None');
      render();
    }catch(error){
      await loadShared();
      render();
      alert('That Nassau change was not saved. Review the current choice and try again.');
    }
  }

  function syncScorePicker(){
    const fortySel=document.querySelector('#scoreFortyBall');
    const nassauSel=document.querySelector('#scoreNassau');
    if(!fortySel||!nassauSel)return;
    const r=roundNo(),g=groupNo(),fmt=formatFor(r,g);
    fortySel.value=fortyActive(r)?'on':'off';
    nassauSel.value=fmt||'';
    let note=nassauSel.closest('.side-game-control')?.querySelector('.nassau-group-note');
    if(!note){
      note=document.createElement('div');
      note.className='nassau-group-note';
      nassauSel.closest('label')?.insertAdjacentElement('afterend',note);
    }
    let pairings=nassauSel.closest('.side-game-control')?.querySelector('.nassau-pairing-note');
    if(!pairings){
      pairings=document.createElement('div');
      pairings.className='nassau-pairing-note';
      note.insertAdjacentElement('afterend',pairings);
    }
    if(fmt){
      note.textContent=fmt===N55
        ?'Nassau 5-5-5-1-1-1 is active for this foursome.'
        :`${fmt} is active only for this foursome.`;
      const pairingSegments=segmentsFor(r,g);
      const pairingRows=(fmt===N55?pairingSegments.slice(0,3):pairingSegments).map(seg=>{
        const teams=nassauTeams(roundGroupNames(r,g),seg.pairing);
        return `<span>${seg.label}: ${teams[0].map(n=>n.split(' ')[0]).join(' / ')} vs ${teams[1].map(n=>n.split(' ')[0]).join(' / ')}</span>`;
      });
      if(fmt===N55)pairingRows.push('<span>Holes 16–18: Repeat the pairing order</span>');
      pairings.innerHTML='<b>Pairings</b>'+pairingRows.join('');
    }else{
      note.textContent='Nassau is off for this foursome.';
      pairings.textContent='';
    }
    if(typeof window.__ensureNassauWagerField==='function'){
      window.__ensureNassauWagerField(r,g);
    }
  }

  function nassauPanel(r,g){
    const names=roundGroupNames(r,g),fmt=formatFor(r,g)||N55,segs=segmentsFor(r,g);
    return `<section class="side-result-panel" data-side-group="${g}" data-nassau-format="${esc(fmt)}">
      <h3>${g===1?'First':'Second'} Group · ${fmt.replace('Nassau ','')}</h3>
      <p>${names.map(n=>n.split(' ')[0]).join(' · ')}</p>
      <div class="nassau-grid">
        ${segs.map(seg=>{
          const x=nassauSegment(r,g,seg);
          return `<div class="nassau-segment" data-single-hole="${seg.singleHole?'1':'0'}">
            <b>${seg.label}</b>
            <span>${x.teams[0].map(n=>n.split(' ')[0]).join(' + ')} vs ${x.teams[1].map(n=>n.split(' ')[0]).join(' + ')}</span>
            <strong>${x.status}</strong>
            <small>${x.played}/${x.total} holes complete${seg.singleHole?' · Standalone one-hole match':''}</small>
          </div>`;
        }).join('')}
      </div>
    </section>`;
  }

  function fortyArchive(r){
    const value=Math.max(0,Number(state.fortyBallBets?.[r]??state.fortyBallBets?.[String(r)]??0));
    const summary=g=>{
      const map=state.fortyBallSelections?.[r]?.[g]||state.fortyBallSelections?.[String(r)]?.[String(g)]||{};
      let count=0,rel=0;
      roundGroupNames(r,g).forEach(n=>{for(let h=1;h<=18;h++){
        if(!map[`${n}|${h}`])continue;
        const net=netScore(r,n,h); if(net===null)continue;
        count++; rel+=net-PAR[h-1];
      }});
      const fmt=rel===0?'E':rel>0?`+${rel}`:`${rel}`;
      return `${g===1?'First':'Second'} Group: ${fmt} · ${count}/40 counted`;
    };
    return `<div class="saved-side-entry"><b>${esc(ROUNDS[r-1].name)} · 40 Ball</b><span><strong>Wager:</strong> ${value?`${money(value)} per player`:'Not entered'}</span><span>${summary(1)}</span><span>${summary(2)}</span></div>`;
  }

  function nassauArchive(r){
    const groups=activeNassauGroups(r);
    if(!groups.length)return '';
    return groups.map(g=>{
      const fmt=formatFor(r,g)||N55;
      const cfg=state.nassauBets?.[r]?.[g]||state.nassauBets?.[String(r)]?.[String(g)]||{value:0,presses:[]};
      const value=Math.max(0,Number(cfg.value||0));
      const presses=Array.isArray(cfg.presses)?cfg.presses:[];
      const pressAmounts=presses.length?presses.map((p,i)=>`${p.parentPressId?'Press the Press':`Press ${presses.slice(0,i).filter(x=>!x.parentPressId).length+1}`}: ${money(p.amount)}`).join(' · '):'No presses';
      const segs=segmentsFor(r,g).map(seg=>`${seg.label}: ${nassauSegment(r,g,seg).status}`).join(' · ');
      return `<div class="saved-side-entry"><b>${esc(ROUNDS[r-1].name)} · ${g===1?'First':'Second'} Group · ${esc(fmt)}</b><span><strong>Wager:</strong> ${value?`${money(value)} per match`:'Not entered'} · ${esc(pressAmounts)}</span><span>${esc(firstNames(r,g))}</span><span>${esc(segs)}</span></div>`;
    }).join('');
  }

  function savedResults(currentRound){
    let items='';
    for(let r=1;r<=4;r++){
      if(r===currentRound)continue;
      const game=state.sideGames?.[r]||state.sideGames?.[String(r)]||'None';
      if(game===FORTY) items+=fortyArchive(r);
      if(activeNassauGroups(r).length) items+=nassauArchive(r);
    }
    return `<section class="saved-side-results"><div class="eyebrow">SAVED RESULTS</div><h3>Previous Side Games</h3>${items||'<p class="notice">Completed side games from other rounds will remain here for reference.</p>'}</section>`;
  }

  function installSideGameOverride(){
    if(typeof sideGameResults!=='function' || sideGameResults.__nassauGroupBeta)return;
    const prior=sideGameResults;
    const enhanced=function(){
      const r=sideRound(),game=state.sideGames?.[r]||state.sideGames?.[String(r)]||'None',groups=activeNassauGroups(r);
      if(game===FORTY||!groups.length){ return prior(); }
      const roundOpts=ROUNDS.map((x,i)=>`<option value="${i+1}" ${r===i+1?'selected':''}>${x.name}</option>`).join('');
      const formats=[...new Set(groups.map(g=>formatFor(r,g)))];
      const title=formats.length===1?formats[0]:'Nassau Side Games';
      const active=groups.map(g=>nassauPanel(r,g)).join('');
      return layout(`<section class="card"><div class="side-head"><div><div class="eyebrow">ACTIVE SIDE GAME</div><h2>${esc(title)}</h2></div><label>Round<select id="sideRoundSel">${roundOpts}</select></label></div><div class="side-summary"><div><b>Active Groups</b><span>${groups.map(g=>g===1?'First Group':'Second Group').join(' · ')}</span></div><div><b>Rule</b><span>Nassau is optional by foursome. 5-5-5-1-1-1 uses three 5-hole matches plus three separate one-hole matches on 16–18; 6-6-6 uses three 6-hole matches.</span></div></div>${active}${savedResults(r)}</section>`);
    };
    enhanced.__nassauGroupBeta=true;
    sideGameResults=enhanced;
  }

  function appendSavedResults(){
    const app=document.querySelector('#app'); if(!app)return;
    const r=sideRound();
    const game=state.sideGames?.[r]||state.sideGames?.[String(r)]||'None';
    if(game!==FORTY&&activeNassauGroups(r).length)return;
    const h=app.querySelector('h2')?.textContent||'';
    if(!/Side Game|40 Ball/.test(h) || app.querySelector('.saved-side-results'))return;
    const card=app.querySelector('.card');
    if(card) card.insertAdjacentHTML('beforeend',savedResults(r));
  }

  function appendCombinedNassauResults(){
    const app=document.querySelector('#app');if(!app)return;
    const r=sideRound(),groups=activeNassauGroups(r);
    if(!fortyActive(r)||!groups.length||app.querySelector('.combined-nassau-results'))return;
    const h=app.querySelector('h2')?.textContent||'';
    if(!/40 Ball/.test(h))return;
    const card=app.querySelector('.card');
    if(card)card.insertAdjacentHTML('beforeend',`<section class="combined-nassau-results"><div class="eyebrow">RUNNING AT THE SAME TIME</div><h3>Nassau Games</h3>${groups.map(g=>nassauPanel(r,g)).join('')}</section>`);
  }

  function ensureStyle(){
    if(document.getElementById('nassau-group-style'))return;
    const st=document.createElement('style');st.id='nassau-group-style';st.textContent=`
      .nassau-group-note{margin-top:6px;font-size:11px;color:var(--muted);font-weight:700}.nassau-pairing-note{margin-top:8px;padding-top:8px;border-top:1px solid var(--line);font-size:10px;line-height:1.4;color:var(--muted)}.nassau-pairing-note b{display:block;margin-bottom:3px;color:var(--navy);font-size:10px;text-transform:uppercase;letter-spacing:.05em}.nassau-pairing-note span{display:block}
      .saved-side-results{margin-top:18px;padding-top:16px;border-top:2px solid var(--line)}
      .saved-side-results h3{margin:3px 0 10px}
      .saved-side-entry{display:grid;gap:4px;padding:10px 0;border-top:1px solid var(--line)}
      .saved-side-entry:first-of-type{border-top:0}.saved-side-entry span{font-size:12px;color:var(--muted)}
      .side-game-control{display:grid;gap:5px;min-width:0;padding:10px;border:1px solid var(--line);border-radius:10px;background:#fff}
      .side-game-control label{display:grid;gap:5px;font-size:12px;font-weight:800;color:var(--muted)}
      .side-game-control-note{font-size:10px;color:var(--muted)}
      .combined-nassau-results{margin-top:18px;padding-top:16px;border-top:2px solid var(--line)}
      .combined-nassau-results>h3{margin:3px 0 10px}
      @media(max-width:650px){.side-game-picker{display:grid;grid-template-columns:1fr}.side-game-picker>button{width:100%}}
    `;document.head.appendChild(st);
  }

  document.addEventListener('change',e=>{
    const sel=e.target.closest?.('#scoreFortyBall,#scoreNassau');
    if(!sel)return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if(sel.id==='scoreFortyBall')handleFortyChange(sel);
    else handleNassauChange(sel);
  },true);

  ensureStyle();
  installSideGameOverride();
  const priorRender=render;
  render=function(){
    installSideGameOverride();
    priorRender();
    syncScorePicker();
    setTimeout(appendCombinedNassauResults,0);
    setTimeout(appendSavedResults,0);
  };
  setTimeout(()=>{installSideGameOverride();syncScorePicker();appendCombinedNassauResults();appendSavedResults();},0);
})();
