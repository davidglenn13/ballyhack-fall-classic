const PLAYERS=[
{name:'Tyler Bohannon',hi:12.6,ch:15,cottage:2},{name:'Nick Condeni',hi:5.6,ch:6,cottage:1},{name:'David Glenn',hi:11.5,ch:14,cottage:1},{name:'Scott Karl',hi:8.9,ch:10,cottage:2},{name:'Will Long',hi:10.2,ch:12,cottage:2},{name:'Bill McCombs',hi:13.4,ch:16,cottage:2},{name:'Joe Phelan',hi:14.0,ch:17,cottage:1},{name:'Jason Wain',hi:14.7,ch:18,cottage:1}
];
const PAR=[4,5,3,4,4,4,3,4,5,5,4,4,3,4,5,4,3,4];
const SI=[3,11,15,1,5,13,17,9,7,12,14,4,16,6,10,2,18,8];
const ROUNDS=[
{name:'Round 1 · Wed',time:'1:00 / 1:15 PM',first:['David Glenn','Nick Condeni','Bill McCombs','Will Long'],second:['Jason Wain','Joe Phelan','Tyler Bohannon','Scott Karl'],caddie:'Both groups'},
{name:'Round 2 · Thu AM',time:'9:10 / 9:20 AM',first:['Tyler Bohannon','Scott Karl','Bill McCombs','Will Long'],second:['David Glenn','Nick Condeni','Jason Wain','Joe Phelan'],caddie:'First group'},
{name:'Round 3 · Thu Replay',time:'After lunch · variable',first:['Jason Wain','Joe Phelan','Bill McCombs','Will Long'],second:['David Glenn','Nick Condeni','Tyler Bohannon','Scott Karl'],caddie:'None — replay round'},
{name:'Round 4 · Fri',time:'9:00 / 9:10 AM',first:['Nick Condeni','Joe Phelan','Scott Karl','Will Long'],second:['David Glenn','Jason Wain','Tyler Bohannon','Bill McCombs'],caddie:'First group'}
];
const key='ballyhack-fall-classic-2026-v2';
const API='/.netlify/functions/state';

let state=JSON.parse(localStorage.getItem(key)||'null')||{
  scores:{},
  setup:{},
  access:{},
  sideGames:{1:'None',2:'None',3:'None',4:'None'},
  charges:{},
  frozen:false,
  photos:{}
};

state.photos??={};
state.setup??={};
state.access??={};

function save(){
  localStorage.setItem(key,JSON.stringify(state))
}

async function apiPost(payload){
  try{
    const r=await fetch(API,{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify(payload)
    });
    if(!r.ok)throw new Error('API '+r.status);
    return await r.json()
  }catch(e){
    console.warn('Shared sync unavailable',e);
    return null
  }
}

async function loadShared(){
  try{
    const r=await fetch(API,{cache:'no-store'});
    if(!r.ok)throw new Error('API '+r.status);
    const remote=await r.json();

    state={
      ...state,
      ...remote,
      photos:{...(remote.photos||{})},
      setup:{...(remote.setup||{})},
      access:{...(remote.access||{})},
      scores:{...(remote.scores||{})},
      charges:{...(remote.charges||{})},
      sideGames:{
        1:'None',
        2:'None',
        3:'None',
        4:'None',
        ...(remote.sideGames||{})
      }
    };

    save();
    return true
  }catch(e){
    console.warn('Using local fallback',e);
    return false
  }
}

function currentUser(){
  return localStorage.getItem('ballyhack-current-player')||''
}

async function markAccess(){
  const n=currentUser();
  if(n)await apiPost({op:'access',player:n})
}

function strokes(ch,si){
  return Math.floor(ch/18)+(si<=ch%18?1:0)
}

function stableford(gross,par,st){
  if(!gross)return 0;
  const net=gross-st;
  const diff=net-par;
  return diff>=2?0:diff===1?1:diff===0?2:diff===-1?3:diff===-2?4:5
}

function player(n){
  return PLAYERS.find(p=>p.name===n)
}

function initials(n){
  return n.split(' ').map(x=>x[0]).join('').slice(0,2)
}

const DEFAULT_PHOTOS={
  'David Glenn':'assets/David_Glenn.jpg',
  'Tyler Bohannon':'assets/Tyler_Bohannon.jpg',
  'Joe Phelan':'assets/Joe_Phelan.jpg',
  'Scott Karl':'assets/Scott_Karl.jpg',
  'Will Long':'assets/Will_Long.jpg',
  'Nick Condeni':'assets/Nick_Condeni.jpg',
  'Jason Wain':'https://commons.wikimedia.org/wiki/Special:Redirect/file/Lil_Wayne_cropped.jpg',
  'Bill McCombs':'https://i.kym-cdn.com/photos/images/newsfeed/001/794/085/c3e.png'
};

function avatar(n,editable=false){
  const src=state.photos?.[n] || DEFAULT_PHOTOS[n];
  const imgStyle=n==='Jason Wain'
    ?' style="transform:scale(1.55);transform-origin:50% 42%"'
    :'';
  const editMark='';

  return `<button class="player-avatar ${editable?'editable':''}" ${editable?`data-photo-player="${n}" aria-label="Upload photo for ${n}"`:''}>${src?`<img src="${src}" alt="${n}"${imgStyle}>`:`<span>${initials(n)}</span>`}${editMark}</button>`;
}

