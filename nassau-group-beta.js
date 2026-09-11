/* Group-specific Nassau selection + saved side-game results beta. */
(() => {
  state.nassauGroups ??= {};

  const NASSAU='Nassau 5-5-5-3';
  const FORTY='40 Ball';

  function roundNo(){ return +(sessionStorage.r||1); }
  function groupNo(){ return +(sessionStorage.group||1); }
  function sideRound(){ return +(sessionStorage.sideRound||sessionStorage.r||1); }
  function nassauMap(r){
    state.nassauGroups ??= {};
    state.nassauGroups[r] ??= {};
    return state.nassauGroups[r];
  }
  function hasNassau(r,g){ return !!(state.nassauGroups?.[r]?.[g] || state.nassauGroups?.[String(r)]?.[String(g)]); }
  function activeNassauGroups(r){ return [1,2].filter(g=>hasNassau(r,g)); }
  function firstNames(r,g){ return roundGroupNames(r,g).map(n=>n.split(' ')[0]).join(' · '); }
  function esc(s){ return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  async function setRoundGame(r,value){
    state.sideGames[r]=value;
    save();
    await apiPost({op:'sideGame',round:r,value});
  }
  async function setNassauGroup(r,g,value){
    const map=nassauMap(r);
    if(value) map[g]=true; else delete map[g];
    save();
    await apiPost({op:'nassauGroup',round:r,group:g,value:!!value});
  }

  function displayGameForScore(r,g){
    const roundGame=state.sideGames?.[r]||'None';
    if(roundGame===FORTY)return FORTY;
    if(hasNassau(r,g))return NASSAU;
    return 'None';
  }

  async function handleScoreGameChange(select){
    const r=roundNo(), g=groupNo(), value=select.value;
    if(value===FORTY){
      await setNassauGroup(r,1,false);
      await setNassauGroup(r,2,false);
      await setRoundGame(r,FORTY);
    }else if(value===NASSAU){
      // Nassau applies only to the foursome currently selected on the Score page.
      await setNassauGroup(r,g,true);
      if((state.sideGames?.[r]||'None')!==NASSAU) await setRoundGame(r,NASSAU);
    }else{
      await setNassauGroup(r,g,false);
      const other=g===1?2:1;
      if(hasNassau(r,other)){
        if((state.sideGames?.[r]||'None')!==NASSAU) await setRoundGame(r,NASSAU);
      }else if((state.sideGames?.[r]||'None')===NASSAU){
        await setRoundGame(r,'None');
      }else if((state.sideGames?.[r]||'None')===FORTY){
        // Leaving 40 Ball ends it for the round because 40 Ball requires both groups.
        await setRoundGame(r,'None');
      }
    }
    render();
  }

  function syncScorePicker(){
    const sel=document.querySelector('#scoreSideGame');
    if(!sel)return;
    const r=roundNo(),g=groupNo();
    sel.value=displayGameForScore(r,g);
    const eyebrow=sel.closest('.side-game-picker')?.querySelector('.eyebrow');
    if(eyebrow) eyebrow.textContent=(state.sideGames?.[r]===FORTY)?'SIDE GAME FOR THIS ROUND':'SIDE GAME FOR THIS GROUP';
    let note=sel.closest('.side-game-picker')?.querySelector('.nassau-group-note');
    if(!note){
      note=document.createElement('div');
      note.className='nassau-group-note';
      sel.insertAdjacentElement('afterend',note);
    }
    if(state.sideGames?.[r]===FORTY){
      note.textContent='40 Ball applies to both groups for the round.';
    }else if(hasNassau(r,g)){
      note.textContent='Nassau is active only for this foursome.';
    }else{
      note.textContent='Nassau can be selected independently by each foursome.';
    }
  }

  function nassauPanel(r,g){
    const names=roundGroupNames(r,g);
    return `<section class="side-result-panel" data-side-group="${g}">
      <h3>${g===1?'First':'Second'} Group</h3>
      <p>${names.map(n=>n.split(' ')[0]).join(' · ')}</p>
      <div class="nassau-grid">
        ${NASSAU_SEGMENTS.map(seg=>{
          const x=nassauSegment(r,g,seg);
          return `<div class="nassau-segment">
            <b>${seg.label}</b>
            <span>${x.teams[0].map(n=>n.split(' ')[0]).join(' + ')} vs ${x.teams[1].map(n=>n.split(' ')[0]).join(' + ')}</span>
            <strong>${x.status}</strong>
            <small>${x.played}/${x.total} holes complete</small>
          </div>`;
        }).join('')}
      </div>
    </section>`;
  }

  function fortyArchive(r){
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
    return `<div class="saved-side-entry"><b>${esc(ROUNDS[r-1].name)} · 40 Ball</b><span>${summary(1)}</span><span>${summary(2)}</span></div>`;
  }

  function nassauArchive(r){
    const groups=activeNassauGroups(r);
    if(!groups.length)return '';
    return groups.map(g=>{
      const segs=NASSAU_SEGMENTS.map(seg=>`${seg.label}: ${nassauSegment(r,g,seg).status}`).join(' · ');
      return `<div class="saved-side-entry"><b>${esc(ROUNDS[r-1].name)} · ${g===1?'First':'Second'} Group Nassau</b><span>${esc(firstNames(r,g))}</span><span>${esc(segs)}</span></div>`;
    }).join('');
  }

  function savedResults(currentRound){
    let items='';
    for(let r=1;r<=4;r++){
      if(r===currentRound)continue;
      const game=state.sideGames?.[r]||state.sideGames?.[String(r)]||'None';
      if(game===FORTY) items+=fortyArchive(r);
      else if(game===NASSAU) items+=nassauArchive(r);
    }
    return `<section class="saved-side-results"><div class="eyebrow">SAVED RESULTS</div><h3>Previous Side Games</h3>${items||'<p class="notice">Completed side games from other rounds will remain here for reference.</p>'}</section>`;
  }

  function installSideGameOverride(){
    if(typeof sideGameResults!=='function' || sideGameResults.__nassauGroupBeta)return;
    const prior=sideGameResults;
    const enhanced=function(){
      const r=sideRound();
      const game=state.sideGames?.[r]||state.sideGames?.[String(r)]||'None';
      if(game!==NASSAU){
        const html=prior();
        // Saved results are inserted after render for non-Nassau pages.
        return html;
      }
      const groups=activeNassauGroups(r);
      const roundOpts=ROUNDS.map((x,i)=>`<option value="${i+1}" ${r===i+1?'selected':''}>${x.name}</option>`).join('');
      const active=groups.length
        ?groups.map(g=>nassauPanel(r,g)).join('')
        :'<p class="notice">No foursome has selected Nassau for this round.</p>';
      return layout(`<section class="card"><div class="side-head"><div><div class="eyebrow">ACTIVE SIDE GAME</div><h2>Nassau 5-5-5-3</h2></div><label>Round<select id="sideRoundSel">${roundOpts}</select></label></div><div class="side-summary"><div><b>Active groups</b><span>${groups.length?groups.map(g=>g===1?'First Group':'Second Group').join(' · '):'None'}</span></div><div><b>Rule</b><span>Nassau is optional by foursome. Only groups that selected Nassau are shown.</span></div></div>${active}${savedResults(r)}</section>`);
    };
    enhanced.__nassauGroupBeta=true;
    sideGameResults=enhanced;
  }

  function appendSavedResults(){
    const app=document.querySelector('#app'); if(!app)return;
    const r=sideRound();
    const game=state.sideGames?.[r]||state.sideGames?.[String(r)]||'None';
    if(game===NASSAU)return; // already included in custom Nassau page.
    const h=app.querySelector('h2')?.textContent||'';
    if(!/Side Game|40 Ball/.test(h) || app.querySelector('.saved-side-results'))return;
    const card=app.querySelector('.card');
    if(card) card.insertAdjacentHTML('beforeend',savedResults(r));
  }

  function ensureStyle(){
    if(document.getElementById('nassau-group-style'))return;
    const st=document.createElement('style');st.id='nassau-group-style';st.textContent=`
      .nassau-group-note{margin-top:6px;font-size:11px;color:var(--muted);font-weight:700}
      .saved-side-results{margin-top:18px;padding-top:16px;border-top:2px solid var(--line)}
      .saved-side-results h3{margin:3px 0 10px}
      .saved-side-entry{display:grid;gap:4px;padding:10px 0;border-top:1px solid var(--line)}
      .saved-side-entry:first-of-type{border-top:0}.saved-side-entry span{font-size:12px;color:var(--muted)}
    `;document.head.appendChild(st);
  }

  // Intercept side-game changes before app.js's round-wide listener handles them.
  document.addEventListener('change',e=>{
    const sel=e.target.closest?.('#scoreSideGame');
    if(!sel)return;
    e.preventDefault();
    e.stopImmediatePropagation();
    handleScoreGameChange(sel);
  },true);

  ensureStyle();
  installSideGameOverride();
  const priorRender=render;
  render=function(){
    installSideGameOverride();
    priorRender();
    syncScorePicker();
    setTimeout(appendSavedResults,0);
  };
  setTimeout(()=>{installSideGameOverride();syncScorePicker();appendSavedResults();},0);
})();
