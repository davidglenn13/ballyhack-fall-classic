/* Live win-probability model for the Ballyhack Fall Classic Cup.
   Completed/entered Stableford points are fixed; unplayed golf is simulated.
   Individual: best 3 of 4 rounds. Cottage Cup: best 3 of 4 golfers each round, all 4 rounds count. */
(() => {
  const SIMS = 15000;
  const BASE_PPH = 1.85;
  const SD_PER_HOLE = 1.05;
  let injecting = false;
  let lastSignature = '';
  let cached = null;

  function scoreSignature(){
    try{return JSON.stringify(state.scores||{});}catch(e){return '';}
  }

  function hashString(str){
    let h=2166136261>>>0;
    for(let i=0;i<str.length;i++){
      h^=str.charCodeAt(i);
      h=Math.imul(h,16777619);
    }
    return h>>>0;
  }

  function rng(seed){
    let a=seed>>>0 || 0x9e3779b9;
    return () => {
      a|=0;
      a=(a+0x6D2B79F5)|0;
      let t=Math.imul(a^(a>>>15),1|a);
      t=(t+Math.imul(t^(t>>>7),61|t))^t;
      return ((t^(t>>>14))>>>0)/4294967296;
    };
  }

  function normal(rand){
    let u=0,v=0;
    while(!u)u=rand();
    while(!v)v=rand();
    return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);
  }

  function enteredHolePoints(r,name){
    const scores=state.scores?.[r]?.[name]||{};
    let pts=0, holes=0;
    for(let h=1;h<=18;h++){
      const gross=+scores[h]||0;
      if(gross){
        holes++;
        pts+=stableford(gross,PAR[h-1],strokes(player(name).ch,SI[h-1]));
      }
    }
    return {pts,holes};
  }

  function simulateRound(r,name,rand){
    const live=enteredHolePoints(r,name);
    const remaining=18-live.holes;
    if(!remaining)return live.pts;

    const mean=remaining*BASE_PPH;
    const sd=Math.sqrt(remaining)*SD_PER_HOLE;
    const simulated=Math.round(mean+normal(rand)*sd);
    return live.pts+Math.max(0,Math.min(remaining*5,simulated));
  }

  function compute(){
    const signature=scoreSignature();
    if(cached && signature===lastSignature)return cached;
    lastSignature=signature;

    const rand=rng(hashString('ballyhack-2026|'+signature));
    const playerWins=Object.fromEntries(PLAYERS.map(p=>[p.name,0]));
    const cottageWins={1:0,2:0};
    const projectedPlayer=Object.fromEntries(PLAYERS.map(p=>[p.name,0]));
    const projectedCottage={1:0,2:0};

    for(let s=0;s<SIMS;s++){
      const rounds={};
      PLAYERS.forEach(p=>{
        rounds[p.name]=[1,2,3,4].map(r=>simulateRound(r,p.name,rand));
      });

      const finalTotals=PLAYERS.map(p=>({
        name:p.name,
        total:[...rounds[p.name]].sort((a,b)=>b-a).slice(0,3).reduce((a,b)=>a+b,0)
      }));
      const best=Math.max(...finalTotals.map(x=>x.total));
      const winners=finalTotals.filter(x=>x.total===best);
      winners.forEach(x=>playerWins[x.name]+=1/winners.length);
      finalTotals.forEach(x=>projectedPlayer[x.name]+=x.total);

      const cottageTotals={1:0,2:0};
      for(const c of [1,2]){
        for(let r=0;r<4;r++){
          const vals=PLAYERS.filter(p=>p.cottage===c).map(p=>rounds[p.name][r]).sort((a,b)=>b-a);
          cottageTotals[c]+=vals.slice(0,3).reduce((a,b)=>a+b,0);
        }
        projectedCottage[c]+=cottageTotals[c];
      }

      if(cottageTotals[1]===cottageTotals[2]){
        cottageWins[1]+=.5;
        cottageWins[2]+=.5;
      }else{
        cottageWins[cottageTotals[1]>cottageTotals[2]?1:2]++;
      }
    }

    cached={
      players:Object.fromEntries(PLAYERS.map(p=>[p.name,{
        win:100*playerWins[p.name]/SIMS,
        projected:projectedPlayer[p.name]/SIMS
      }])),
      cottages:{
        1:{win:100*cottageWins[1]/SIMS,projected:projectedCottage[1]/SIMS},
        2:{win:100*cottageWins[2]/SIMS,projected:projectedCottage[2]/SIMS}
      }
    };
    return cached;
  }

  function pct(x){
    if(x>=99.95)return '100%';
    if(x<0.05)return '<0.1%';
    return x<10?`${x.toFixed(1)}%`:`${Math.round(x)}%`;
  }

  function ensureStyles(){
    if(document.getElementById('probability-styles'))return;
    const style=document.createElement('style');
    style.id='probability-styles';
    style.textContent=`
      .prob-panel{margin-top:16px;padding:14px;border:1px solid rgba(23,54,93,.18);border-radius:14px;background:rgba(23,54,93,.045)}
      .prob-panel h3{margin:0 0 4px;font-size:1rem}.prob-panel .prob-note{margin:0 0 12px;font-size:.82rem;opacity:.72;line-height:1.35}
      .prob-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}
      .prob-item{background:#fff;border-radius:11px;padding:10px 11px;border:1px solid rgba(23,54,93,.10)}
      .prob-name{font-size:.82rem;font-weight:700;line-height:1.2}.prob-value{font-size:1.32rem;font-weight:800;margin-top:2px}.prob-proj{font-size:.72rem;opacity:.68;margin-top:1px}
      .prob-bar{height:6px;border-radius:99px;background:rgba(23,54,93,.10);overflow:hidden;margin-top:7px}.prob-fill{height:100%;background:#17365D;border-radius:99px}
      .cottage-prob{margin-top:14px;padding-top:12px;border-top:1px solid rgba(23,54,93,.12)}.cottage-prob strong{display:block;font-size:1.55rem}.cottage-prob span{font-size:.78rem;opacity:.7}
      @media(min-width:720px){.prob-grid{grid-template-columns:repeat(4,minmax(0,1fr))}}
    `;
    document.head.appendChild(style);
  }

  function individualPanel(model){
    const ordered=[...PLAYERS].sort((a,b)=>model.players[b.name].win-model.players[a.name].win);
    return `
      <div class="prob-panel" data-win-prob="individual">
        <h3>Win Probability</h3>
        <p class="prob-note">15,000 simulations. Scores already entered are fixed; remaining golf is simulated. Ties split win probability.</p>
        <div class="prob-grid">
          ${ordered.map(p=>{
            const x=model.players[p.name];
            return `<div class="prob-item"><div class="prob-name">${p.name}</div><div class="prob-value">${pct(x.win)}</div><div class="prob-proj">Projected best-3: ${x.projected.toFixed(1)}</div><div class="prob-bar"><div class="prob-fill" style="width:${Math.max(.5,x.win)}%"></div></div></div>`;
          }).join('')}
        </div>
      </div>`;
  }

  function inject(){
    if(injecting)return;
    const app=document.querySelector('#app');
    if(!app)return;
    injecting=true;
    try{
      ensureStyles();
      const model=compute();
      const heading=app.querySelector('h2');
      if(!heading)return;
      const title=heading.textContent.trim();

      if(title==='Live Individual Standings' && !app.querySelector('[data-win-prob="individual"]')){
        const card=heading.closest('.card');
        if(card)card.insertAdjacentHTML('beforeend',individualPanel(model));
      }

      const cottageCards=[...app.querySelectorAll('.card')].filter(c=>/^Cottage [12]$/.test(c.querySelector('h2')?.textContent.trim()||''));
      cottageCards.forEach(card=>{
        const c=+card.querySelector('h2').textContent.trim().slice(-1);
        if(card.querySelector('[data-cottage-prob]'))return;
        const x=model.cottages[c];
        card.insertAdjacentHTML('beforeend',`<div class="cottage-prob" data-cottage-prob="${c}"><strong>${pct(x.win)}</strong><span>Chance to win Cottage Cup · projected final ${x.projected.toFixed(1)} pts</span><div class="prob-bar"><div class="prob-fill" style="width:${Math.max(.5,x.win)}%"></div></div></div>`);
      });
    } finally {
      injecting=false;
    }
  }

  const observer=new MutationObserver(()=>queueMicrotask(inject));
  const app=document.querySelector('#app');
  if(app)observer.observe(app,{childList:true,subtree:true});
  window.addEventListener('load',inject);
  setTimeout(inject,0);
})();