function roundPoints(r,n){
  let s=state.scores[r]?.[n]||{};
  return PAR.reduce(
    (a,p,i)=>a+stableford(
      +s[i+1]||0,
      p,
      strokes(player(n).ch,SI[i])
    ),
    0
  )
}

function totals(n){
  let rs=[1,2,3,4].map(r=>roundPoints(r,n));
  let played=rs.filter(
    (x,i)=>Object.keys(state.scores[i+1]?.[n]||{}).length>0
  );
  let sorted=[...played].sort((a,b)=>b-a);

  return {
    rounds:rs,
    played,
    best3:sorted.slice(0,3).reduce((a,b)=>a+b,0),
    drop:played.length===4?Math.min(...played):null
  }
}

function leaderboard(){
  return PLAYERS
    .map(p=>({p,...totals(p.name)}))
    .sort(
      (a,b)=>b.best3-a.best3||
      Math.max(...b.rounds)-Math.max(...a.rounds)
    )
}

function completedRounds(){
  let completed=0;

  for(let r=1;r<=4;r++){
    const any=PLAYERS.some(
      p=>Object.keys(state.scores[r]?.[p.name]||{}).length>0
    );
    if(any)completed=r;
  }

  return completed
}

function chaseTotal(x,n){
  if(n<=0)return 0;

  const played=x.rounds.slice(0,n);

  return n<4
    ?played.reduce((a,b)=>a+b,0)
    :[...played].sort((a,b)=>b-a).slice(0,3).reduce((a,b)=>a+b,0)
}

function ranksAfter(n){
  if(n<=0)return {};

  const sorted=PLAYERS
    .map(p=>({name:p.name,...totals(p.name)}))
    .sort((a,b)=>chaseTotal(b,n)-chaseTotal(a,n));

  const ranks={};
  sorted.forEach((x,i)=>ranks[x.name]=i+1);

  return ranks
}

function movementFor(name,n,currentRank){
  if(n<=1)return {delta:0,label:'—',cls:'flat'};

  const prev=ranksAfter(n-1)[name];

  if(!prev)return {delta:0,label:'—',cls:'flat'};

  const delta=prev-currentRank;

  if(delta>0)return {delta,label:`▲ ${delta}`,cls:'up'};
  if(delta<0)return {delta,label:`▼ ${Math.abs(delta)}`,cls:'down'};

  return {delta:0,label:'—',cls:'flat'}
}

function netScore(r,n,h){
  const gross=+(state.scores[r]?.[n]?.[h]||0);

  if(!gross)return null;

  return gross-strokes(player(n).ch,SI[h-1])
}

function roundGroupNames(r,g){
  const rd=ROUNDS[r-1];
  return g===1?rd.first:rd.second
}

function fortyBallGroup(r,g){
  const names=roundGroupNames(r,g);
  const vals=[];

  names.forEach(n=>{
    for(let h=1;h<=18;h++){
      const net=netScore(r,n,h);

      if(net!==null){
        vals.push({n,h,net})
      }
    }
  });

  vals.sort(
    (a,b)=>a.net-b.net||
    a.h-b.h||
    a.n.localeCompare(b.n)
  );

  const counted=vals.slice(0,40);

  return {
    names,
    entered:vals.length,
    counted:counted.length,
    total:counted.reduce((a,x)=>a+x.net,0),
    complete:vals.length===72
  }
}
const NASSAU_SEGMENTS=[
  {label:'Holes 1–5',holes:[1,2,3,4,5],pairing:0},
  {label:'Holes 6–10',holes:[6,7,8,9,10],pairing:1},
  {label:'Holes 11–15',holes:[11,12,13,14,15],pairing:2},
  {label:'Holes 16–18',holes:[16,17,18],pairing:0}
];

function nassauTeams(names,pairing){
  const [a,b,c,d]=names;
  if(pairing===0)return [[a,b],[c,d]];
  if(pairing===1)return [[a,c],[b,d]];
  return [[a,d],[b,c]];
}

function nassauSegment(r,g,seg){
  const names=roundGroupNames(r,g);
  const teams=nassauTeams(names,seg.pairing);

  let aWins=0;
  let bWins=0;
  let halves=0;
  let played=0;

  const holes=seg.holes.map(h=>{
    const aVals=teams[0]
      .map(n=>netScore(r,n,h))
      .filter(v=>v!==null);

    const bVals=teams[1]
      .map(n=>netScore(r,n,h))
      .filter(v=>v!==null);

    if(aVals.length<2||bVals.length<2){
      return {h,status:'pending'};
    }

    const a=Math.min(...aVals);
    const b=Math.min(...bVals);

    played++;

    if(a<b){
      aWins++;
      return {h,a,b,status:'a'};
    }

    if(b<a){
      bWins++;
      return {h,a,b,status:'b'};
    }

    halves++;
    return {h,a,b,status:'half'};
  });

  let status='Not started';

  if(played){
    const margin=aWins-bWins;

    status=margin===0
      ?'All square'
      :`${margin>0
        ?teams[0].map(x=>x.split(' ')[0]).join('/')
        :teams[1].map(x=>x.split(' ')[0]).join('/')} ${Math.abs(margin)} up`;
  }

  if(played===seg.holes.length){
    status=aWins===bWins
      ?'Halved'
      :aWins>bWins
        ?`${teams[0].map(x=>x.split(' ')[0]).join('/')} win`
        :`${teams[1].map(x=>x.split(' ')[0]).join('/')} win`;
  }

  return {
    teams,
    aWins,
    bWins,
    halves,
    played,
    total:seg.holes.length,
    status,
    holes
  };
}

