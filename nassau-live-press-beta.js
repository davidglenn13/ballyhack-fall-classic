/* Add manual Nassau press entry directly to the live Score page. */
(() => {
  const hasNassau=(r,g)=>!!(state.nassauGroups?.[r]?.[g]||state.nassauGroups?.[String(r)]?.[String(g)]);
  const cfg=(r,g)=>{
    state.nassauBets??={}; state.nassauBets[r]??={};
    state.nassauBets[r][g]??={value:0,presses:[]};
    state.nassauBets[r][g].presses=Array.isArray(state.nassauBets[r][g].presses)?state.nassauBets[r][g].presses:[];
    return state.nassauBets[r][g];
  };
  const persist=async(r,g)=>{ save(); await apiPost({op:'nassauBetConfig',round:r,group:g,config:cfg(r,g)}); };
  const currentSegmentIndex=h=>NASSAU_SEGMENTS.findIndex(s=>s.holes.includes(h));

  function enhanceScore(){
    const app=document.querySelector('#app');
    if(!app||app.querySelector('.nlp-card'))return;
    const scoreSide=document.querySelector('#scoreSideGame');
    if(!scoreSide)return;
    const r=+(sessionStorage.r||1), g=+(sessionStorage.group||1), h=+(sessionStorage.hole||1);
    if(!hasNassau(r,g))return;
    const si=currentSegmentIndex(h); if(si<0)return;
    const seg=NASSAU_SEGMENTS[si], teams=nassauTeams(roundGroupNames(r,g),seg.pairing), c=cfg(r,g);
    const count=c.presses.filter(p=>+p.segment===si).length;
    const html=`<section class="card nlp-card"><div class="eyebrow">LIVE NASSAU</div><h2>Press Bet</h2><p class="muted">Current match: ${seg.label}. Record a press only when the team elects to press.</p><div class="nlp-grid"><label>Pressing side<select data-nlp-team><option value="a">${teams[0].map(n=>n.split(' ')[0]).join(' / ')}</option><option value="b">${teams[1].map(n=>n.split(' ')[0]).join(' / ')}</option></select></label><label>Starts on<select data-nlp-hole>${seg.holes.filter(x=>x>=h).map(x=>`<option value="${x}">Hole ${x}</option>`).join('')||`<option value="${h}">Hole ${h}</option>`}</select></label><label>Press $<input data-nlp-amount type="number" min="0" step="1" inputmode="decimal" value="${c.value||''}" placeholder="${c.value||5}"></label><button type="button" class="primary" data-nlp-add data-r="${r}" data-g="${g}" data-si="${si}">Add Press</button></div><div class="nlp-foot"><b>${count}</b> press${count===1?'':'es'} recorded in this match · Match value ${c.value?`$${c.value}`:'not entered yet'}</div></section>`;
    const scoreCard=scoreSide.closest('.card')||app.querySelector('.card');
    if(scoreCard) scoreCard.insertAdjacentHTML('afterend',html);
  }

  function style(){
    if(document.querySelector('#nlp-style'))return;
    const s=document.createElement('style'); s.id='nlp-style'; s.textContent=`.nlp-card{border:2px solid rgba(23,54,93,.18)}.nlp-card h2{margin-bottom:4px}.nlp-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr)) auto;gap:8px;align-items:end}.nlp-grid label{display:grid;gap:4px;font-size:10px;font-weight:800;color:var(--muted)}.nlp-grid input,.nlp-grid select{width:100%}.nlp-foot{margin-top:9px;padding-top:8px;border-top:1px solid var(--line);font-size:11px;color:var(--muted)}@media(max-width:650px){.nlp-grid{grid-template-columns:1fr}.nlp-grid button{width:100%}}`; document.head.appendChild(s);
  }

  document.addEventListener('click',e=>{
    const b=e.target.closest?.('[data-nlp-add]'); if(!b)return;
    const card=b.closest('.nlp-card'), r=+b.dataset.r, g=+b.dataset.g, si=+b.dataset.si, c=cfg(r,g);
    const amount=Math.max(0,+card.querySelector('[data-nlp-amount]').value||+c.value||0);
    if(!amount){ alert('Enter the press dollar value first.'); return; }
    c.presses.push({id:`p${Date.now()}${Math.random().toString(36).slice(2,6)}`,segment:si,fromHole:+card.querySelector('[data-nlp-hole]').value,pressedBy:card.querySelector('[data-nlp-team]').value,amount});
    persist(r,g).then(()=>render());
  });

  style();
  const prior=render;
  render=function(){ prior(); setTimeout(enhanceScore,0); };
  setTimeout(enhanceScore,0);
})();
