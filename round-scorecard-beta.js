/* Collapsible gross-score scorecard on Live Scoring. */
(() => {
  function gross(r,n,h){ return +(state.scores?.[r]?.[n]?.[h]||0); }
  function sum(vals){ return vals.reduce((a,b)=>a+(+b||0),0); }
  function currentNames(r,g){ const rd=ROUNDS[r-1]; return g===1?rd.first:rd.second; }

  function table(r,g){
    const names=currentNames(r,g);
    const holes=[...Array(18)].map((_,i)=>i+1);
    const head=holes.map(h=>`<th>${h}</th>`).join('');
    const rows=names.map(n=>{
      const vals=holes.map(h=>gross(r,n,h));
      const out=sum(vals.slice(0,9)), inn=sum(vals.slice(9)), total=out+inn;
      return `<tr><th class="rs-name">${n.split(' ')[0]}</th>${vals.slice(0,9).map(v=>`<td>${v||'—'}</td>`).join('')}<td class="rs-total">${out||'—'}</td>${vals.slice(9).map(v=>`<td>${v||'—'}</td>`).join('')}<td class="rs-total">${inn||'—'}</td><td class="rs-grand">${total||'—'}</td></tr>`;
    }).join('');
    return `<div class="rs-scroll"><table class="rs-table"><thead><tr><th>Player</th>${head.slice(0,head.indexOf('<th>10</th>'))}<th>OUT</th>${head.slice(head.indexOf('<th>10</th>'))}<th>IN</th><th>TOTAL</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  function inject(){
    const side=document.querySelector('#scoreSideGame');
    if(!side)return;
    const card=side.closest('.card');
    if(!card||card.querySelector('.round-scorecard'))return;
    const r=+(sessionStorage.r||1),g=+(sessionStorage.group||1);
    card.insertAdjacentHTML('beforeend',`<details class="round-scorecard"><summary>Round Scorecard</summary>${table(r,g)}</details>`);
  }

  if(!document.querySelector('#round-scorecard-style')){
    const s=document.createElement('style');s.id='round-scorecard-style';s.textContent=`
      .round-scorecard{margin-top:14px;border-top:1px solid var(--line);padding-top:10px}
      .round-scorecard summary{cursor:pointer;font-weight:900;color:var(--navy);padding:10px 0}
      .rs-scroll{overflow-x:auto;-webkit-overflow-scrolling:touch}
      .rs-table{border-collapse:collapse;min-width:980px;width:100%;font-size:12px;background:#fff}
      .rs-table th,.rs-table td{border:1px solid var(--line);padding:7px 6px;text-align:center;white-space:nowrap}
      .rs-table thead th{background:rgba(23,54,93,.07);font-weight:900}
      .rs-table .rs-name{text-align:left;position:sticky;left:0;background:#fff;z-index:1;min-width:76px}
      .rs-table .rs-total{font-weight:900;background:rgba(23,54,93,.045)}
      .rs-table .rs-grand{font-weight:900;background:rgba(23,54,93,.10)}
    `;document.head.appendChild(s);
  }

  const prior=render;
  render=function(){ prior(); setTimeout(inject,0); };
  setTimeout(inject,0);
})();