function sideGameResults(){
  const r=+(sessionStorage.sideRound||sessionStorage.r||1);
  const game=state.sideGames[r]||'None';

  const roundOpts=ROUNDS.map((x,i)=>
    `<option value="${i+1}" ${r===i+1?'selected':''}>${x.name}</option>`
  ).join('');

  let body='';

  if(game==='40 Ball'){
    const groups=[1,2].map(g=>fortyBallGroup(r,g));
    const final=groups.every(x=>x.complete);

    const lead=groups[0].total===groups[1].total
      ?'Tied'
      :(groups[0].total<groups[1].total
        ?'First Group leads'
        :'Second Group leads');

    body=`
      <div class="side-summary">
        <div>
          <b>${final?'Final':'Live'} status</b>
          <span>${lead}</span>
        </div>
        <div>
          <b>Rule</b>
          <span>Lowest 40 net scores from the foursome's 72 hole scores count.</span>
        </div>
      </div>

      ${groups.map((x,i)=>`
        <section class="side-result-panel">
          <h3>${i===0?'First':'Second'} Group</h3>
          <p>${x.names.map(n=>n.split(' ')[0]).join(' · ')}</p>

          <div class="side-kpis">
            <div>
              <strong>${x.counted}</strong>
              <span>Counted</span>
            </div>

            <div>
              <strong>${x.entered}/72</strong>
              <span>Scores entered</span>
            </div>

            <div>
              <strong>${x.entered?x.total:'—'}</strong>
              <span>${x.complete
                ?'Final 40-ball total'
                :'Current low-score total'}</span>
            </div>
          </div>

          ${!x.complete
            ?`<p class="notice">
                Live total uses the lowest ${x.counted} net scores entered so far.
                Final result locks when all 72 net hole scores are available.
              </p>`
            :''}
        </section>
      `).join('')}
    `;

  }else if(game==='Nassau 5-5-5-3'){

    body=[1,2].map(g=>{
      const names=roundGroupNames(r,g);

      return `
        <section class="side-result-panel">
          <h3>${g===1?'First':'Second'} Group</h3>
          <p>${names.map(n=>n.split(' ')[0]).join(' · ')}</p>

          <div class="nassau-grid">
            ${NASSAU_SEGMENTS.map(seg=>{
              const x=nassauSegment(r,g,seg);

              return `
                <div class="nassau-segment">
                  <b>${seg.label}</b>

                  <span>
                    ${x.teams[0].map(n=>n.split(' ')[0]).join(' + ')}
                    vs
                    ${x.teams[1].map(n=>n.split(' ')[0]).join(' + ')}
                  </span>

                  <strong>${x.status}</strong>

                  <small>
                    ${x.played}/${x.total} holes complete ·
                    ${x.aWins}-${x.bWins}
                    ${x.halves?` · ${x.halves} halved`:''}
                  </small>
                </div>
              `;
            }).join('')}
          </div>
        </section>
      `;
    }).join('');

  }else{

    body=`
      <div class="callout">
        <b>No side game selected for this round.</b><br>
        Choose 40 Ball or Nassau 5-5-5-3 on the Score screen.
        The same gross scores will automatically feed both Stableford
        and the selected side-game results.
      </div>
    `;
  }

  return layout(`
    <section class="card">
      <div class="side-head">
        <div>
          <div class="eyebrow">ROUND SIDE GAME</div>
          <h2>Side Game Results</h2>
        </div>

        <label>
          Round
          <select id="sideRoundSel">${roundOpts}</select>
        </label>
      </div>

      <div class="side-game-name">
        <b>${game}</b>
      </div>

      ${body}
    </section>
  `);
}

function cottageRound(c,r){
  let vals=PLAYERS
    .filter(p=>p.cottage===c)
    .map(p=>roundPoints(r,p.name))
    .sort((a,b)=>b-a);

  return vals.slice(0,3).reduce((a,b)=>a+b,0);
}

function cottageTotal(c){
  return [1,2,3,4].reduce((a,r)=>a+cottageRound(c,r),0);
}

const tabs=[
  'Score',
  'Live Standings',
  'Chase',
  'Cottage Cup',
  'Side Games'
];

let tab=new URLSearchParams(location.search).get('admin')==='1'
  ?'More'
  :'Score';

function initNav(){
  let n=document.querySelector('#nav');

  n.innerHTML=tabs
    .map(t=>`<button data-tab="${t}">${t}</button>`)
    .join('');

  n.onclick=e=>{
    if(e.target.dataset.tab){
      tab=e.target.dataset.tab;
      render();
    }
  };
}

