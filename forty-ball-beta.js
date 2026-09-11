/* 40 Ball beta enhancements: round-level lock, manual counted-score toggles, live relative-to-par status. */
(() => {
  state.fortyBallSelections ??= {};

  function fmtRel(v){
    if(v===0)return 'E';
    return v>0?`+${v}`:`${v}`;
  }
  function roundNo(){ return +(sessionStorage.r||1); }
  function groupNo(){ return +(sessionStorage.group||1); }
  function active40(r=roundNo()){ return (state.sideGames?.[r]||'None')==='40 Ball'; }
  function selMap(r,g){
    state.fortyBallSelections ??= {};
    state.fortyBallSelections[r] ??= {};
    state.fortyBallSelections[r][g] ??= {};
    return state.fortyBallSelections[r][g];
  }
  function keyFor(n,h){ return `${n}|${h}`; }
  function groupSummary(r,g){
    const names=roundGroupNames(r,g), map=selMap(r,g), selected=[];
    names.forEach(n=>{
      for(let h=1;h<=18;h++){
        if(!map[keyFor(n,h)])continue;
        const net=netScore(r,n,h);
        if(net===null)continue;
        selected.push({n,h,net,rel:net-PAR[h-1]});
      }
    });
    return {names,count:selected.length,rel:selected.reduce((a,x)=>a+x.rel,0),selected};
  }
  async function persist(r,g,n,h,value){
    save();
    return await apiPost({op:'fortyBallSelection',round:r,group:g,player:n,hole:h,value:!!value});
  }

  function injectScoreToggles(){
    const r=roundNo(), g=groupNo();
    document.querySelectorAll('.forty-ball-beta-note,.forty-ball-toggle').forEach(x=>x.remove());
    if(!active40(r))return;

    const pick=selMap(r,g), summary=groupSummary(r,g);
    const picker=document.querySelector('#scoreSideGame');
    if(picker){
      picker.value='40 Ball';
      const note=document.createElement('div');
      note.className='forty-ball-beta-note callout compact';
      note.innerHTML=`<b>40 Ball is active for the entire round.</b> Both groups must play 40 Ball. Select exactly 40 net hole scores per group. <b>Counted: ${summary.count}/40 · ${fmtRel(summary.rel)}</b>`;
      picker.closest('.side-game-picker')?.insertAdjacentElement('afterend',note);
    }

    document.querySelectorAll('[data-score-player]').forEach(input=>{
      const n=input.dataset.scorePlayer, h=+input.dataset.hole;
      const selected=!!pick[keyFor(n,h)];
      const wrap=document.createElement('div');
      wrap.className='forty-ball-toggle';
      const btn=document.createElement('button');
      btn.type='button';
      btn.className=selected?'forty-ball-select selected':'forty-ball-select';
      btn.setAttribute('data-forty-player',n);
      btn.setAttribute('data-forty-hole',String(h));
      btn.setAttribute('aria-pressed',selected?'true':'false');
      btn.disabled=!input.value;
      btn.textContent=selected?'✓ COUNTED':'Count in 40 Ball';
      wrap.appendChild(btn);
      (input.closest('.score-player')||input.parentElement).appendChild(wrap);
    });
  }

  function replace40BallResults(){
    if(typeof sideGameResults!=='function')return;
    if(sideGameResults.__fortyBallBeta)return;
    const original=sideGameResults;
    const enhanced=function(){
      const r=+(sessionStorage.sideRound||sessionStorage.r||1);
      if((state.sideGames?.[r]||'None')!=='40 Ball')return original();
      const a=groupSummary(r,1), b=groupSummary(r,2);
      const leader=a.rel===b.rel?'Tied':(a.rel<b.rel?'First Group leads':'Second Group leads');
      const roundOpts=ROUNDS.map((x,i)=>`<option value="${i+1}" ${r===i+1?'selected':''}>${x.name}</option>`).join('');
      const panel=(x,g)=>`<section class="side-result-panel"><h3>${g===1?'First':'Second'} Group</h3><p>${x.names.map(n=>n.split(' ')[0]).join(' · ')}</p><div class="side-kpis"><div><strong>${fmtRel(x.rel)}</strong><span>Relative to par</span></div><div><strong>${x.count}/40</strong><span>Scores counted</span></div><div><strong>${Math.max(0,40-x.count)}</strong><span>Still to select</span></div></div><p class="notice">Only scores explicitly marked <b>Counted</b> on the score-entry screen are included. Lower relative-to-par total wins.</p></section>`;
      return layout(`<section class="card"><div class="side-head"><div><div class="eyebrow">ROUND SIDE GAME</div><h2>40 Ball — Live Scoring</h2></div><label>Round<select id="sideRoundSel">${roundOpts}</select></label></div><div class="side-summary"><div><b>Live status</b><span>${leader}</span></div><div><b>Round rule</b><span>One 40 Ball selection applies to both groups. Each group selects exactly 40 of its 72 net hole scores.</span></div></div>${panel(a,1)}${panel(b,2)}</section>`);
    };
    enhanced.__fortyBallBeta=true;
    sideGameResults=enhanced;
  }

  async function handleToggle(target){
    if(!target || target.disabled)return;
    const r=roundNo(), g=groupNo();
    const n=target.getAttribute('data-forty-player');
    const h=+target.getAttribute('data-forty-hole');
    const map=selMap(r,g), k=keyFor(n,h);
    const next=!map[k];
    if(next && groupSummary(r,g).count>=40){
      alert('40 scores are already counted for this group. Unselect one before adding another.');
      return;
    }

    map[k]=next;
    target.setAttribute('aria-pressed',next?'true':'false');
    target.classList.toggle('selected',next);
    target.textContent=next?'✓ COUNTED':'Count in 40 Ball';

    const note=document.querySelector('.forty-ball-beta-note');
    if(note){
      const s=groupSummary(r,g);
      note.innerHTML=`<b>40 Ball is active for the entire round.</b> Both groups must play 40 Ball. Select exactly 40 net hole scores per group. <b>Counted: ${s.count}/40 · ${fmtRel(s.rel)}</b>`;
    }

    await persist(r,g,n,h,next);
  }

  const style=document.createElement('style');
  style.textContent=`
    .forty-ball-toggle{margin-top:8px}
    .forty-ball-select{width:100%;min-height:44px;border:2px solid var(--navy);border-radius:10px;background:#fff;color:var(--navy);font-weight:800;font-size:12px;line-height:1.1;padding:6px 8px;cursor:pointer;touch-action:manipulation;white-space:nowrap}
    .forty-ball-select.selected{background:var(--navy);color:#fff;border-color:var(--navy);font-size:11px;letter-spacing:.01em}
    .forty-ball-select:disabled{opacity:.38;cursor:not-allowed;border-color:var(--line)}
    @media(max-width:760px){
      .forty-ball-select{font-size:11px;padding:5px 6px;min-height:40px}
      .forty-ball-select.selected{font-size:10px}
    }
  `;
  document.head.appendChild(style);

  replace40BallResults();

  document.addEventListener('click',e=>{
    const btn=e.target.closest?.('[data-forty-player]');
    if(!btn)return;
    e.preventDefault();
    e.stopPropagation();
    handleToggle(btn);
  },true);

  const originalRender=render;
  render=function(){
    originalRender();
    injectScoreToggles();
  };

  setTimeout(()=>{
    replace40BallResults();
    injectScoreToggles();
  },0);
})();
