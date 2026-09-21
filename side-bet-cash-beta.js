/* 40 Ball wager + combined Nassau/40 Ball cash ledger for beta testing. */
(() => {
  state.fortyBallBets ??= {};
  const TAB='The Ledger';

  const money=v=>{const n=Number(v||0);return `${n<0?'−':''}$${Math.abs(n).toFixed(Number.isInteger(Math.abs(n))?0:2)}`};
  const roundNo=()=>+(sessionStorage.r||1);
  const groupNo=()=>+(sessionStorage.group||1);
  const sideRound=()=>+(sessionStorage.sideRound||sessionStorage.r||1);
  const wager=r=>Math.max(0,Number(state.fortyBallBets?.[r]??state.fortyBallBets?.[String(r)]??0));
  const fortyActive=r=>(state.sideGames?.[r]??state.sideGames?.[String(r)]??'None')==='40 Ball';

  function fortySummary(r,g){
    const names=roundGroupNames(r,g);
    const map=state.fortyBallSelections?.[r]?.[g]||state.fortyBallSelections?.[String(r)]?.[String(g)]||{};
    let count=0,rel=0;
    for(const n of names){
      for(let h=1;h<=18;h++){
        if(!map[`${n}|${h}`])continue;
        const net=netScore(r,n,h);
        if(net===null)continue;
        count++;
        rel+=net-PAR[h-1];
      }
    }
    return {names,count,rel};
  }

  function fortyNet(r){
    const net=Object.fromEntries(PLAYERS.map(p=>[p.name,0]));
    const value=wager(r),a=fortySummary(r,1),b=fortySummary(r,2);
    const complete=fortyActive(r)&&a.count===40&&b.count===40;
    let winner=0;
    if(complete&&a.rel!==b.rel)winner=a.rel<b.rel?1:2;
    if(value&&winner){
      roundGroupNames(r,winner).forEach(n=>net[n]+=value);
      roundGroupNames(r,winner===1?2:1).forEach(n=>net[n]-=value);
    }
    return {net,value,a,b,complete,winner};
  }
  window.fortyBallCashNetForRound=r=>fortyNet(r).net;

  function nassauOutcome(r,g,seg,holes){
    const teams=nassauTeams(roundGroupNames(r,g),seg.pairing);let a=0,b=0,played=0;
    for(const h of holes){
      const av=teams[0].map(n=>netScore(r,n,h)).filter(v=>v!==null),bv=teams[1].map(n=>netScore(r,n,h)).filter(v=>v!==null);
      if(av.length<2||bv.length<2)continue;
      played++;
      const x=Math.min(...av),y=Math.min(...bv);
      if(x<y)a++;else if(y<x)b++;
    }
    return {teams,complete:played===holes.length,winner:played===holes.length?(a>b?'a':b>a?'b':'half'):null};
  }

  function nassauGroupNet(r,g){
    const names=roundGroupNames(r,g),net=Object.fromEntries(names.map(n=>[n,0]));
    const active=!!(state.nassauGroups?.[r]?.[g]||state.nassauGroups?.[String(r)]?.[String(g)]);
    if(!active)return net;
    const cfg=state.nassauBets?.[r]?.[g]||state.nassauBets?.[String(r)]?.[String(g)]||{value:0,presses:[]};
    const segs=typeof window.nassauSegmentsFor==='function'?window.nassauSegmentsFor(r,g):NASSAU_SEGMENTS;
    const apply=(o,amt)=>{
      amt=Number(amt||0);
      if(!amt||!o?.complete||!o.winner||o.winner==='half')return;
      const winners=o.winner==='a'?o.teams[0]:o.teams[1],losers=o.winner==='a'?o.teams[1]:o.teams[0];
      winners.forEach(n=>net[n]+=amt);losers.forEach(n=>net[n]-=amt);
    };
    segs.forEach(seg=>{
      const x=nassauSegment(r,g,seg);
      apply({...x,complete:x.played===x.total,winner:x.played===x.total?(x.aWins>x.bWins?'a':x.bWins>x.aWins?'b':'half'):null},cfg.value);
    });
    (Array.isArray(cfg.presses)?cfg.presses:[]).forEach(p=>{
      const seg=segs[+p.segment];
      if(!seg||seg.singleHole)return;
      apply(nassauOutcome(r,g,seg,seg.holes.filter(h=>h>=+p.fromHole)),p.amount);
    });
    return net;
  }

  function totalSideNet(){
    const net=Object.fromEntries(PLAYERS.map(p=>[p.name,0]));
    for(let r=1;r<=4;r++){
      for(let g=1;g<=2;g++)Object.entries(nassauGroupNet(r,g)).forEach(([n,v])=>net[n]+=v);
      Object.entries(fortyNet(r).net).forEach(([n,v])=>net[n]+=v);
    }
    return net;
  }

  function payments(net){
    const cr=[],db=[];
    Object.entries(net).forEach(([name,v])=>{const c=Math.round(Number(v||0)*100);if(c>0)cr.push({name,c});if(c<0)db.push({name,c:-c})});
    cr.sort((a,b)=>b.c-a.c);db.sort((a,b)=>b.c-a.c);
    const out=[];let i=0,j=0;
    while(i<db.length&&j<cr.length){const c=Math.min(db[i].c,cr[j].c);out.push({from:db[i].name,to:cr[j].name,amount:c/100});db[i].c-=c;cr[j].c-=c;if(!db[i].c)i++;if(!cr[j].c)j++;}
    return out;
  }

  async function persistWager(r,value){
    state.fortyBallBets??={};state.fortyBallBets[r]=value;save();
    const pending=apiPost({op:'fortyBallBet',round:r,value});
    window.__fortyWagerPending=pending;
    try{return await pending;}finally{
      if(window.__fortyWagerPending===pending)window.__fortyWagerPending=null;
    }
  }

  function add40WagerToScore(){
    const r=roundNo(),g=groupNo();
    if(!fortyActive(r)){
      document.querySelectorAll('.fbw-wager').forEach(x=>x.remove());
      return;
    }
    document.querySelectorAll('.nlp-wager,.nlp-card').forEach(x=>x.remove());
    const picker=document.querySelector('.side-game-picker'),sel=document.querySelector('#scoreSideGame');
    if(!picker||!sel||picker.querySelector('.fbw-wager'))return;
    const host=sel.closest('div')||picker,v=typeof sideGameWasSelected==='function'&&sideGameWasSelected(r,g)?wager(r):0;
    if(g===1){
      host.insertAdjacentHTML('beforeend',`<label class="fbw-wager ${v?'':'needs-wager'}"><span class="wager-next">Next step: enter the wager for this side game</span><strong>Wager Amount</strong><span class="wager-entry"><span aria-hidden="true">$</span><input type="text" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="off" data-fbw-wager data-r="${r}" value="${v||''}" aria-label="40 Ball wager amount"></span></label>`);
    }else{
      host.insertAdjacentHTML('beforeend',`<div class="fbw-wager fbw-readonly">Wager Amount <b>${v?money(v):'not entered'}</b><small>First Group sets the wager.</small></div>`);
    }
  }

  function moveSelectedPicker(){
    const r=roundNo(),g=groupNo();
    if(!wager(r)||typeof sideGameWasSelected!=='function'||!sideGameWasSelected(r,g))return;
    const card=document.querySelector('.scoring-card'),picker=document.querySelector('.side-game-picker');
    if(!card||!picker)return;
    picker.classList.add('side-game-picker-detached');
    picker.querySelector('.wager-next')?.replaceChildren('Wager Set');
    const note=document.querySelector('.forty-ball-beta-note');
    const review=card.querySelector('.score-review');
    if(note&&review)card.insertBefore(note,review);
    else if(note)card.insertAdjacentElement('afterend',note);
    card.insertAdjacentElement('afterend',picker);
  }

  function roundCashBlock(r){
    const x=fortyNet(r),pay=payments(x.net);
    let status='Enter the 40 Ball wager from the First Group score screen.';
    if(x.value&&!x.complete)status=`Wager ${money(x.value)} per player · Cash result is pending until both groups have 40 counted scores.`;
    if(x.complete&&x.winner===0)status=`40 Ball finished tied · No money changes hands.`;
    if(x.complete&&x.winner)status=`${x.winner===1?'First':'Second'} Group wins · Each winner +${money(x.value)}, each loser ${money(-x.value)}.`;
    const nets=PLAYERS.map(p=>`<div><span>${p.name}</span><strong>${x.net[p.name]>0?'+':''}${money(x.net[p.name])}</strong></div>`).join('');
    const who=pay.length?pay.map(p=>`<div class="sbc-pay"><b>${p.from}</b><span>pays</span><b>${p.to}</b><strong>${money(p.amount)}</strong></div>`).join(''):`<p class="notice compact">${x.complete?'No payment due for this round.':'Payments will appear when the 40 Ball result is complete.'}</p>`;
    return `<section class="fbw-round-cash"><div class="eyebrow">40 BALL WAGER</div><h3>Round Cash Result</h3><p>${status}</p><div class="sbc-net">${nets}</div><div class="sbc-payment-panel"><h4>Who Pays Who</h4>${who}</div></section>`;
  }

  function enhance40Results(){
    const r=sideRound();if(!fortyActive(r))return;
    const app=document.querySelector('#app'),card=app?.querySelector('.card');
    if(!card||card.querySelector('.fbw-round-cash')||!document.querySelector('#sideRoundSel'))return;
    card.insertAdjacentHTML('beforeend',roundCashBlock(r));
  }

  function ledgerHtml(title='Cumulative Side Bets'){
    const net=totalSideNet(),pay=payments(net);
    const any=Object.values(state.fortyBallBets||{}).some(v=>+v>0)||Object.values(state.nassauBets||{}).some(r=>Object.values(r||{}).some(x=>+x?.value||(x?.presses||[]).length));
    const wagerRounds=[1,2,3,4].filter(r=>{
      if(+state.fortyBallBets?.[r]>0)return true;
      return Object.values(state.nassauBets?.[r]||{}).some(x=>+x?.value||(x?.presses||[]).length);
    });
    const final=any&&wagerRounds.every(r=>typeof roundFullyEntered==='function'&&roundFullyEntered(r));
    const statusClass=final?'is-final':'is-live';
    const statusText=final?'COMPLETE':'LIVE';
    const summary=pay.length
      ?pay.map(x=>`<div class="sbc-final-pay"><div><b>${x.from}</b><span> pays </span><b>${x.to}</b></div><strong>${money(x.amount)}</strong></div>`).join('')
      :`<p class="notice">${any?'No payment is due from completed side-game results yet.':'Completed results will populate here automatically.'}</p>`;

    return `<section class="card sbc-ledger">
      <div class="sbc-ledger-head">
        <div>
          <div class="eyebrow">THE LEDGER</div>
          <h2>${title}</h2>
        </div>
        <span class="sbc-ledger-status ${statusClass}">${statusText}</span>
      </div>

      <div class="sbc-final-panel">
        <div class="sbc-final-title">
          <div>
            <div class="eyebrow">PAYMENTS</div>
            <h3>Who Pays Who</h3>
          </div>
          <span>${final?'All wagered rounds complete':''}</span>
        </div>
        ${summary}
      </div>

      <div class="sbc-detail-head">
        <h3>Player Net Detail</h3>
        <p>Nassau base matches, presses, and 40 Ball wagers are netted across all completed results.</p>
      </div>

      <div class="sbc-net">${PLAYERS.map(p=>{
        const v=net[p.name]||0;
        const label=v>0?'RECEIVES':v<0?'OWES':'EVEN';
        return `<div class="${v>0?'net-positive':v<0?'net-negative':'net-even'}"><span><b>${p.name}</b><small>${label}</small></span><strong>${money(Math.abs(v))}</strong></div>`;
      }).join('')}</div>
    </section>`;
  }

  function ledgerPage(){
    return layout(ledgerHtml());
  }

  function ensureLedgerNav(){
    const nav=document.querySelector('#nav');
    if(!nav)return;
    let b=nav.querySelector(`button[data-tab="${TAB}"]`);
    if(!b){
      b=document.createElement('button');
      b.dataset.tab=TAB;
      b.textContent=TAB;
    }
    const gross=nav.querySelector('button[data-tab="Gross Scores"]');
    if(gross)nav.insertBefore(b,gross);else nav.appendChild(b);
  }

  function replaceTripSettlement(){
    const app=document.querySelector('#app');
    if(!app||![...app.querySelectorAll('h2')].some(h=>h.textContent.trim()==='Trip Settlement'))return;
    app.querySelector('.nb-settlement')?.remove();
    if(app.querySelector('.sbc-settlement'))return;
    const trip=[...app.querySelectorAll('.card')].find(c=>c.querySelector('h2')?.textContent.trim()==='Trip Settlement');
    if(trip)trip.insertAdjacentHTML('afterend',ledgerHtml('Side Bet Settlement').replace('class="card sbc-ledger"','class="card sbc-ledger sbc-settlement"'));
  }

  function enhance(){ensureLedgerNav();add40WagerToScore();enhance40Results();replaceTripSettlement();moveSelectedPicker();}

  if(!document.querySelector('#sbc-style')){
    const s=document.createElement('style');s.id='sbc-style';s.textContent=`
      .fbw-wager{display:grid;gap:4px;margin-top:8px;font-size:10px;font-weight:800;color:var(--muted);max-width:180px}.side-game-picker-detached{grid-column:span 12;width:100%;max-width:none;margin-top:14px;padding:14px;border:2px solid var(--navy);border-radius:10px;background:#fff;color:var(--navy)}.side-game-picker-detached .wager-next{display:block;font-size:15px;font-weight:900;color:var(--navy)}.side-game-picker-detached .wager-entry{display:flex;align-items:center;gap:8px;padding:0 12px;border:1px solid var(--line);border-radius:8px;background:#fff;font-size:20px}.side-game-picker-detached .wager-entry input{flex:1;min-width:0;width:100%;padding:10px 0;border:0;outline:0;background:transparent;font-size:20px}
      .fbw-wager input{width:100%;font-size:16px;font-weight:900}.fbw-readonly b{font-size:14px;color:var(--text)}.fbw-readonly small{font-weight:700}
      .fbw-round-cash{margin-top:18px;padding-top:16px;border-top:2px solid var(--line)}.fbw-round-cash h3{margin:3px 0 8px}.fbw-round-cash h4{margin:14px 0 4px}
      .sbc-net{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin:12px 0 18px}.sbc-net>div{display:flex;justify-content:space-between;gap:8px;padding:9px;border:1px solid var(--line);border-radius:9px}.sbc-payment-panel{margin-top:22px;padding:16px;border:1px solid rgba(23,54,93,.20);border-left:5px solid var(--navy);border-radius:12px;background:rgba(23,54,93,.045);box-shadow:0 5px 16px rgba(23,54,93,.06)}.sbc-payment-panel h3,.sbc-payment-panel h4{margin:0 0 11px;color:var(--navy)}.sbc-pay{display:grid;grid-template-columns:1fr auto 1fr auto;gap:8px;margin-top:7px;padding:11px 12px;border:1px solid var(--line);border-radius:9px;background:#fff;align-items:center}.sbc-pay span{font-size:12px;color:var(--muted)}
      .sbc-ledger-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start}.sbc-ledger-head h2{margin:3px 0 0}.sbc-ledger-status{padding:7px 10px;border-radius:999px;font-size:10px;font-weight:900;letter-spacing:.05em;white-space:nowrap}.sbc-ledger-status.is-live{background:#fff3d8;color:#835a00}.sbc-ledger-status.is-final{background:#e7f5ee;color:var(--good)}
      .sbc-final-panel{margin:14px 0 22px;padding:16px;border:2px solid var(--navy);border-radius:13px;background:#f8fbff}.sbc-final-title{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:8px}.sbc-final-title h3{margin:3px 0 0;color:var(--navy);font-size:20px}.sbc-final-title>span{font-size:11px;color:var(--muted);text-align:right;max-width:220px}
      .sbc-final-pay{display:flex;justify-content:space-between;gap:14px;align-items:center;padding:12px 0;border-top:1px solid var(--line)}.sbc-final-pay:first-of-type{border-top:0}.sbc-final-pay>div{font-size:15px}.sbc-final-pay>div span{color:var(--muted);font-size:12px}.sbc-final-pay>strong{font-size:22px;color:var(--navy)}
      .sbc-detail-head{display:flex;justify-content:space-between;gap:14px;align-items:end;margin-bottom:10px}.sbc-detail-head h3{margin:0;color:var(--navy)}.sbc-detail-head p{margin:0;max-width:520px;text-align:right;font-size:12px;color:var(--muted)}
      .sbc-net>div>span{display:flex;flex-direction:column;gap:2px}.sbc-net small{font-size:9px;letter-spacing:.08em;font-weight:900;color:var(--muted)}.sbc-net .net-positive strong{color:var(--good)}.sbc-net .net-negative strong{color:var(--red)}.sbc-net .net-even strong{color:var(--muted)}
      @media(max-width:650px){.fbw-wager{max-width:none}.sbc-ledger-head,.sbc-final-title,.sbc-detail-head{display:block}.sbc-ledger-status{display:inline-block;margin-top:8px}.sbc-final-title>span{display:block;text-align:left;max-width:none;margin-top:4px}.sbc-detail-head p{text-align:left;margin-top:5px}.sbc-net{grid-template-columns:1fr}.sbc-pay{grid-template-columns:1fr auto 1fr}.sbc-pay strong{grid-column:1/-1;text-align:right}.sbc-final-pay>strong{font-size:20px}}
    `;document.head.appendChild(s);
  }

  document.addEventListener('input',e=>{const x=e.target.closest?.('[data-fbw-wager]');if(!x)return;x.value=x.value.replace(/\D/g,'').slice(0,4);x.closest('.fbw-wager')?.classList.toggle('needs-wager',!(+x.value))});
  document.addEventListener('change',e=>{const x=e.target.closest?.('[data-fbw-wager]');if(!x)return;const r=+x.dataset.r,v=Math.min(9999,Math.max(0,parseInt(x.value,10)||0));x.value=v||'';if(typeof sideGameWasSelected==='function'){[1,2].forEach(group=>v?sessionStorage.setItem('ballyhack-side-selected-'+r+'-'+group,'1'):sessionStorage.removeItem('ballyhack-side-selected-'+r+'-'+group));}persistWager(r,v).then(()=>render())});

  const prior=render;render=function(){
    ensureLedgerNav();
    if(tab===TAB){
      document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('active',b.dataset.tab===TAB));
      document.querySelector('#app').innerHTML=ledgerPage();
      ensureLedgerNav();
      return;
    }
    prior();
    setTimeout(enhance,0);
  };
  ensureLedgerNav();
  setTimeout(enhance,0);
})();