function layout(inner){
  return `<div class="grid">${inner}</div>`;
}

function home(){
  let top=leaderboard()[0];

  return layout(`
    <section class="card half">
      <img class="hero-img" src="assets/course.png">

      <h2 style="margin-top:12px">
        Ballyhack Fall Classic Cup
      </h2>

      <p>
        Four championship rounds.
        Best three Net Stableford totals count.
        The lowest round is automatically dropped.
      </p>

      <div class="callout">
        <b>Live scoring expected:</b>
        each group should enter scores through this site
        during every tournament round.
      </div>
    </section>

    <section class="card half">
      <h2>At a Glance</h2>

      <div class="kpi">$1,600</div>
      <div class="muted">Total competition pool</div>

      <p>
        <span class="badge">1st $600</span>
        <span class="badge">2nd $400</span>
        <span class="badge">3rd $200</span>
        <span class="badge red">Cottage Cup $400</span>
      </p>

      <p>
        <b>Blue Ridge:</b>
        6,170 yards · Par 72 · 71.0 / 146
      </p>

      <p>
        <b>Current leader:</b>
        ${top.best3
          ?top.p.name+' · '+top.best3+' pts'
          :'Scoring not started'}
      </p>
    </section>

    <section class="card">
      <h2>Wednesday Arrival</h2>

      <p>
        Plan to arrive with enough time to get settled,
        have lunch, and warm up before the 1:00 PM opening tee time.
        Actual cottage numbers will be assigned at check-in.
      </p>
    </section>
  `);
}

function score(){
  let r=+(sessionStorage.r||1);
  let group=+(sessionStorage.group||1);
  let h=+(sessionStorage.hole||1);

  const rd=ROUNDS[r-1];
  const names=group===1?rd.first:rd.second;

  const par=PAR[h-1];
  const si=SI[h-1];
  const sideGame=state.sideGames[r]||'None';

  const playerRows=names.map(n=>{
    const p=player(n);
    const st=strokes(p.ch,si);
    const scores=state.scores[r]?.[n]||{};
    const g=+scores[h]||0;
    const pts=stableford(g,par,st);

    return `
      <div class="score-player">

        <div class="score-player-ident">
          ${avatar(n,true)}

          <div class="score-player-name">
            <b>${n}</b>

            <span>
              CH ${p.ch} ·
              ${st
                ?st+' stroke'+(st>1?'s':'')
                :'no stroke'}
            </span>
          </div>
        </div>

        <input
          class="score-input"
          inputmode="numeric"
          type="number"
          min="1"
          max="12"
          value="${g||''}"
          data-score-player="${n}"
          data-hole="${h}"
          aria-label="${n} gross score hole ${h}"
        >

        <div class="score-result">
          ${g
            ?`Net ${g-st} · <b>${pts} pts</b>`
            :'Enter gross'}
        </div>

        <div class="round-running">
          Round: ${roundPoints(r,n)} pts
        </div>
      </div>
    `;
  }).join('');

  return layout(`
    <section class="card scoring-card">

      <div class="scoring-head">
        <div>
          <div class="eyebrow">
            PRIMARY TOURNAMENT WORKFLOW
          </div>

          <h2>Enter Scores</h2>

        </div>

        <div class="live-badge">
          LIVE SCORING
        </div>
      </div>

      <div class="score-controls">

        <label>
          Round

          <select id="roundSel">
            ${ROUNDS.map((x,i)=>`
              <option
                value="${i+1}"
                ${r===i+1?'selected':''}
              >
                ${x.name}
              </option>
            `).join('')}
          </select>
        </label>

        <label>
          Group

          <select id="groupSel">
            <option
              value="1"
              ${group===1?'selected':''}
            >
              First Group
            </option>

            <option
              value="2"
              ${group===2?'selected':''}
            >
              Second Group
            </option>
          </select>
        </label>

      </div>

      <div class="side-game-picker">

        <div>
          <div class="eyebrow">
            SIDE GAME FOR THIS ROUND
          </div>

          <select id="scoreSideGame">

            <option
              ${sideGame==='None'?'selected':''}
            >
              None
            </option>

            <option
              ${sideGame==='40 Ball'?'selected':''}
            >
              40 Ball
            </option>

            <option
              ${sideGame==='Nassau 5-5-5-3'?'selected':''}
            >
              Nassau 5-5-5-3
            </option>

          </select>
        </div>

        <button
          class="secondary"
          type="button"
          data-view-side-results="${r}"
        >
          View Side Game Results
        </button>

      </div>

      <div class="hole-focus">

        <button
          class="hole-nav"
          id="prevHole"
          ${h===1?'disabled':''}
        >
          ‹
        </button>

        <div>
          <div class="hole-number">
            Hole ${h}
          </div>

          <div class="hole-meta">
            Par ${par} · Stroke Index ${si}
          </div>
        </div>

        <button
          class="hole-nav"
          id="nextHole"
          ${h===18?'disabled':''}
        >
          ›
        </button>

      </div>

      <div class="group-score-grid">
        ${playerRows}
      </div>

      <div class="score-actions">

        <button
          class="secondary"
          id="prevHoleBottom"
          ${h===1?'disabled':''}
        >
          ← Previous
        </button>

        <span class="hole-progress">
          ${h} / 18
        </span>

        <button
          class="primary"
          id="nextHoleBottom"
          ${h===18?'disabled':''}
        >
          Next Hole →
        </button>

      </div>

      <div class="callout compact">
        <b>Stableford round total:</b>
        ${names
          .map(n=>`${n.split(' ')[0]} ${roundPoints(r,n)}`)
          .join(' · ')}
      </div>

    </section>

  `);
}
function board(){
  const n=completedRounds();

  let rows=leaderboard().map((x,i)=>{
    const m=movementFor(x.p.name,n,i+1);

    return `
      <tr class="${i<3?'winner':''}">
        <td><span class="rank">${i+1}</span></td>

        <td>
          <div class="board-player">
            ${avatar(x.p.name)}
            <span>${x.p.name}</span>
          </div>
        </td>

        <td><b>${m.label}</b></td>

        <td><b>${x.best3}</b></td>

        ${x.rounds.slice(0,3).map(v=>`<td>${v||'—'}</td>`).join('')}

        <td>${x.drop??'—'}</td>
      </tr>
    `;
  }).join('');

  return layout(`
    <section class="card">
      <h2>Live Individual Standings</h2>

      <div class="callout">
        <b>Movement:</b>
        ▲ places gained · ▼ places lost · — no change since the previous completed round.
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Pos</th>
              <th>Golfer</th>
              <th>Movement</th>
              <th>Best 3</th>
              <th>R1</th>
              <th>R2</th>
              <th>R3</th>
              <th>Dropped</th>
            </tr>
          </thead>

          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    </section>
  `);
}

