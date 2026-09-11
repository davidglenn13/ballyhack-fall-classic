/* Nassau stakes, press results, and cash settlement for both Nassau formats. */
(() => {
  state.nassauBets ??= {};
  const segmentsFor=(r,g)=>typeof window.nassauSegmentsFor==='function'?window.nassauSegmentsFor(r,g):NASSAU_SEGMENTS;
  const formatFor=(r,g)=>typeof window.nassauFormatFor==='function'?window.nassauFormatFor(r,g):'Nassau 5-5-5-3';
  const bet=(r,g)=>{
    state.nassauBets??={};state.nassauBets[r]??={};state.nassauBets[r][g]??={value:0,presses:[]};
    const x=state.nassauBets[r][g];x.value=Number(x.value||0);x.presses=Array.isArray(x.presses)?x.presses:[];return x;
  };
  const money=v=>{const n=Number(v||0);return `${n<0?'−':''}$${Math.abs(n).toFixed(Number.isInteger(Math.abs(n))?0:2)}`};
  const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const has=(r,g)=>!!(state.nassauGroups?.[r]?.[g]||state.nassauGroups?.[String(r)]?.[String(g)]);
  async function persist(r,g){save();await apiPost({op:'nassauBetConfig',round:r,group:g,config:bet(r,g)});}

  function outcome(r,g,seg,holes){
    const teams=nassauTeams(roundGroupNames(r,g),seg.pairing);let a=0,b=0,played=0;
    for(const h of holes){
      const av=teams[0].map(n=>netScore(r,n,h)).filter(v=>v!==null),bv=teams[1].map(n=>netScore(r,n,h)).filter(v=>v!==null);
      if(av.length<2||bv.length<2)continue;played++;const x=Math.min(...av),y=Math.min(...bv);if(x<y)a++;else if(y<x)b++;
    }
    const complete=played===holes.length,winner=complete?(a>b?'a':b>a?'b':'half'):null,margin=a-b;
    const status=!played?'Not started':complete?(winner==='half'?'Halved':`${(winner==='a'?teams[0]:teams[1]).map(n=>n.split(' ')[0]).join('/')} win`):(margin===0?'All square':`${(margin>0?teams[0]:teams[1]).map(n=>n.split(' ')[0]).join('/')} ${Math.abs(margin)} up`);
    return {teams,complete,winner,status,played,total:holes.length};
  }
  function baseOutcome(r,g,seg){const x=nassauSegment(r,g,seg);return {...x,complete:x.played===x.total,winner:x.played===x.total?(x.aWins>x.bWins?'a':x.bWins>x.aWins?'b':'half'):null};}
  function pressOutcome(r,g,p){const seg=segmentsFor(r,g)[+p.segment];if(!seg)return null;return outcome(r,g,seg,seg.holes.filter(h=>h>=+p.fromHole));}
  function resultText(o,amt){if(!amt)return 'Enter Nassau wager';if(!o?.complete)return 'Pending';if(o.winner==='half')return 'No money changes hands';return `${(o.winner==='a'?o.teams[0]:o.teams[1]).map(n=>n.split(' ')[0]).join('/')} +${money(amt)} each`;}

  function groupNet(r,g){
    const names=roundGroupNames(r,g),cfg=bet(r,g),net=Object.fromEntries(names.map(n=>[n,0]));if(!has(r,g))return net;
    const apply=(o,amt)=>{amt=+amt||0;if(!amt||!o?.complete||!o.winner||o.winner==='half')return;const w=o.winner==='a'?o.teams[0]:o.teams[1],l=o.winner==='a'?o.teams[1]:o.teams[0];w.forEach(n=>net[n]+=amt);l.forEach(n=>net[n]-=amt)};
    segmentsFor(r,g).forEach(seg=>apply(baseOutcome(r,g,seg),cfg.value));
    cfg.presses.forEach(p=>apply(pressOutcome(r,g,p),p.amount));return net;
  }
  function totalNet(){const n=Object.fromEntries(PLAYERS.map(p=>[p.name,0]));for(let r=1;r<=4;r++)for(let g=1;g<=2;g++)Object.entries(groupNet(r,g)).forEach(([k,v])=>n[k]+=v);return n;}
  function payments(net){const cr=[],db=[];Object.entries(net).forEach(([name,v])=>{const c=Math.round(v*100);if(c>0)cr.push({name,c});if(c<0)db.push({name,c:-c})});cr.sort((a,b)=>b.c-a.c);db.sort((a,b)=>b.c-a.c);const out=[];let i=0,j=0;while(i<db.length&&j<cr.length){const c=Math.min(db[i].c,cr[j].c);out.push({from:db[i].name,to:cr[j].name,amount:c/100});db[i].c-=c;cr[j].c-=c;if(!db[i].c)i++;if(!cr[j].c)j++;}return out;}

  function pressList(r,g,si){
    const cfg=bet(r,g),seg=segmentsFor(r,g)[si];if(!seg)return '';
    const teams=nassauTeams(roundGroupNames(r,g),seg.pairing),ps=cfg.presses.filter(p=>+p.segment===si);
    return ps.length?ps.map(p=>{const o=pressOutcome(r,g,p),who=p.pressedBy==='b'?teams[1]:teams[0];return `<div class="nb-press"><div><b>Press from hole ${p.fromHole}</b><small>${who.map(n=>n.split(' ')[0]).join('/')} pressed · ${money(p.amount)}</small></div><div><strong>${o?.status||'Pending'}</strong><small>${resultText(o,+p.amount)}</small></div><button type="button" data-nb-remove="${esc(p.id)}" data-r="${r}" data-g="${g}">×</button></div>`}).join(''):'<small class="muted">No press recorded.</small>';
  }

  function enhanceNassau(){
    const r=+(sessionStorage.sideRound||sessionStorage.r||1);
    document.querySelectorAll('.side-result-panel[data-side-group]').forEach(panel=>{
      if(panel.querySelector('.nb-controls'))return;
      const g=+panel.dataset.sideGroup,cfg=bet(r,g),names=roundGroupNames(r,g),net=groupNet(r,g),segments=segmentsFor(r,g),fmt=formatFor(r,g);
      panel.insertAdjacentHTML('afterbegin',`<div class="nb-controls"><div><b>Current cash result</b><small>${names.map(n=>`${n.split(' ')[0]} ${net[n]>0?'+':''}${money(net[n])}`).join(' · ')}</small></div></div><p class="notice compact">Nassau wager: <b>${cfg.value?money(cfg.value):'not entered'}</b> · Applies to each ${fmt==='Nassau 6-6-6'?'6-hole':'5-5-5-3'} base match and its elected press.</p>`);
      panel.querySelectorAll('.nassau-segment').forEach((segEl,si)=>{
        const seg=segments[si];if(!seg)return;const o=baseOutcome(r,g,seg),small=segEl.querySelector('small');if(small)small.insertAdjacentHTML('beforeend',`<br><b>${resultText(o,cfg.value)}</b>`);
        segEl.insertAdjacentHTML('beforeend',`<details class="nb-box"><summary>Press bet (${cfg.presses.filter(p=>+p.segment===si).length})</summary>${pressList(r,g,si)}</details>`);
      });
    });
  }

  function enhanceSettlement(){
    const app=document.querySelector('#app');if(!app||app.querySelector('.nb-settlement')||![...app.querySelectorAll('h2')].some(h=>h.textContent.trim()==='Trip Settlement'))return;
    const net=totalNet(),pay=payments(net),any=Object.values(state.nassauBets||{}).some(r=>Object.values(r||{}).some(x=>+x?.value||(x?.presses||[]).length));
    const card=[...app.querySelectorAll('.card')].find(c=>c.querySelector('h2')?.textContent.trim()==='Trip Settlement');if(!card)return;
    card.insertAdjacentHTML('afterend',`<section class="card nb-settlement"><div class="eyebrow">CASH SIDE BETS</div><h2>Nassau Settlement</h2><p>Both Nassau formats and their elected presses are netted across all rounds. This stays separate from tournament entry and Ballyhack trip charges.</p><div class="nb-net">${PLAYERS.map(p=>{const v=net[p.name]||0;return `<div><span>${p.name}</span><strong>${v>0?'+':''}${money(v)}</strong></div>`}).join('')}</div><h3>Who Pays Who</h3>${pay.length?pay.map(x=>`<div class="nb-pay"><b>${x.from}</b><span>pays</span><b>${x.to}</b><strong>${money(x.amount)}</strong></div>`).join(''):`<p class="notice">${any?'No payment is due from completed results yet.':'Enter Nassau wagers and results will populate here automatically.'}</p>`}</section>`);
  }

  function style(){if(document.querySelector('#nb-style'))return;const s=document.createElement('style');s.id='nb-style';s.textContent=`.nb-controls{display:grid;grid-template-columns:1fr;gap:12px;align-items:end;margin-bottom:10px}.nb-controls>div{display:grid;gap:4px;padding:9px 11px;border-radius:10px;background:rgba(23,54,93,.07)}.nb-controls small{font-weight:700}.nb-box{margin-top:9px;padding-top:8px;border-top:1px solid var(--line)}.nb-box summary{cursor:pointer;font-size:12px;font-weight:900}.nb-press{display:grid;grid-template-columns:1fr 1fr auto;gap:7px;align-items:center;padding:7px 0;border-bottom:1px solid var(--line)}.nb-press>div{display:grid;gap:2px}.nb-press small{font-size:10px;color:var(--muted)}.nb-press button{border:0;background:transparent;font-size:22px}.nb-net{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin:12px 0 18px}.nb-net>div{display:flex;justify-content:space-between;gap:8px;padding:9px;border:1px solid var(--line);border-radius:9px}.nb-pay{display:grid;grid-template-columns:1fr auto 1fr auto;gap:8px;padding:9px 0;border-bottom:1px solid var(--line);align-items:center}.nb-pay span{font-size:12px;color:var(--muted)}@media(max-width:650px){.nb-net{grid-template-columns:1fr}.nb-pay{grid-template-columns:1fr auto 1fr}.nb-pay strong{grid-column:1/-1;text-align:right}}`;document.head.appendChild(s)}

  document.addEventListener('click',e=>{const d=e.target.closest?.('[data-nb-remove]');if(!d)return;const r=+d.dataset.r,g=+d.dataset.g;bet(r,g).presses=bet(r,g).presses.filter(p=>p.id!==d.dataset.nbRemove);persist(r,g).then(()=>render());});
  style();const prior=render;render=function(){prior();setTimeout(()=>{enhanceNassau();enhanceSettlement()},0)};setTimeout(()=>{enhanceNassau();enhanceSettlement()},0);
})();
