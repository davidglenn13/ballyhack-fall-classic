/* Dedicated gross-score page. Kept separate from Live Scoring. */
(() => {
  const TAB='Gross Scores';

  function gross(r,n,h){ return +(state.scores?.[r]?.[n]?.[h]||0); }
  function sum(vals){ return vals.reduce((a,b)=>a+(+b||0),0); }

  function scorecard(r){
    const holes=[...Array(18)].map((_,i)=>i+1);
    const rows=PLAYERS.map(p=>{
      const vals=holes.map(h=>gross(r,p.name,h));
      const out=sum(vals.slice(0,9));
      const inn=sum(vals.slice(9));
      const total=out+inn;
      const entered=vals.filter(Boolean).length;
      return `
        <tr>
          <th class="gross-player">
            <div class="board-player">${avatar(p.name)}<span>${p.name}</span></div>
          </th>
          ${vals.slice(0,9).map(v=>`<td>${v||'—'}</td>`).join('')}
          <td class="gross-subtotal">${out||'—'}</td>
          ${vals.slice(9).map(v=>`<td>${v||'—'}</td>`).join('')}
          <td class="gross-subtotal">${inn||'—'}</td>
          <td class="gross-total">${entered===18?total:(total||'—')}</td>
        </tr>`;
    }).join('');

    return `
      <div class="gross-scroll">
        <table class="gross-table">
          <thead>
            <tr>
              <th>Golfer</th>
              ${holes.slice(0,9).map(h=>`<th>${h}</th>`).join('')}
              <th>OUT</th>
              ${holes.slice(9).map(h=>`<th>${h}</th>`).join('')}
              <th>IN</th>
              <th>TOTAL</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  function grossPage(){
    const r=+(sessionStorage.grossRound||sessionStorage.r||1);
    const opts=ROUNDS.map((x,i)=>`<option value="${i+1}" ${r===i+1?'selected':''}>${x.name}</option>`).join('');
    return layout(`
      <section class="card">
        <div class="side-head gross-head">
          <div>
            <div class="eyebrow">OFFICIAL GROSS SCORES</div>
            <h2>Gross Scores</h2>
            <p class="muted">See exactly what everyone shot, hole by hole.</p>
          </div>
          <label>Round<select id="grossRoundSel">${opts}</select></label>
        </div>
        ${scorecard(r)}
      </section>
    `);
  }

  function ensureNav(){
    const nav=document.querySelector('#nav');
    if(!nav||nav.querySelector(`button[data-tab="${TAB}"]`))return;
    const b=document.createElement('button');
    b.dataset.tab=TAB;
    b.textContent=TAB;
    nav.appendChild(b);
  }

  const priorRender=render;
  render=function(){
    ensureNav();
    if(tab!==TAB){ priorRender(); ensureNav(); return; }
    document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('active',b.dataset.tab===TAB));
    document.querySelector('#app').innerHTML=grossPage();
    document.querySelector('#grossRoundSel')?.addEventListener('change',e=>{
      sessionStorage.grossRound=e.target.value;
      render();
    });
  };

  const s=document.createElement('style');
  s.textContent=`
    .gross-head{margin-bottom:14px}
    .gross-scroll{overflow-x:auto;-webkit-overflow-scrolling:touch;border:1px solid var(--line);border-radius:12px}
    .gross-table{border-collapse:collapse;min-width:1160px;width:100%;font-size:12px;background:#fff}
    .gross-table th,.gross-table td{border-right:1px solid var(--line);border-bottom:1px solid var(--line);padding:8px 7px;text-align:center;white-space:nowrap}
    .gross-table thead th{background:#f4f7fa;color:var(--navy);font-weight:900;position:sticky;top:0;z-index:2}
    .gross-table .gross-player{position:sticky;left:0;background:#fff;z-index:1;text-align:left;min-width:170px}
    .gross-table thead th:first-child{left:0;z-index:3}
    .gross-table .board-player{gap:8px}.gross-table .player-avatar{width:34px;height:34px;min-width:34px}
    .gross-subtotal{font-weight:900;background:#f8fafc}.gross-total{font-weight:900;background:rgba(23,54,93,.09);font-size:14px}
    @media(max-width:760px){.gross-head{align-items:stretch;flex-direction:column}.gross-head select{width:100%}}
  `;
  document.head.appendChild(s);

  ensureNav();
})();