function cottage(){
  let c1=[1,2,3,4].map(r=>cottageRound(1,r));
  let c2=[1,2,3,4].map(r=>cottageRound(2,r));

  let t1=cottageTotal(1);
  let t2=cottageTotal(2);

  return layout(`
    <section class="card half">
      <h2>Cottage 1</h2>
      <div class="cottage-player-list">
        ${PLAYERS.filter(p=>p.cottage===1).map(p=>`
          <div class="cottage-player">
            ${avatar(p.name)}
            <span>${p.name.split(' ').pop()}</span>
          </div>
        `).join('')}
      </div>

      <div class="kpi">${t1}</div>

      <div class="muted">
        Best 3 of 4 each round · all rounds count
      </div>

      ${c1.map((x,i)=>`
        <div class="segment">
          <b>R${i+1}</b>
          <span>${x} pts</span>
        </div>
      `).join('')}
    </section>

    <section class="card half">
      <h2>Cottage 2</h2>
      <div class="cottage-player-list">
        ${PLAYERS.filter(p=>p.cottage===2).map(p=>`
          <div class="cottage-player">
            ${avatar(p.name)}
            <span>${p.name.split(' ').pop()}</span>
          </div>
        `).join('')}
      </div>

      <div class="kpi">${t2}</div>

      <div class="muted">
        Best 3 of 4 each round · all rounds count
      </div>

      ${c2.map((x,i)=>`
        <div class="segment">
          <b>R${i+1}</b>
          <span>${x} pts</span>
        </div>
      `).join('')}
    </section>
  `);
}

function chase(){
  const n=completedRounds();

  const L=PLAYERS
    .map(p=>({p,...totals(p.name)}))
    .sort((a,b)=>chaseTotal(b,n)-chaseTotal(a,n));

  const leader=n?chaseTotal(L[0],n):0;

  let stageTitle='CHASE FOR THE CUP — READY';
  let stageCopy='Progress will appear here after Round 1 and update after every championship round.';

  if(n===1){
    stageTitle='CHASE FOR THE CUP — AFTER ROUND 1';
    stageCopy='Opening standings show each golfer’s Round 1 points, current position, and points behind the leader.';
  }

  if(n===2){
    stageTitle='CHASE FOR THE CUP — AFTER ROUND 2';
    stageCopy='Standings update with the two-round cumulative total, position in the race, and points behind the leader.';
  }

  if(n===3){
    stageTitle='CHASE FOR THE CUP — FINAL ROUND';
    stageCopy='After Round 3, the dashboard adds the vulnerable round plus Friday targets and Path to the Podium for 1st, 2nd, and 3rd.';
  }

  if(n===4){
    stageTitle='CHASE FOR THE CUP — FINAL RESULTS';
    stageCopy='Final standings use each golfer’s best three of four Stableford rounds. The lowest round is dropped automatically.';
  }

  const podium=L.slice(0,3).map(x=>chaseTotal(x,n));

  const rows=L.map((x,i)=>{
    const current=chaseTotal(x,n);
    const behind=n?Math.max(0,leader-current):0;
    const played=x.rounds.slice(0,n);
    const vuln=n===3
      ?Math.min(...played)
      :(n===4?x.drop:null);

    let targets='<td>—</td><td>—</td><td>—</td>';

    if(n===3){
      const base=played.reduce((a,b)=>a+b,0)-Math.min(...played);

      const need1=Math.max(0,(podium[0]||0)-base+1);
      const need2=Math.max(0,(podium[1]||0)-base+1);
      const need3=Math.max(0,(podium[2]||0)-base+1);

      targets=`
        <td>${need1||'—'}</td>
        <td>${need2||'—'}</td>
        <td>${need3||'—'}</td>
      `;
    }

    const m=movementFor(x.p.name,n,i+1);

    return `
      <tr>
        <td><span class="rank">${i+1}</span></td>

        <td>
          <div class="board-player">
            ${avatar(x.p.name)}
            <span>${x.p.name}</span>
          </div>
        </td>

        <td><b>${m.label}</b></td>
        <td>${played.length?played.join(' / '):'—'}</td>
        <td><b>${current||'—'}</b></td>
        <td>${behind||'—'}</td>
        <td>${vuln??'—'}</td>

        ${targets}
      </tr>
    `;
  }).join('');

  return layout(`
    <section class="card">

      <h2 class="red">${stageTitle}</h2>

      <p>${stageCopy}</p>

      <div class="callout">
        <b>Movement:</b>
        ▲ shows places gained,
        ▼ shows places lost,
        and — means no change since the previous completed round.

        <br>

        <b>Progress cadence:</b>
        Round 1 opening standings →
        Round 2 cumulative race →
        Round 3 final-round targets →
        Round 4 official best-3 results.
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Pos</th>
              <th>Golfer</th>
              <th>Movement</th>
              <th>Rounds</th>
              <th>Chase Total</th>
              <th>Behind</th>
              <th>Vulnerable / Dropped</th>
              <th>Need for 1st</th>
              <th>Need for 2nd</th>
              <th>Need for 3rd</th>
            </tr>
          </thead>

          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>

    </section>
  `);
}

