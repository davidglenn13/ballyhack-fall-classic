/* Dedicated gross-score page: all 8 golfers, round totals, tap for 18-hole detail. */
(() => {
  const TAB='Gross Scores';

  function gross(r,n,h){ return +(state.scores?.[r]?.[n]?.[h]||0); }
  function valsFor(r,n){ return [...Array(18)].map((_,i)=>gross(r,n,i+1)); }
  function sum(vals){ return vals.reduce((a,b)=>a+(+b||0),0); }
  function roundGross(r,n){
    const vals=valsFor(r,n);
    const entered=vals.filter(Boolean).length;
    return {vals,entered,total:sum(vals),out:sum(vals.slice(0,9)),inn:sum(vals.slice(9))};
  }

  function roundCell(r,n){
    const x=roundGross(r,n);
    if(!x.entered)return '<span class="gross-empty">—</span>';
    const suffix=x.entered===18?'':'*';
    return `<button type="button" class="gross-round-score" data-gross-player="${n}" data-gross-round="${r}" aria-label="View ${n} Round ${r} scorecard">${x.total}${suffix}</button>`;
  }

  function summaryTable(){
    return `
      <div class="gross-summary-wrap">
        <table class="gross-summary-table">
          <thead><tr><th>Golfer</th><th>R1</th><th>R2</th><th>R3</th><th>R4</th></tr></thead>
          <tbody>
            ${PLAYERS.map(p=>`
              <tr>
                <td><div class="gross-summary-player">${avatar(p.name)}<span>${p.name}</span></div></td>
                ${[1,2,3,4].map(r=>`<td>${roundCell(r,p.name)}</td>`).join('')}
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <p class="gross-footnote">Tap any round score to see the full 18-hole gross scorecard. * indicates a round still in progress.</p>`;
  }

  function detailCard(n,r){
    const x=roundGross(r,n);
    const holes=[...Array(18)].map((_,i)=>i+1);
    return `
      <div class="gross-detail-backdrop" data-gross-backdrop>
        <section class="gross-detail-card" role="dialog" aria-modal="true" aria-label="${n} Round ${r} gross scorecard">
          <div class="gross-detail-head">
            <div>
              <div class="eyebrow">ROUND ${r} · GROSS SCORECARD</div>
              <div class="gross-detail-player">${avatar(n)}<div><h3>${n}</h3><div class="gross-detail-total">${x.entered?`${x.total}${x.entered===18?'':'*'} gross`:'No scores entered'}</div></div></div>
            </div>
            <button type="button" class="gross-close" data-close-gross-detail aria-label="Close scorecard">×</button>
          </div>
          <div class="gross-detail-scroll">
            <table class="gross-detail-table">
              <thead><tr><th>Hole</th>${holes.slice(0,9).map(h=>`<th>${h}</th>`).join('')}<th>OUT</th>${holes.slice(9).map(h=>`<th>${h}</th>`).join('')}<th>IN</th><th>TOTAL</th></tr></thead>
              <tbody><tr><th>Gross</th>${x.vals.slice(0,9).map(v=>`<td>${v||'—'}</td>`).join('')}<td class="gross-detail-sub">${x.out||'—'}</td>${x.vals.slice(9).map(v=>`<td>${v||'—'}</td>`).join('')}<td class="gross-detail-sub">${x.inn||'—'}</td><td class="gross-detail-grand">${x.entered?x.total:'—'}</td></tr></tbody>
            </table>
          </div>
          <div class="gross-nine-summary"><span>Front 9 <b>${x.out||'—'}</b></span><span>Back 9 <b>${x.inn||'—'}</b></span><span>Total <b>${x.entered?x.total:'—'}</b></span></div>
        </section>
      </div>`;
  }

  function grossPage(){
    return layout(`
      <section class="card gross-page-card">
        <div class="eyebrow">OFFICIAL GROSS SCORES</div>
        <h2>Gross Scores</h2>
        <p class="muted">All 8 golfers · gross total by round.</p>
        ${summaryTable()}
        <div id="grossDetailMount"></div>
      </section>
    `);
  }

  function ensureNav(){
    const nav=document.querySelector('#nav');
    if(!nav)return;
    let b=nav.querySelector(`button[data-tab="${TAB}"]`);
    if(!b){
      b=document.createElement('button');
      b.dataset.tab=TAB;
      b.textContent=TAB;
      nav.appendChild(b);
    }else{
      nav.appendChild(b); // keep Gross Scores as far-right tab
    }
  }

  function closeDetail(){
    const mount=document.querySelector('#grossDetailMount');
    if(mount)mount.innerHTML='';
  }

  function openDetail(n,r){
    const mount=document.querySelector('#grossDetailMount');
    if(!mount)return;
    mount.innerHTML=detailCard(n,r);

    mount.querySelector('[data-close-gross-detail]')?.addEventListener('click',e=>{
      e.preventDefault();
      e.stopPropagation();
      closeDetail();
    });

    mount.querySelector('[data-gross-backdrop]')?.addEventListener('click',e=>{
      if(e.target===e.currentTarget)closeDetail();
    });

    const esc=e=>{
      if(e.key==='Escape'){
        closeDetail();
        document.removeEventListener('keydown',esc);
      }
    };
    document.addEventListener('keydown',esc);
  }

  function bindGross(){
    document.querySelectorAll('[data-gross-player][data-gross-round]').forEach(b=>{
      b.onclick=()=>openDetail(b.dataset.grossPlayer,+b.dataset.grossRound);
    });
  }

  const priorRender=render;
  render=function(){
    ensureNav();
    if(tab!==TAB){ priorRender(); ensureNav(); return; }
    document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('active',b.dataset.tab===TAB));
    document.querySelector('#app').innerHTML=grossPage();
    bindGross();
  };

  const s=document.createElement('style');
  s.textContent=`
    .gross-page-card{max-width:900px;margin-left:auto;margin-right:auto}
    .gross-summary-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch;border:1px solid var(--line);border-radius:14px;margin-top:14px}
    .gross-summary-table{width:100%;border-collapse:collapse;min-width:590px;background:#fff}
    .gross-summary-table th,.gross-summary-table td{padding:11px 10px;border-bottom:1px solid var(--line);text-align:center}
    .gross-summary-table thead th{background:#f4f7fa;color:var(--navy);font-weight:900;font-size:12px}
    .gross-summary-table th:first-child,.gross-summary-table td:first-child{text-align:left}
    .gross-summary-table tbody tr:last-child td{border-bottom:0}
    .gross-summary-player{display:flex;align-items:center;gap:10px;font-weight:800;white-space:nowrap}
    .gross-summary-player .player-avatar{width:40px;height:40px;min-width:40px}
    .gross-round-score{min-width:56px;border:0;border-radius:10px;padding:10px 8px;background:rgba(23,54,93,.09);color:var(--navy);font-size:18px;font-weight:900;cursor:pointer}
    .gross-round-score:active{transform:scale(.97)}
    .gross-empty{color:var(--muted)}
    .gross-footnote{font-size:12px;color:var(--muted);margin:10px 2px 0}
    .gross-detail-backdrop{position:fixed;inset:0;background:rgba(9,20,38,.52);z-index:9999;display:flex;align-items:center;justify-content:center;padding:18px}
    .gross-detail-card{width:min(980px,100%);max-height:88vh;overflow:auto;background:#fff;border-radius:18px;padding:18px;box-shadow:0 20px 70px rgba(0,0,0,.28)}
    .gross-detail-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}
    .gross-detail-player{display:flex;align-items:center;gap:12px;margin-top:7px}.gross-detail-player .player-avatar{width:54px;height:54px;min-width:54px}.gross-detail-player h3{margin:0}.gross-detail-total{font-weight:900;color:var(--navy);margin-top:2px}
    .gross-close{border:0;background:#eef2f6;color:var(--navy);width:44px;height:44px;min-width:44px;border-radius:50%;font-size:28px;line-height:1;cursor:pointer;touch-action:manipulation;position:relative;z-index:2}
    .gross-detail-scroll{overflow-x:auto;-webkit-overflow-scrolling:touch;margin-top:16px;border:1px solid var(--line);border-radius:12px}
    .gross-detail-table{border-collapse:collapse;min-width:980px;width:100%;font-size:12px}.gross-detail-table th,.gross-detail-table td{padding:9px 7px;text-align:center;border-right:1px solid var(--line);white-space:nowrap}.gross-detail-table thead th{background:#f4f7fa}.gross-detail-table tbody th{text-align:left;background:#fff}.gross-detail-sub{font-weight:900;background:#f8fafc}.gross-detail-grand{font-weight:900;background:rgba(23,54,93,.10);font-size:14px}
    .gross-nine-summary{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:12px}.gross-nine-summary span{background:#f8fafc;border:1px solid var(--line);border-radius:10px;padding:10px;text-align:center;font-size:12px}.gross-nine-summary b{display:block;font-size:19px;color:var(--navy);margin-top:2px}
    @media(max-width:760px){.gross-page-card{padding-left:12px;padding-right:12px}.gross-summary-table th,.gross-summary-table td{padding:9px 7px}.gross-summary-player .player-avatar{width:34px;height:34px;min-width:34px}.gross-summary-player span{font-size:12px}.gross-round-score{min-width:48px;font-size:16px;padding:9px 6px}.gross-detail-backdrop{padding:8px}.gross-detail-card{padding:14px;max-height:92vh}.gross-nine-summary{grid-template-columns:1fr 1fr 1fr}}
  `;
  document.head.appendChild(s);

  ensureNav();
})();
