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
      note.className='forty-ball-beta-note';
      note.innerHTML=`<div class="forty-tracker-title">40 Ball Tracker</div><div class="forty-tracker-stats"><div><strong>${summary.count}/40</strong><span>Scores</span></div><div><strong>${fmtRel(summary.rel)}</strong><span>Relative to Par</span></div></div>`;
      picker.closest('.side-game-picker')?.insertAdjacentElement('afterend',note);
    }

    document.querySelectorAll('[data-score-player]').forEach(input=>{
      const n=input.dataset.scorePlayer, h=+input.dataset.hole;
      const selected=!!input.value && !!pick[keyFor(n,h)];
      const wrap=document.createElement('div');
      wrap.className='forty-ball-toggle';
      const btn=document.createElement('button');
      btn.type='button';
      btn.className=selected?'forty-ball-select selected':'forty-ball-select';
      btn.setAttribute('data-forty-player',n);
      btn.setAttribute('data-forty-hole',String(h));
      btn.setAttribute('aria-pressed',selected?'true':'false');
      btn.disabled=!input.value;
      btn.textContent=selected?'✓ Counted':'Count in 40 Ball';
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
      const panel=(x,g)=>`<section class="side-result-panel"><h3>${g===1?'First':'Second'} Group</h3><p>${x.names.map(n=>n.split(' ')[0]).join(' · ')}</p><div class="side-kpis"><div><strong>${fmtRel(x.rel)}</strong><span>Relative to Par</span></div><div><strong>${x.count}/40</strong><span>Scores Counted</span></div><div><strong>${Math.max(0,40-x.count)}</strong><span>Still to Select</span></div></div><p class="notice">Only scores explicitly marked <b>Counted</b> on the score-entry screen are included. Lower relative-to-par total wins.</p></section>`;
      return layout(`<section class="card"><div class="side-head"><div><div class="eyebrow">ROUND SIDE GAME</div><h2>40 Ball — Live Scoring</h2></div><label>Round<select id="sideRoundSel">${roundOpts}</select></label></div><div class="side-summary"><div><b>Live Status</b><span>${leader}</span></div><div><b>Round Rule</b><span>One 40 Ball selection applies to both groups. Each group selects exactly 40 of its 72 net hole scores.</span></div></div>${panel(a,1)}${panel(b,2)}</section>`);
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
    target.textContent=next?'✓ Counted':'Count in 40 Ball';

    const note=document.querySelector('.forty-ball-beta-note');
    if(note){
      const s=groupSummary(r,g);
      note.innerHTML=`<div class="forty-tracker-title">40 Ball Tracker</div><div class="forty-tracker-stats"><div><strong>${s.count}/40</strong><span>Scores</span></div><div><strong>${fmtRel(s.rel)}</strong><span>Relative to Par</span></div></div>`;
    }

    await persist(r,g,n,h,next);
  }

  const style=document.createElement('style');
  style.textContent=`
    .forty-ball-beta-note{grid-column:span 12;width:100%;margin:16px 0 0;padding:16px 18px;border:1px solid rgba(23,54,93,.16);border-left:6px solid var(--red);border-radius:14px;background:linear-gradient(135deg,#fff7f7,#fff);box-shadow:0 5px 16px rgba(23,54,93,.07);color:var(--navy)}
    .forty-tracker-title{font-size:14px;font-weight:900;letter-spacing:.1em;text-transform:uppercase;color:var(--red);margin-bottom:10px}
    .forty-tracker-stats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
    .forty-tracker-stats>div{display:flex;align-items:baseline;justify-content:space-between;gap:8px;padding:10px 12px;border:1px solid var(--line);border-radius:10px;background:#fff}
    .forty-tracker-stats strong{font-size:22px;line-height:1;color:var(--navy)}
    .forty-tracker-stats span{font-size:11px;font-weight:800;color:var(--muted);text-align:right}
    .forty-ball-toggle{margin-top:8px}
    .forty-ball-select{
      width:100%;
      min-height:52px;
      border:2px solid var(--navy);
      border-radius:10px;
      background:#fff;
      color:var(--navy);
      font-weight:800;
      font-size:13px;
      line-height:1.15;
      padding:7px 6px;
      cursor:pointer;
      touch-action:manipulation;
      -webkit-tap-highlight-color:transparent;
      user-select:none;
      white-space:normal;
      overflow-wrap:normal;
      word-break:normal;
      text-align:center;
      display:flex;
      align-items:center;
      justify-content:center;
    }
    .forty-ball-select.selected{
      background:var(--navy);
      color:#fff;
      border-color:var(--navy);
      font-size:11px;
      letter-spacing:0;
      white-space:nowrap;
      overflow-wrap:normal;
      word-break:keep-all;
      padding-left:4px;
      padding-right:4px;
    }
    .forty-ball-select:disabled{opacity:.75;cursor:not-allowed;border-color:var(--line)}
    @media(max-width:760px){
      .forty-ball-beta-note{padding:14px;margin-top:14px}
      .forty-tracker-stats{gap:8px}
      .forty-tracker-stats>div{display:grid;gap:4px;padding:10px}
      .forty-tracker-stats strong{font-size:20px}
      .forty-tracker-stats span{text-align:left;font-size:10px}
      .forty-ball-select{
        font-size:12px;
        line-height:1.15;
        padding:7px 5px;
        min-height:54px;
      }
      .forty-ball-select.selected{
        font-size:10px;
        white-space:nowrap;
        letter-spacing:-.01em;
        padding-left:3px;
        padding-right:3px;
      }
    }
  `;
  document.head.appendChild(style);

  replace40BallResults();

  let lastTouchTap=0;
  function delegatedToggle(e){
    const btn=e.target.closest?.('[data-forty-player]');
    if(!btn)return false;
    e.preventDefault();
    e.stopPropagation();
    handleToggle(btn);
    return true;
  }

  document.addEventListener('pointerup',e=>{
    if(e.pointerType!=='touch' && e.pointerType!=='pen')return;
    if(delegatedToggle(e))lastTouchTap=Date.now();
  },true);

  document.addEventListener('click',e=>{
    if(Date.now()-lastTouchTap<700){
      const btn=e.target.closest?.('[data-forty-player]');
      if(btn){e.preventDefault();e.stopPropagation();}
      return;
    }
    delegatedToggle(e);
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