function trip(){
  return layout(`
    <section class="card">
      <h2>Pairings & Tee Times</h2>

      ${ROUNDS.map((r,i)=>`
        <h3>${r.name} · ${r.time}</h3>

        <div class="pairing">

          <div class="team">
            <strong>First Group</strong>
            <br>
            ${r.first.join('<br>')}
          </div>

          <div class="team">
            <strong>Second Group</strong>
            <br>
            ${r.second.join('<br>')}
          </div>

        </div>

        <p class="muted">
          Forecaddie: ${r.caddie}
        </p>
      `).join('')}
    </section>

    <section class="card half">
      <h2>Daylight</h2>
      <p>Wed 9/30 · 7:14 AM / 7:04 PM</p>
      <p>Thu 10/1 · 7:15 AM / 7:02 PM</p>
      <p>Fri 10/2 · ~7:16 AM / ~7:01 PM</p>
    </section>

    <section class="card half">
      <h2>Side Games</h2>

      <p>
        Select the side game directly on the Score screen for each round.
        Gross scores entered for Stableford automatically feed
        the live side-game calculation.
      </p>

      <button
        class="secondary"
        type="button"
        data-goto="Side Games"
      >
        View Side Game Results
      </button>

      <p class="notice">
        40 Ball counts the lowest 40 net scores
        from each foursome's 72 hole scores.
        Nassau uses rotating two-player teams
        over 5-5-5-3 hole segments.
      </p>
    </section>
  `);
}

function settlement(){
  let L=leaderboard();
  let indiv={};

  if(L[0])indiv[L[0].p.name]=600;
  if(L[1])indiv[L[1].p.name]=400;
  if(L[2])indiv[L[2].p.name]=200;

  let winC=cottageTotal(1)===cottageTotal(2)
    ?0
    :(cottageTotal(1)>cottageTotal(2)?1:2);

  let rows=PLAYERS.map(p=>{
    let charge=+(state.charges[p.name]||0);

    let credit=
      (indiv[p.name]||0)+
      (winC===p.cottage?100:0);

    let owed=charge+200-credit;

    return `
      <tr>
        <td>${p.name}</td>

        <td>
          <input
            style="width:110px"
            type="number"
            data-charge="${p.name}"
            value="${charge||''}"
            placeholder="Trip share"
          >
        </td>

        <td>$200</td>
        <td>$${credit}</td>
        <td><b>$${owed}</b></td>
      </tr>
    `;
  }).join('');

  return layout(`
    <section class="card">
      <h2>Trip Settlement</h2>

      <p>
        Enter each golfer's applicable Ballyhack trip share.
        Pro Shop merchandise and personal retail are excluded.
      </p>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Golfer</th>
              <th>Trip charges</th>
              <th>Entry</th>
              <th>Credits</th>
              <th>Final owed</th>
            </tr>
          </thead>

          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    </section>
  `);
}

function admin(){
  let done=PLAYERS.filter(p=>state.setup[p.name]).length;

  return layout(`
    <section class="card half">
      <h2>Setup Tracker</h2>

      <div class="kpi">
        ${done} of 8
      </div>

      <div class="muted">
        Website shortcut confirmed
      </div>

      ${PLAYERS.map(p=>`
        <div class="setup-row">
          <span>${p.name}</span>

          <button
            class="${state.setup[p.name]?'secondary':'primary'}"
            data-setup="${p.name}"
          >
            ${state.setup[p.name]
              ?'Completed'
              :'Confirm Setup'}
          </button>
        </div>
      `).join('')}
    </section>

    <section class="card half">
      <h2>Admin Controls</h2>

      <p>
        <b>Handicap state:</b>
        ${state.frozen
          ?'Official indexes frozen'
          :'Provisional build indexes'}
      </p>

      <button
        class="primary"
        id="freeze"
      >
        ${state.frozen
          ?'Unfreeze Demo'
          :'Freeze Indexes'}
      </button>

      <button
        class="secondary"
        id="reset"
      >
        Reset Demo Data
      </button>

      <p class="notice">
        Live tournament data is synchronized through
        the shared Netlify database.
      </p>
    </section>
  `);
}

