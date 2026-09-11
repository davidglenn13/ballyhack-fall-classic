/* Group-specific Nassau selection + saved side-game results beta. Supports 5-5-5-3 and 6-6-6. */
(() => {
  state.nassauGroups ??= {};

  const N55='Nassau 5-5-5-3';
  const N66='Nassau 6-6-6';
  const FORTY='40 Ball';
  // 5-5-5-3 is scored as 5-5-5-1-1-1: holes 16, 17 and 18 are three
  // independent one-hole matches using the three partner rotations.
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
    if(v)return N55;
    return null;
  }
  function segmentsFor(r,g){ return formatFor(r,g)===N66?SEG66:SEG55; }
  function hasNassau(r,g){ return !!formatFor(r,g); }
  function activeNassauGroups(r){ return [1,2].filter(g=>hasNassau(r,g)); }
  function firstNames(r,g){ return roundGroupNames(r,g).map(n=>n.split(' ')[0]).join(' · '); }
  function esc(s){ return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  window.nassauFormatFor=formatFor;
  window.nassauSegmentsFor=segmentsFor;

  async function setRoundGame(r,value){
    state.sideGames[r]=value;
    save();
    await apiPost({op:'sideGame',round:r,value});
  }
  async function setNassauGroup(r,g,value){
    const map=nassauMap(r);
    if(value) map[g]=value; else delete map[g];
    save();
    await apiPost({op:'nassauGroup',round:r,group:g,value:value||false});
  }

  function displayGameForScore(r,g){
    const roundGame=state.sideGames?.[r]||'None';
    if(roundGame===FORTY)return FORTY;
    return formatFor(r,g)||'None';
  }

  async function handleScoreGameChange(select){
    const r=roundNo(), g=groupNo(), value=select.value;
    if(value===FORTY){
      await setNassauGroup(r,1,false);
      await setNassauGroup(r,2,false);
      await setRoundGame(r,FORTY);
    }else if(value===N55||value===N66){
      await setNassauGroup(r,g,value);
      await setRoundGame(r,value);
    }else{
      await setNassauGroup(r,g,false);
      const other=g===1?2:1, otherFormat=formatFor(r,other);
      if(otherFormat){
        await setRoundGame(r,otherFormat);
      }else if((state.sideGames?.[r]||'None')===FORTY){
        await setRoundGame(r,'None');
      }else{
        await setRoundGame(r,'None');
      }
    }
    render();
  }

  function ensurePickerOptions(sel){
    if(!sel.querySelector(`option[value="${N66}"]`)){
      const o=document.createElement('option');o.value=N66;o.textContent=N66;sel.appendChild(o);
    }
    [...sel.options].forEach(o=>{ if(!o.value)o.value=o.textContent.trim(); });
  }

  function syncScorePicker(){
    const sel=document.querySelector('#scoreSideGame');
    if(!sel)return;
    ensurePickerOptions(sel);
    const r=roundNo(),g=groupNo(),fmt=formatFor(r,g);
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
    }else if(fmt){
      note.textContent=fmt===N55
        ?'Nassau 5-5-5-3 is active for this foursome. Holes 16, 17 and 18 are separate one-hole matches.'
        :`${fmt} is active only for this foursome.`;
    }else{
      note.textContent='Either Nassau format can be selected independently by each foursome.';
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
      const fmt=formatFor(r,g)||N55;
      const segs=segmentsFor(r,g).map(seg=>`${seg.label}: ${nassauSegment(r,g,seg).status}`).join(' · ');
      return `<div class="saved-side-entry"><b>${esc(ROUNDS[r-1].name)} · ${g===1?'First':'Second'} Group · ${esc(fmt)}</b><span>${esc(firstNames(r,g))}</span><span>${esc(segs)}</span></div>`;
    }).join('');
  }

  function savedResults(currentRound){
    let items='';
    for(let r=1;r<=4;r++){
      if(r===currentRound)continue;
      const game=state.sideGames?.[r]||state.sideGames?.[String(r)]||'None';
      if(game===FORTY) items+=fortyArchive(r);
      else if(activeNassauGroups(r).length) items+=nassauArchive(r);
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
      return layout(`<section class="card"><div class="side-head"><div><div class="eyebrow">ACTIVE SIDE GAME</div><h2>${esc(title)}</h2></div><label>Round<select id="sideRoundSel">${roundOpts}</select></label></div><div class="side-summary"><div><b>Active groups</b><span>${groups.map(g=>g===1?'First Group':'Second Group').join(' · ')}</span></div><div><b>Rule</b><span>Nassau is optional by foursome. 5-5-5-3 uses three 5-hole matches plus three separate one-hole matches on 16–18; 6-6-6 uses three 6-hole matches.</span></div></div>${active}${savedResults(r)}</section>`);
    };
    enhanced.__nassauGroupBeta=true;
    sideGameResults=enhanced;
  }

  function appendSavedResults(){
    const app=document.querySelector('#app'); if(!app)return;
    const r=sideRound();
    if(activeNassauGroups(r).length)return;
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
