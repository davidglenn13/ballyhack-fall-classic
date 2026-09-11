/* Live win-probability estimates for Side Games beta. */
(() => {
  const SIMS=5000;

  function hash(str){
    let h=2166136261>>>0;
    for(let i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,16777619);}
    return h>>>0;
  }
  function rng(seed){
    let a=seed>>>0||0x9e3779b9;
    return()=>{a=(a+0x6D2B79F5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};
  }
  function normal(rand){
    let u=0,v=0; while(!u)u=rand(); while(!v)v=rand();
    return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);
  }
  function pct(x){return x>=99.95?'100%':x<0.05?'<0.1%':x<10?`${x.toFixed(1)}%`:`${Math.round(x)}%`;}
  function roundNo(){return +(sessionStorage.sideRound||sessionStorage.r||1);}
  function selMap(r,g){return state.fortyBallSelections?.[r]?.[g]||state.fortyBallSelections?.[String(r)]?.[String(g)]||{};}
  function keyFor(n,h){return `${n}|${h}`;}

  function fortySummary(r,g){
    const names=roundGroupNames(r,g), map=selMap(r,g); let count=0, rel=0;
    names.forEach(n=>{for(let h=1;h<=18;h++){
      if(!map[keyFor(n,h)])continue;
      const net=netScore(r,n,h); if(net===null)continue;
      count++; rel+=net-PAR[h-1];
    }});
    return {names,count,rel};
  }

  function observedRel(r,g){
    const vals=[];
    roundGroupNames(r,g).forEach(n=>{for(let h=1;h<=18;h++){
      const net=netScore(r,n,h); if(net!==null)vals.push(net-PAR[h-1]);
    }});
    if(!vals.length)return {mean:0,sd:1.15};
    const mean=vals.reduce((a,b)=>a+b,0)/vals.length;
    const variance=vals.reduce((a,b)=>a+(b-mean)*(b-mean),0)/Math.max(1,vals.length-1);
    return {mean:Math.max(-1,Math.min(1,mean)),sd:Math.max(.85,Math.min(1.6,Math.sqrt(variance)||1.15))};
  }

  function fortyProb(r){
    const a=fortySummary(r,1),b=fortySummary(r,2),oa=observedRel(r,1),ob=observedRel(r,2);
    const sig=JSON.stringify({r,s:state.scores?.[r]||{},f:state.fortyBallSelections?.[r]||{}});
    const rand=rng(hash('40ball|'+sig));
    let aw=0,bw=0,tie=0;
    for(let s=0;s<SIMS;s++){
      let ar=a.rel,br=b.rel;
      for(let i=a.count;i<40;i++)ar+=Math.max(-3,Math.min(4,Math.round(oa.mean+normal(rand)*oa.sd)));
      for(let i=b.count;i<40;i++)br+=Math.max(-3,Math.min(4,Math.round(ob.mean+normal(rand)*ob.sd)));
      if(ar<br)aw++; else if(br<ar)bw++; else tie++;
    }
    return {a:100*aw/SIMS,b:100*bw/SIMS,tie:100*tie/SIMS};
  }

  function nassauProb(r,g,seg){
    const x=nassauSegment(r,g,seg);
    const remain=x.total-x.played;
    if(!remain){
      if(x.aWins>x.bWins)return {a:100,b:0,tie:0};
      if(x.bWins>x.aWins)return {a:0,b:100,tie:0};
      return {a:0,b:0,tie:100};
    }
    const seed=hash(`nassau|${r}|${g}|${seg.label}|${JSON.stringify(state.scores?.[r]||{})}`);
    const rand=rng(seed); let aw=0,bw=0,tie=0;
    for(let s=0;s<SIMS;s++){
      let a=x.aWins,b=x.bWins;
      for(let i=0;i<remain;i++){
        const q=rand();
        if(q<.44)a++; else if(q<.88)b++;
      }
      if(a>b)aw++; else if(b>a)bw++; else tie++;
    }
    return {a:100*aw/SIMS,b:100*bw/SIMS,tie:100*tie/SIMS};
  }

  function ensureStyle(){
    if(document.getElementById('side-prob-style'))return;
    const st=document.createElement('style');st.id='side-prob-style';st.textContent=`
      .side-probability{margin:14px 0 0;padding:13px;border:1px solid var(--line);border-radius:12px;background:#f8fafc}
      .side-probability h3{margin:0 0 8px}.side-prob-row{display:grid;grid-template-columns:1fr auto;gap:10px;align-items:center;padding:7px 0;border-top:1px solid var(--line)}
      .side-prob-row:first-of-type{border-top:0}.side-prob-row strong{font-size:1.2rem;color:var(--navy)}.side-prob-note{font-size:11px;color:var(--muted);margin-top:8px}
      .nassau-prob{margin-top:8px;font-size:11px;font-weight:800;color:var(--navy)}
    `;document.head.appendChild(st);
  }

  function inject(){
    ensureStyle();
    const app=document.querySelector('#app'); if(!app)return;
    const r=roundNo(), game=state.sideGames?.[r]||'None';
    const h=app.querySelector('h2')?.textContent||'';
    if(!/Side Game|40 Ball/.test(h))return;

    if(game==='40 Ball'&&!app.querySelector('[data-side-prob="40"]')){
      const p=fortyProb(r), first=roundGroupNames(r,1).map(n=>n.split(' ')[0]).join(' · '), second=roundGroupNames(r,2).map(n=>n.split(' ')[0]).join(' · ');
      const box=document.createElement('div');box.className='side-probability';box.dataset.sideProb='40';
      box.innerHTML=`<h3>Probability to Win</h3><div class="side-prob-row"><span>First Group<br><small>${first}</small></span><strong>${pct(p.a)}</strong></div><div class="side-prob-row"><span>Second Group<br><small>${second}</small></span><strong>${pct(p.b)}</strong></div>${p.tie>.05?`<div class="side-prob-row"><span>Tie</span><strong>${pct(p.tie)}</strong></div>`:''}<div class="side-prob-note">5,000 simulations using scores already entered and the remaining selections needed to reach 40.</div>`;
      const card=app.querySelector('.card');
      if(card)card.appendChild(box);
    }

    if(game==='Nassau 5-5-5-3'){
      const panels=[...app.querySelectorAll('.side-result-panel')];
      panels.forEach((panel,idx)=>{
        const g=idx+1; const segEls=[...panel.querySelectorAll('.nassau-segment')];
        segEls.forEach((el,i)=>{
          if(el.querySelector('.nassau-prob'))return;
          const seg=NASSAU_SEGMENTS[i],x=nassauSegment(r,g,seg),p=nassauProb(r,g,seg);
          const a=x.teams[0].map(n=>n.split(' ')[0]).join('/'),b=x.teams[1].map(n=>n.split(' ')[0]).join('/');
          const d=document.createElement('div');d.className='nassau-prob';
          d.textContent=`Win probability: ${a} ${pct(p.a)} · ${b} ${pct(p.b)}${p.tie>.05?` · Tie ${pct(p.tie)}`:''}`;
          el.appendChild(d);
        });
      });
    }
  }

  const priorRender=render;
  render=function(){priorRender();setTimeout(inject,0);};
  setTimeout(inject,0);
})();