function more(){
  return layout(`
    <section class="card">
      <h2>Tournament Information</h2>

      <p class="muted">
        Scoring and standings are the primary website functions.
        Supporting trip information and administration are kept here.
      </p>
    </section>

    ${home()}
    ${trip()}
    ${settlement()}
    ${admin()}
  `);
}

function render(){
  document.querySelectorAll('nav button').forEach(
    b=>b.classList.toggle(
      'active',
      b.dataset.tab===tab
    )
  );

  let fn={
    'Score':score,
    'Live Standings':board,
    'Chase':chase,
    'Cottage Cup':cottage,
    'Side Games':sideGameResults,
    'More':more
  }[tab]||score;

  document.querySelector('#app').innerHTML=fn();

  bind();
}

function bind(){

  document.querySelector('#roundSel')
    ?.addEventListener('change',e=>{
      sessionStorage.r=e.target.value;
      sessionStorage.hole=1;
      render();
    });

  document.querySelector('#groupSel')
    ?.addEventListener('change',e=>{
      sessionStorage.group=e.target.value;
      sessionStorage.hole=1;
      render();
    });

  document.querySelector('#scoreSideGame')
    ?.addEventListener('change',e=>{
      let r=+(sessionStorage.r||1);

      state.sideGames[r]=e.target.value;
      save();

      apiPost({
        op:'sideGame',
        round:r,
        value:e.target.value
      });

      render();
    });

  document.querySelector('#sideRoundSel')
    ?.addEventListener('change',e=>{
      sessionStorage.sideRound=e.target.value;
      render();
    });

  document.querySelectorAll('[data-view-side-results]')
    .forEach(b=>b.onclick=e=>{
      sessionStorage.sideRound=
        e.currentTarget.dataset.viewSideResults||
        sessionStorage.r||
        1;

      tab='Side Games';

      render();
    });

  document.querySelectorAll('[data-score-player]')
    .forEach(x=>x.addEventListener('change',e=>{
      let r=+(sessionStorage.r||1);
      let n=e.target.dataset.scorePlayer;

      state.scores[r]??={};
      state.scores[r][n]??={};

      state.scores[r][n][e.target.dataset.hole]=
        e.target.value;

      save();

      apiPost({
        op:'score',
        round:r,
        player:n,
        hole:+e.target.dataset.hole,
        gross:+e.target.value
      });

      render();
    }));

  const goHole=d=>{
    let h=+(sessionStorage.hole||1);

    sessionStorage.hole=
      Math.max(1,Math.min(18,h+d));

    render();
  };

  document.querySelector('#prevHole')
    ?.addEventListener('click',()=>goHole(-1));

  document.querySelector('#nextHole')
    ?.addEventListener('click',()=>goHole(1));

  document.querySelector('#prevHoleBottom')
    ?.addEventListener('click',()=>goHole(-1));

  document.querySelector('#nextHoleBottom')
    ?.addEventListener('click',()=>goHole(1));

  document.querySelectorAll('[data-goto]')
    .forEach(b=>b.onclick=e=>{
      tab=e.target.dataset.goto;
      render();
    });

  document.querySelectorAll('[data-charge]')
    .forEach(i=>i.onchange=e=>{
      state.charges[e.target.dataset.charge]=
        e.target.value;

      save();

      apiPost({
        op:'charge',
        player:e.target.dataset.charge,
        amount:+e.target.value||0
      });

      render();
    });

  document.querySelectorAll('[data-setup]')
    .forEach(b=>b.onclick=e=>{
      let n=e.target.dataset.setup;

      if(!state.setup[n]){
        state.setup[n]=new Date().toISOString();
        save();
        apiPost({op:'setup',player:n});
      }

      render();
    });

  document.querySelectorAll('[data-photo-player]')
    .forEach(b=>b.onclick=e=>{
      const n=e.currentTarget.dataset.photoPlayer;

      const input=document.createElement('input');

      input.type='file';
      input.accept='image/*';

      input.onchange=()=>{
        const f=input.files?.[0];

        if(!f)return;

        const img=new Image();
        const r=new FileReader();

        r.onload=()=>{
          img.onload=()=>{
            const c=document.createElement('canvas');

            c.width=c.height=180;

            const ctx=c.getContext('2d');

            const scale=Math.max(
              180/img.width,
              180/img.height
            );

            const w=img.width*scale;
            const h=img.height*scale;

            ctx.drawImage(
              img,
              (180-w)/2,
              (180-h)/2,
              w,
              h
            );

            state.photos[n]=
              c.toDataURL('image/jpeg',0.78);

            save();

            apiPost({
              op:'photo',
              player:n,
              photo:state.photos[n]
            });

            render();
          };

          img.src=r.result;
        };

        r.readAsDataURL(f);
      };

      input.click();
    });

  document.querySelector('#freeze')
    ?.addEventListener('click',()=>{
      state.frozen=!state.frozen;
      save();

      apiPost({
        op:'frozen',
        value:state.frozen
      });

      render();
    });

  document.querySelector('#reset')
    ?.addEventListener('click',()=>{
      if(confirm('Clear all scores and demo data?')){
        localStorage.removeItem(key);

        apiPost({op:'reset'})
          .finally(()=>location.reload());
      }
    });
}

