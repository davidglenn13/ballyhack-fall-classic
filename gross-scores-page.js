/* Dedicated gross-score page: all 8 golfers, round totals, tap for 18-hole detail. */
(() => {
  const TAB='Gross Scores';

  function gross(r,n,h){ return +(state.scores?.[r]?.[n]?.[h]||0); }
  function canViewGross(){ return true; }
  function valsFor(r,n){ return [...Array(18)].map((_,i)=>gross(r,n,i+1)); }
  function sum(vals){ return vals.reduce((a,b)=>a+(+b||0),0); }
  function roundGross(r,n){
    const vals=valsFor(r,n);
    const entered=vals.filter(Boolean).length;
    return {vals,entered,total:sum(vals),out:sum(vals.slice(0,9)),inn:sum(vals.slice(9))};
  }

  function scoreMark(h,v){
    if(!v)return '<span class="gross-score-mark gross-score-empty">—</span>';
    const diff=Number(v)-PAR[h-1];
    let cls='par',label='Par';
    if(diff<=-2){cls='eagle';label='Eagle or better';}
    else if(diff===-1){cls='birdie';label='Birdie';}
    else if(diff===1){cls='bogey';label='Bogey';}
    else if(diff>=2){cls='double-bogey';label='Double bogey or worse';}
    return `<span class="gross-score-mark gross-score-${cls}" title="${label}" aria-label="${v}, ${label}">${v}</span>`;
  }

  function roundCell(r,n){
    if(!canViewGross(r,n))return '<span class="gross-private">Private</span>';
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
      <p class="gross-footnote">Tap any round score to see the full 18-hole gross scorecard. * Indicates a round still in progress.</p>`;
  }

  const ANALYTICS_ROUNDS=[1,2,4];
  const ANALYTICS_CATS=[
    {key:'eagle',label:'Eagle+',mark:'−2',cls:'eagle'},
    {key:'birdie',label:'Birdie',mark:'−1',cls:'birdie'},
    {key:'par',label:'Par',mark:'E',cls:'par'},
    {key:'bogey',label:'Bogey',mark:'+1',cls:'bogey'},
    {key:'double',label:'Double+',mark:'+2',cls:'double-bogey'}
  ];

  function analyticsCounts(n,r){
    if(!canViewGross(r,n))return null;
    const counts={eagle:0,birdie:0,par:0,bogey:0,double:0,holes:0};
    valsFor(r,n).forEach((v,i)=>{
      if(!v)return;
      counts.holes++;
      const diff=Number(v)-PAR[i];
      if(diff<=-2)counts.eagle++;
      else if(diff===-1)counts.birdie++;
      else if(diff===0)counts.par++;
      else if(diff===1)counts.bogey++;
      else counts.double++;
    });
    return counts;
  }

  function analyticsTotal(rounds){
    return rounds.reduce((total,x)=>{
      if(!x)return total;
      ANALYTICS_CATS.forEach(c=>total[c.key]+=x[c.key]);
      total.holes+=x.holes;
      return total;
    },{eagle:0,birdie:0,par:0,bogey:0,double:0,holes:0});
  }

  function analyticsValue(x,key){
    if(x===null)return '<span class="analytics-private">Private</span>';
    if(!x.holes)return '<span class="analytics-empty">—</span>';
    return x[key];
  }

  function overallRoundAnalytics(r){
    const visible=PLAYERS.map(p=>analyticsCounts(p.name,r));
    const total=analyticsTotal(visible);
    total.hidden=visible.some(x=>x===null);
    return total;
  }

  function overallAnalyticsCard(){
    const rounds=ANALYTICS_ROUNDS.map(r=>overallRoundAnalytics(r));
    const total=analyticsTotal(rounds);
    const hidden=rounds.some(x=>x.hidden);
    const totalLabel=hidden?`${total.holes} visible holes`:`${total.holes} field holes`;
    return `
      <details class="analytics-player-card analytics-overall-card" open>
        <summary class="analytics-player-summary">
          <div class="analytics-player-topline">
            <div class="analytics-player-id"><div><strong>Overall</strong><small>${totalLabel} · tap for rounds</small></div></div>
            <div class="analytics-chevron" aria-hidden="true">⌄</div>
          </div>
          <div class="analytics-total-strip" aria-label="Overall field gross scoring totals">
            ${ANALYTICS_CATS.map(c=>`<span class="analytics-total-item"><i class="gross-score-mark gross-score-${c.cls}">${c.mark}</i><b>${total[c.key]}</b><small>${c.label}</small></span>`).join('')}
          </div>
        </summary>
        <div class="analytics-round-breakdown">
          ${ANALYTICS_ROUNDS.map((r,i)=>`
            <div class="analytics-round-row">
              <strong>R${r}</strong>
              ${ANALYTICS_CATS.map(c=>`<span>${rounds[i].holes?rounds[i][c.key]:'—'}</span>`).join('')}
            </div>`).join('')}
        </div>
      </details>`;
  }

  function playerAnalyticsCard(n){
    const rounds=ANALYTICS_ROUNDS.map(r=>analyticsCounts(n,r));
    const total=analyticsTotal(rounds);
    const hidden=rounds.some(x=>x===null);
    const totalLabel=hidden?'Visible holes':`${total.holes} holes`;
    return `
      <details class="analytics-player-card">
        <summary class="analytics-player-summary">
          <div class="analytics-player-topline">
            <div class="analytics-player-id">${avatar(n)}<div><strong>${n}</strong><small>${totalLabel} · tap for rounds</small></div></div>
            <div class="analytics-chevron" aria-hidden="true">⌄</div>
          </div>
          <div class="analytics-total-strip" aria-label="${n} tournament gross scoring totals">
            ${ANALYTICS_CATS.map(c=>`<span class="analytics-total-item"><i class="gross-score-mark gross-score-${c.cls}">${c.mark}</i><b>${total[c.key]}</b><small>${c.label}</small></span>`).join('')}
          </div>
        </summary>
        <div class="analytics-round-breakdown">
          ${ANALYTICS_ROUNDS.map((r,i)=>`
            <div class="analytics-round-row">
              <strong>R${r}</strong>
              ${ANALYTICS_CATS.map(c=>`<span>${analyticsValue(rounds[i],c.key)}</span>`).join('')}
            </div>`).join('')}
        </div>
      </details>`;
  }

  function playerAnalyticsSection(){
    return `
      <section class="player-analytics-section">
        <div class="player-analytics-head">
          <div><h3>Player Analytics</h3><p>Gross scoring results · played rounds R1, R2 and R4</p></div>
        </div>
        <div class="analytics-player-list">
          ${overallAnalyticsCard()}
          <div class="analytics-individual-label">Players</div>
          ${PLAYERS.map(p=>playerAnalyticsCard(p.name)).join('')}
        </div>
      </section>`;
  }

  function detailCard(n,r){
    const x=roundGross(r,n);
    const holes=[...Array(18)].map((_,i)=>i+1);
    const total=x.entered?`${x.total}${x.entered===18?'':'*'}`:'—';
    return `
      <div class="gross-detail-backdrop" data-gross-backdrop>
        <section class="gross-detail-card" role="dialog" aria-modal="true" aria-label="${n} Round ${r} gross scorecard">
          <div class="gross-detail-head">
            <div class="eyebrow">ROUND ${r} · GROSS SCORECARD</div>
            <button type="button" class="gross-close" data-close-gross-detail aria-label="Close scorecard">×</button>
          </div>
          <div class="gross-detail-player-row">
            <div class="gross-detail-player">${avatar(n)}<h3>${n}</h3></div>
            <div class="gross-total-pill"><span>Gross</span><b>${total}</b></div>
          </div>
          <div class="gross-detail-scroll">
            <table class="gross-detail-table">
              <thead><tr><th>Hole</th>${holes.slice(0,9).map(h=>`<th>${h}</th>`).join('')}<th>OUT</th>${holes.slice(9).map(h=>`<th>${h}</th>`).join('')}<th>IN</th><th>TOTAL</th></tr></thead>
              <tbody><tr><th>Gross</th>${x.vals.slice(0,9).map((v,i)=>`<td>${scoreMark(i+1,v)}</td>`).join('')}<td class="gross-detail-sub">${x.out||'—'}</td>${x.vals.slice(9).map((v,i)=>`<td>${scoreMark(i+10,v)}</td>`).join('')}<td class="gross-detail-sub">${x.inn||'—'}</td><td class="gross-detail-grand">${x.entered?x.total:'—'}</td></tr></tbody>
            </table>
          </div>
          <div class="gross-nine-summary"><span><small>Front 9</small><b>${x.out||'—'}</b></span><span><small>Back 9</small><b>${x.inn||'—'}</b></span><span><small>Total</small><b>${x.entered?x.total:'—'}</b></span></div>
          <div class="gross-score-legend" aria-label="Gross scorecard notation">
            <span><i class="gross-score-mark gross-score-eagle">−2</i><em>Eagle+</em></span>
            <span><i class="gross-score-mark gross-score-birdie">−1</i><em>Birdie</em></span>
            <span><i class="gross-score-mark gross-score-par">E</i><em>Par</em></span>
            <span><i class="gross-score-mark gross-score-bogey">+1</i><em>Bogey</em></span>
            <span><i class="gross-score-mark gross-score-double-bogey">+2</i><em>Double+</em></span>
          </div>
        </section>
      </div>`;
  }

  function grossPage(){
    return layout(`
      <section class="card gross-page-card">
        <h2>Gross Scores</h2>
        ${summaryTable()}
        ${playerAnalyticsSection()}
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
    }
    const side=nav.querySelector('button[data-tab="Side Games"]');
    if(side)nav.insertBefore(b,side);
    else nav.appendChild(b);
  }

  function closeDetail(){
    const mount=document.querySelector('#grossDetailMount');
    if(mount)mount.innerHTML='';
  }

  function openDetail(n,r){
    const mount=document.querySelector('#grossDetailMount');
    if(!mount||!canViewGross(r,n))return;
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
    .gross-private{display:inline-block;padding:6px 8px;border-radius:8px;background:#eef2f6;color:var(--muted);font-size:11px;font-weight:800}

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
    .player-analytics-section{margin-top:22px;padding-top:18px;border-top:1px solid var(--line)}
    .player-analytics-head{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;margin-bottom:10px}.player-analytics-head h3{margin:0;color:var(--navy);font-size:19px}.player-analytics-head p{margin:3px 0 0;color:var(--muted);font-size:11px}
    .analytics-player-list{display:grid;gap:8px}
    .analytics-overall-card{border-color:rgba(23,54,93,.25);background:#fbfcfd}.analytics-individual-label{margin:3px 2px -1px;color:var(--muted);font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.10em}
    .analytics-player-card{border:1px solid #dfe5eb;border-radius:12px;background:#fff;overflow:hidden}
    .analytics-player-summary{list-style:none;display:block;padding:9px 10px 8px;cursor:pointer;touch-action:manipulation}.analytics-player-summary::-webkit-details-marker{display:none}
    .analytics-player-topline{display:flex;align-items:center;justify-content:space-between;gap:10px}
    .analytics-player-id{display:flex;align-items:center;gap:9px;min-width:0}.analytics-player-id .player-avatar{width:34px;height:34px;min-width:34px}.analytics-player-id div{min-width:0}.analytics-player-id strong{display:block;color:var(--navy);font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.analytics-player-id small{display:block;margin-top:1px;color:var(--muted);font-size:9px}
    .analytics-chevron{color:var(--muted);font-size:19px;line-height:1;transition:transform .15s ease}.analytics-player-card[open] .analytics-chevron{transform:rotate(180deg)}
    .analytics-total-strip{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:3px;margin-top:7px;padding-top:7px;border-top:1px solid #edf0f3}.analytics-total-item{display:grid;grid-template-columns:auto auto;grid-template-rows:auto auto;align-items:center;justify-content:center;column-gap:3px;min-width:0}.analytics-total-item .gross-score-mark{grid-row:1/3;width:18px;height:18px;font-size:7px}.analytics-total-item b{font-size:14px;line-height:1;color:var(--navy)}.analytics-total-item small{font-size:7px;line-height:1;color:var(--muted);white-space:nowrap}
    .analytics-round-breakdown{border-top:1px solid #e8edf1;background:#f8fafc;padding:7px 8px 8px}
    .analytics-round-row{display:grid;grid-template-columns:42px repeat(5,minmax(0,1fr));align-items:center;text-align:center;min-height:31px;border-top:1px solid #e8edf1;color:var(--navy);font-size:11px}.analytics-round-row strong{text-align:left;font-size:10px}.analytics-round-row span{font-weight:800}
    .analytics-private{font-size:7px;color:var(--muted)}.analytics-empty{color:var(--muted)}
    .gross-detail-backdrop{position:fixed;inset:0;background:rgba(9,20,38,.48);z-index:9999;display:flex;align-items:center;justify-content:center;padding:14px}
    .gross-detail-card{width:min(920px,100%);max-height:90vh;overflow:auto;overscroll-behavior:contain;background:#fff;border-radius:16px;padding:16px;box-shadow:0 16px 48px rgba(0,0,0,.24)}
    .gross-detail-head{display:flex;justify-content:space-between;gap:12px;align-items:center}.gross-detail-head .eyebrow{font-size:11px;letter-spacing:.13em}
    .gross-detail-player-row{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:8px}
    .gross-detail-player{display:flex;align-items:center;gap:10px;min-width:0}.gross-detail-player .player-avatar{width:46px;height:46px;min-width:46px}.gross-detail-player h3{margin:0;color:var(--navy);font-size:20px;line-height:1.1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .gross-total-pill{display:flex;align-items:baseline;gap:6px;flex:0 0 auto;background:rgba(23,54,93,.07);border-radius:10px;padding:7px 10px;color:var(--navy)}.gross-total-pill span{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}.gross-total-pill b{font-size:22px;line-height:1}
    .gross-close{border:0;background:#f1f4f7;color:var(--navy);width:36px;height:36px;min-width:36px;border-radius:50%;font-size:24px;line-height:1;cursor:pointer;touch-action:manipulation;position:relative;z-index:2}
    .gross-detail-scroll{overflow-x:auto;-webkit-overflow-scrolling:touch;margin-top:14px;border:1px solid #dfe5eb;border-radius:10px;background:#fff}
    .gross-detail-table{border-collapse:collapse;min-width:900px;width:100%;font-size:12px}.gross-detail-table th,.gross-detail-table td{padding:8px 6px;text-align:center;border-right:1px solid #e6ebef;white-space:nowrap}.gross-detail-table th:last-child,.gross-detail-table td:last-child{border-right:0}.gross-detail-table thead th{background:#f7f9fb;color:var(--navy);font-weight:900}.gross-detail-table tbody th{text-align:left;background:#fff;color:var(--navy);font-weight:900}.gross-detail-sub{font-weight:900;background:#fafbfd}.gross-detail-grand{font-weight:900;background:rgba(23,54,93,.07);font-size:14px}
    .gross-score-mark{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;box-sizing:border-box;margin:auto;font-weight:900;line-height:1;color:var(--navy);font-style:normal}.gross-score-birdie{border:1.5px solid #347858;border-radius:50%;color:#286747}.gross-score-eagle{border:3px double #347858;border-radius:50%;color:#286747}.gross-score-bogey{border:1.5px solid #a43a31;border-radius:2px;color:#923027}.gross-score-double-bogey{border:3px double #a43a31;border-radius:2px;color:#923027}.gross-score-empty{color:var(--muted)}
    .gross-nine-summary{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-top:10px}.gross-nine-summary span{background:#f7f9fb;border-radius:9px;padding:7px 8px;text-align:center}.gross-nine-summary small{display:block;font-size:10px;font-weight:700;color:var(--muted);line-height:1.1}.gross-nine-summary b{display:block;font-size:18px;line-height:1.05;color:var(--navy);margin-top:2px}
    .gross-score-legend{display:flex;align-items:center;justify-content:space-between;gap:6px;margin-top:8px;padding:7px 2px 0;border-top:1px solid #edf0f3}.gross-score-legend>span{display:inline-flex;align-items:center;gap:4px;min-width:0;font-size:10px;font-weight:700;color:var(--muted)}.gross-score-legend em{font-style:normal;white-space:nowrap}.gross-score-legend .gross-score-mark{width:20px;height:20px;font-size:8px}
    @media(max-width:760px){.gross-page-card{padding-left:12px;padding-right:12px}.gross-summary-table{width:max-content;min-width:100%}.gross-summary-table th,.gross-summary-table td{padding:9px 5px}.gross-summary-table th:first-child,.gross-summary-table td:first-child{padding-right:3px}.gross-summary-player{gap:6px}.gross-summary-player .player-avatar{width:34px;height:34px;min-width:34px}.gross-summary-player span{font-size:12px}.gross-round-score{min-width:48px;font-size:16px;padding:9px 6px}.gross-detail-backdrop{padding:10px}.gross-detail-card{padding:13px;max-height:92vh}.gross-detail-head .eyebrow{font-size:10px}.gross-detail-player .player-avatar{width:44px;height:44px;min-width:44px}.gross-detail-player h3{font-size:18px}.gross-total-pill{padding:6px 9px}.gross-total-pill b{font-size:20px}.gross-score-legend{gap:3px}.gross-score-legend>span{gap:3px;font-size:9px}.gross-score-legend .gross-score-mark{width:18px;height:18px;font-size:7px}.player-analytics-section{margin-top:18px;padding-top:15px}.player-analytics-head h3{font-size:19px}.analytics-player-list{gap:7px}.analytics-player-summary{padding:9px 9px 8px}.analytics-player-id{gap:8px}.analytics-player-id .player-avatar{width:34px;height:34px;min-width:34px}.analytics-player-id strong{font-size:14px}.analytics-player-id small{font-size:10px}.analytics-total-strip{gap:1px;margin-top:7px;padding-top:7px}.analytics-total-item{column-gap:2px}.analytics-total-item:nth-child(1){transform:translateX(12px)}.analytics-total-item:nth-child(2){transform:translateX(7px)}.analytics-total-item .gross-score-mark{width:20px;height:20px;font-size:8px}.analytics-total-item small{font-size:8px}.analytics-total-item b{font-size:16px}.analytics-round-breakdown{padding:6px}.analytics-round-row{grid-template-columns:38px repeat(5,minmax(0,1fr));min-height:34px;font-size:13px}.analytics-round-row strong{font-size:12px}}
  `;
  document.head.appendChild(s);

  ensureNav();
})();
