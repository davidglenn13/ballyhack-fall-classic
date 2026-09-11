/* Nassau stake entry, manual presses, and optimized cash settlement. */
(() => {
  state.nassauBets ??= {};

  const bet=(r,g)=>{
    state.nassauBets??={}; state.nassauBets[r]??={};
    state.nassauBets[r][g]??={value:0,presses:[]};
    const x=state.nassauBets[r][g];
    x.value=Number(x.value||0); x.presses=Array.isArray(x.presses)?x.presses:[];
    return x;
  };
  const money=v=>{const n=Number(v||0);return `${n<0?'−':''}$${Math.abs(n).toFixed(Number.isInteger(Math.abs(n))?0:2)}`};
  const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const has=(r,g)=>!!(state.nassauGroups?.[r]?.[g]||state.nassauGroups?.[String(r)]?.[String(g)]);

  async function persist(r,g){ save(); await apiPost({op:'nassauBetConfig',round:r,group:g,config:bet(r,g)}); }

  function outcome(r,g,seg,holes){
    const teams=nassauTeams(roundGroupNames(r,g),seg.pairing); let a=0,b=0,played=0;
    for(const h of holes){
      const av=teams[0].map(n=>netScore(r,n,h)).filter(v=>v!==null);
      const bv=teams[1].map(n=>netScore(r,n,h)).filter(v=>v!==null);
      if(av.length<2||bv.length<2)continue;
      played++; const x=Math.min(...av),y=Math.min(...bv); if(x<y)a++; else if(y<x)b++;
    }
    const complete=played===holes.length, winner=complete?(a>b?'a':b>a?'b':'half'):null, margin=a-b;
    const status=!played?'Not started':complete?(winner==='half'?'Halved':`${(winner==='a'?teams[0]:teams[1]).map(n=>n.split(' ')[0]).join('/')} win`):(margin===0?'All square':`${(margin>0?teams[0]:teams[1]).map(n=>n.split(' ')[0]).join('/')} ${Math.abs(margin)} up`);
    return {teams,complete,winner,status,played,total:holes.length};
  }
  function baseOutcome(r,g,seg){const x=nassauSegment(r,g,seg);return {...x,complete:x.played===x.total,winner:x.played===x.total?(x.aWins>x.bWins?'a':x.bWins>x.aWins?'b':'half'):null};}
  function pressOutcome(r,g,p){const seg=NASSAU_SEGMENTS[+p.segment];if(!seg)return null;return outcome(r,g,seg,seg.holes.filter(h=>h>=+p.fromHole));}
  function resultText(o,amt){if(!amt)return 'Enter match value';if(!o?.complete)return 'Pending';if(o.winner==='half')return 'No money changes hands';return `${(o.winner==='a'?o.teams[0]:o.teams[1]).map(n=>n.split(' ')[0]).join('/')} +${money(amt)} each`;}

  function groupNet(r,g){
    const names=roundGroupNames(r,g), cfg=bet(r,g), net=Object.fromEntries(names.map(n=>[n,0]));
    if(!has(r,g))return net;
    const apply=(o,amt)=>{amt=+amt||0;if(!amt||!o?.complete||!o.winner||o.winner==='half')return;const w=o.winner==='a'?o.teams[0]:o.teams[1],l=o.winner==='a'?o.teams[1]:o.teams[0];w.forEach(n=>net[n]+=amt);l.forEach(n=>net[n]-=amt)};
    NASSAU_SEGMENTS.forEach(seg=>apply(baseOutcome(r,g,seg),cfg.value));
    cfg.presses.forEach(p=>apply(pressOutcome(r,g,p),p.amount));
    return net;
  }
  function totalNet(){const n=Object.fromEntries(PLAYERS.map(p=>[p.name,0]));for(let r=1;r<=4;r++)for(let g=1;g<=2;g++)Object.entries(groupNet(r,g)).forEach(([k,v])=>n[k]+=v);return n;}
  function payments(net){
    const cr=[],db=[]; Object.entries(net).forEach(([name,v])=>{const c=Math.round(v*100);if(c>0)cr.push({name,c});if(c<0)db.push({name,c:-c})}); cr.sort((a,b)=>b.c-a.c);db.sort((a,b)=>b.c-a.c);
    const out=[];let i=0,j=0;while(i<db.length&&j<cr.length){const c=Math.min(db[i].c,cr[j].c);out.push({from:db[i].name,to:cr[j].name,amount:c/100});db[i].c-=c;cr[j].c-=c;if(!db[i].c)i++;if(!cr[j].c)j++;}return out;
  }

  function pressList(r,g,si){
    const cfg=bet(r,g), seg=NASSAU_SEGMENTS[si], teams=nassauTeams(roundGroupNames(r,g),seg.pairing), ps=cfg.presses.filter(p=>+p.segment===si);
    return (ps.length?ps.map(p=>{const o=pressOutcome(r,g,p),who=p.pressedBy==='b'?teams[1]:teams[0];return `<div class="nb-press"><div><b>Press from hole ${p.fromHole}</b><small>${who.map(n=>n.split(' ')[0]).join('/')} pressed · ${money(p.amount)}</small></div><div><strong>${o?.status||'Pending'}</strong><small>${resultText(o,+p.amount)}</small></div><button type="button" data-nb-remove="${esc(p.id)}" data-r="${r}" data-g="${g}">×</button></div>`}).join(''):'<small class="muted">No presses recorded.</small>')+
      `<div class="nb-form"><label>Pressing side<select data-nb-team><option value="a">${teams[0].map(n=>n.split(' ')[0]).join(' / ')}</option><option value="b">${teams[1].map(n=>n.split(' ')[0]).join(' / ')}</option></select></label><label>Starts on<select data-nb-hole>${seg.holes.map(h=>`<option value="${h}">Hole ${h}</option>`).join('')}</select></label><label>Press $<input type="number" min="0" step="1" inputmode="decimal" data-nb-amount value="${cfg.value||''}" placeholder="${cfg.value||5}"></label><button type="button" class="secondary" data-nb-add="${si}" data-r="${r}" data-g="${g}">Add Press</button></div>`;
  }

  function enhanceNassau(){
    const r=+(sessionStorage.sideRound||sessionStorage.r||1);
    document.querySelectorAll('.side-result-panel[data-side-group]').forEach(panel=>{
      if(panel.querySelector('.nb-controls'))return; const g=+panel.dataset.sideGroup,cfg=bet(r,g),names=roundGroupNames(r,g),net=groupNet(r,g);
      panel.insertAdjacentHTML('afterbegin',`<div class="nb-controls"><label>Match value ($)<input type="number" min="0" step="1" inputmode="decimal" data-nb-value data-r="${r}" data-g="${g}" value="${cfg.value||''}" placeholder="5"></label><div><b>Current cash result</b><small>${names.map(n=>`${n.split(' ')[0]} ${net[n]>0?'+':''}${money(net[n])}`).join(' · ')}</small></div></div><p class="notice compact">Value applies to each 5-5-5-3 match. Presses are entered manually only when agreed.</p>`);
      panel.querySelectorAll('.nassau-segment').forEach((segEl,si)=>{
        const o=baseOutcome(r,g,NASSAU_SEGMENTS[si]); const small=segEl.querySelector('small'); if(small)small.insertAdjacentHTML('beforeend',`<br><b>${resultText(o,cfg.value)}</b>`);
        segEl.insertAdjacentHTML('beforeend',`<details class="nb-box"><summary>Press bets (${cfg.presses.filter(p=>+p.segment===si).length})</summary>${pressList(r,g,si)}</details>`);
      });
    });
  }

  function enhanceSettlement(){
    const app=document.querySelector('#app'); if(!app||app.querySelector('.nb-settlement')||![...app.querySelectorAll('h2')].some(h=>h.textContent.trim()==='Trip Settlement'))return;
    const net=totalNet(),pay=payments(net),any=Object.values(state.nassauBets||{}).some(r=>Object.values(r||{}).some(x=>+x?.value||(x?.presses||[]).length));
    const card=[...app.querySelectorAll('.card')].find(c=>c.querySelector('h2')?.textContent.trim()==='Trip Settlement'); if(!card)return;
    card.insertAdjacentHTML('afterend',`<section class="card nb-settlement"><div class="eyebrow">CASH SIDE BETS</div><h2>Nassau Settlement</h2><p>Nassau matches and manual presses are netted across all rounds. This stays separate from tournament entry and Ballyhack trip charges.</p><div class="nb-net">${PLAYERS.map(p=>{const v=net[p.name]||0;return `<div><span>${p.name}</span><strong>${v>0?'+':''}${money(v)}</strong></div>`}).join('')}</div><h3>Who Pays Who</h3>${pay.length?pay.map(x=>`<div class="nb-pay"><b>${x.from}</b><span>pays</span><b>${x.to}</b><strong>${money(x.amount)}</strong></div>`).join(''):`<p class="notice">${any?'No payment is due from completed results yet.':'Enter Nassau match values and results will populate here automatically.'}</p>`}</section>`);
  }

  function style(){if(document.querySelector('#nb-style'))return;const s=document.createElement('style');s.id='nb-style';s.textContent=`.nb-controls{display:grid;grid-template-columns:minmax(120px,180px) 1fr;gap:12px;align-items:end;margin-bottom:10px}.nb-controls label,.nb-form label{display:grid;gap:4px;font-size:10px;font-weight:800;color:var(--muted)}.nb-controls input{font-size:18px;font-weight:900}.nb-controls>div{display:grid;gap:4px;padding:9px 11px;border-radius:10px;background:rgba(23,54,93,.07)}.nb-controls small{font-weight:700}.nb-box{margin-top:9px;padding-top:8px;border-top:1px solid var(--line)}.nb-box summary{cursor:pointer;font-size:12px;font-weight:900}.nb-form{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;align-items:end;margin-top:9px}.nb-form button{grid-column:1/-1}.nb-press{display:grid;grid-template-columns:1fr 1fr auto;gap:7px;align-items:center;padding:7px 0;border-bottom:1px solid var(--line)}.nb-press>div{display:grid;gap:2px}.nb-press small{font-size:10px;color:var(--muted)}.nb-press button{border:0;background:transparent;font-size:22px}.nb-net{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin:12px 0 18px}.nb-net>div{display:flex;justify-content:space-between;gap:8px;padding:9px;border:1px solid var(--line);border-radius:9px}.nb-pay{display:grid;grid-template-columns:1fr auto 1fr auto;gap:8px;padding:9px 0;border-bottom:1px solid var(--line);align-items:center}.nb-pay span{font-size:12px;color:var(--muted)}@media(max-width:650px){.nb-controls{grid-template-columns:1fr}.nb-form{grid-template-columns:1fr}.nb-form button{grid-column:auto}.nb-net{grid-template-columns:1fr}.nb-pay{grid-template-columns:1fr auto 1fr}.nb-pay strong{grid-column:1/-1;text-align:right}}`;document.head.appendChild(s)}

  document.addEventListener('change',e=>{const i=e.target.closest?.('[data-nb-value]');if(!i)return;const r=+i.dataset.r,g=+i.dataset.g;bet(r,g).value=Math.max(0,+i.value||0);persist(r,g).then(()=>render())});
  document.addEventListener('click',e=>{
    const a=e.target.closest?.('[data-nb-add]'); if(a){const r=+a.dataset.r,g=+a.dataset.g,si=+a.dataset.nbAdd,f=a.closest('.nb-form'),amount=Math.max(0,+f.querySelector('[data-nb-amount]').value||bet(r,g).value||0);if(!amount){alert('Enter the press dollar value first.');return}bet(r,g).presses.push({id:`p${Date.now()}${Math.random().toString(36).slice(2,6)}`,segment:si,fromHole:+f.querySelector('[data-nb-hole]').value,pressedBy:f.querySelector('[data-nb-team]').value,amount});persist(r,g).then(()=>render());return}
    const d=e.target.closest?.('[data-nb-remove]'); if(d){const r=+d.dataset.r,g=+d.dataset.g;bet(r,g).presses=bet(r,g).presses.filter(p=>p.id!==d.dataset.nbRemove);persist(r,g).then(()=>render())}
  });

  style();
  const prior=render; render=function(){prior();setTimeout(()=>{enhanceNassau();enhanceSettlement()},0)};
  setTimeout(()=>{enhanceNassau();enhanceSettlement()},0);
})();