function identityGate(){

  if(currentUser())return;

  const overlay=document.createElement('div');

  overlay.className='identity-overlay';

  overlay.innerHTML=`
    <div class="identity-card">

      <img
        src="assets/ballyhack-logo.png"
        alt="Ballyhack"
      >

      <h2>
        Who is using this phone?
      </h2>

      <p>
        Select your name once so the tournament can record
        site access and shortcut setup status.
      </p>

      <select id="identitySelect">

        <option value="">
          Select golfer
        </option>

        ${PLAYERS.map(p=>`
          <option>${p.name}</option>
        `).join('')}

      </select>

      <button
        class="primary"
        id="identitySave"
      >
        Continue
      </button>

    </div>
  `;

  document.body.appendChild(overlay);

  overlay.querySelector('#identitySave').onclick=async()=>{
    const n=overlay
      .querySelector('#identitySelect')
      .value;

    if(!n)return;

    localStorage.setItem(
      'ballyhack-current-player',
      n
    );

    overlay.remove();

    await markAccess();
  };
}

const sideStyle=document.createElement('style');

sideStyle.textContent=`
.side-game-picker{
  display:flex;
  gap:12px;
  align-items:end;
  justify-content:space-between;
  border:1px solid var(--line);
  background:#f8fafc;
  border-radius:12px;
  padding:12px;
  margin:12px 0
}

.side-game-picker>div{
  flex:1;
  min-width:0
}

.side-game-picker select{
  width:100%;
  margin-top:5px;
  font-weight:800;
  color:var(--navy)
}

.side-game-picker button{
  min-height:42px
}

.side-head{
  display:flex;
  justify-content:space-between;
  gap:14px;
  align-items:end
}

.side-head label{
  font-size:12px;
  font-weight:800;
  color:var(--muted)
}

.side-head select{
  display:block;
  margin-top:5px;
  min-width:180px
}

.side-game-name{
  display:inline-block;
  margin:12px 0;
  background:var(--navy);
  color:#fff;
  padding:7px 10px;
  border-radius:999px;
  font-size:12px
}

.side-summary{
  display:grid;
  grid-template-columns:1fr 2fr;
  gap:10px;
  margin:8px 0 14px
}

.side-summary>div{
  border:1px solid var(--line);
  border-radius:10px;
  padding:10px;
  background:#f8fafc
}

.side-summary b,
.side-summary span{
  display:block
}

.side-summary span{
  margin-top:4px;
  font-size:13px
}

.side-result-panel{
  border-top:1px solid var(--line);
  padding:14px 0
}

.side-result-panel:last-child{
  padding-bottom:0
}

.side-result-panel h3{
  margin-bottom:4px
}

.side-result-panel p{
  margin:4px 0 10px
}

.side-kpis{
  display:grid;
  grid-template-columns:repeat(3,1fr);
  gap:8px
}

.side-kpis>div{
  background:#f8fafc;
  border:1px solid var(--line);
  border-radius:10px;
  padding:10px;
  text-align:center
}

.side-kpis strong{
  display:block;
  font-size:22px;
  color:var(--navy)
}

.side-kpis span{
  font-size:11px;
  color:var(--muted)
}

.nassau-grid{
  display:grid;
  grid-template-columns:repeat(2,1fr);
  gap:8px
}

.nassau-segment{
  border:1px solid var(--line);
  border-radius:10px;
  padding:10px;
  background:#f8fafc
}

.nassau-segment b,
.nassau-segment span,
.nassau-segment strong,
.nassau-segment small{
  display:block
}

.nassau-segment span{
  font-size:12px;
  margin:4px 0
}

.nassau-segment strong{
  color:var(--navy);
  margin:4px 0
}

.nassau-segment small{
  color:var(--muted)
}

@media(max-width:760px){

  .side-game-picker{
    align-items:stretch;
    flex-direction:column
  }

  .side-game-picker button{
    width:100%
  }

  .side-head{
    align-items:stretch;
    flex-direction:column
  }

  .side-head select{
    width:100%;
    min-width:0
  }

  .side-summary{
    grid-template-columns:1fr
  }

  .side-kpis{
    grid-template-columns:1fr 1fr 1fr
  }

  .nassau-grid{
    grid-template-columns:1fr
  }
}
`;

document.head.appendChild(sideStyle);

initNav();

loadShared().finally(()=>{
  render();
  identityGate();
  markAccess();
});

setInterval(async()=>{
  if(document.visibilityState==='visible'){
    const ok=await loadShared();
    if(ok)render();
  }
},15000);

if('serviceWorker' in navigator){
  navigator.serviceWorker
    .register('sw.js')
    .catch(()=>{});
}
