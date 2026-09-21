import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {onRequestGet,onRequestPost} from '../functions/api/secure-state.js';
import {GROUPS} from '../lib/wager-rules.js';

function makeDb(){
  const sqlite=new DatabaseSync(':memory:');
  for(const file of ['0001_initial.sql','0002_activity.sql','0003_login_throttle.sql']){
    sqlite.exec(readFileSync(new URL('../cloudflare/migrations/'+file,import.meta.url),'utf8'));
  }
  const db={
    prepare(sql){const statement=sqlite.prepare(sql);let args=[];return {
      bind(...values){args=values;return this},
      async first(){return statement.get(...args)||null},
      async all(){return {results:statement.all(...args)}},
      async run(){const x=statement.run(...args);return {meta:{changes:Number(x.changes),last_row_id:Number(x.lastInsertRowid)}}}
    }},
    async batch(statements){sqlite.exec('BEGIN');try{const out=[];for(const s of statements)out.push(await s.run());sqlite.exec('COMMIT');return out}catch(error){sqlite.exec('ROLLBACK');throw error}}
  };
  return {db,sqlite};
}

function session(){
  const {db,sqlite}=makeDb(),tokens={};
  const send=async(method,player,body)=>{
    const headers=method==='GET'
      ?{'x-ballyhack-player':player||'','x-ballyhack-token':tokens[player]||''}
      :{'content-type':'application/json'};
    const payload=method==='POST'?{actor:player,authToken:tokens[player],...body}:undefined;
    const req=new Request('https://beta.example/api/secure-state',{method,headers,body:payload?JSON.stringify(payload):undefined});
    const response=await(method==='GET'?onRequestGet:onRequestPost)({request:req,env:{DB:db}});
    return {status:response.status,body:await response.json()};
  };
  return {
    db,sqlite,send,
    async login(player){const r=await send('POST',player,{op:'auth',player,pin:'1234'});assert.equal(r.status,200,r.body.error);tokens[player]=r.body.token},
    async get(player){const r=await send('GET',player);assert.equal(r.status,200,r.body.error);return r.body},
    async post(player,body){
      const setting={sideGame:'sideGames',nassauGroup:'nassauGroups',nassauBetConfig:'nassauBets',fortyBallSelection:'fortyBallSelections',fortyBallBet:'fortyBallBets'}[body.op];
      const revision=setting?sqlite.prepare('SELECT updated_at FROM tournament_settings WHERE key=?').get(setting)?.updated_at||null:undefined;
      const epoch=sqlite.prepare("SELECT value FROM tournament_settings WHERE key='epoch'").get()?.value;
      return send('POST',player,{...body,epoch:epoch?JSON.parse(epoch):null,...(setting&&body.expectedRevision===undefined?{expectedRevision:revision}:{})});
    }
  };
}

test('pressure: both groups can score a full round concurrently and conflicting edits are rejected',async()=>{
  const x=session();
  for(const p of ['David Glenn','Tyler Bohannon','Joe Phelan'])await x.login(p);

  for(let hole=1;hole<=18;hole++){
    const writes=[];
    for(const player of GROUPS[2][1])writes.push(x.post('Tyler Bohannon',{op:'score',round:2,player,hole,gross:4+(hole%3),expectedGross:0,mutationId:`g1-${player}-${hole}`}));
    for(const player of GROUPS[2][2])writes.push(x.post('Joe Phelan',{op:'score',round:2,player,hole,gross:5+(hole%2),expectedGross:0,mutationId:`g2-${player}-${hole}`}));
    const out=await Promise.all(writes);
    for(const r of out)assert.equal(r.status,200,r.body.error);
  }

  const target=GROUPS[2][1][0];
  const before=+(await x.get('David Glenn')).scores[2][target][9];
  const race=await Promise.all([
    x.post('David Glenn',{op:'score',round:2,player:target,hole:9,gross:3,expectedGross:before,mutationId:'race-a'}),
    x.post('Tyler Bohannon',{op:'score',round:2,player:target,hole:9,gross:7,expectedGross:before,mutationId:'race-b'})
  ]);
  assert.deepEqual(race.map(r=>r.status).sort(),[200,409]);

  const state=await x.get('David Glenn');
  for(const p of Object.values(GROUPS[2]).flat())assert.equal(Object.keys(state.scores[2][p]).length,18,p);
});

test('pressure: repeated backup and restore cycles preserve score and side-game state',async()=>{
  const x=session();
  await x.login('David Glenn');
  const target=GROUPS[3][1][0];

  assert.equal((await x.post('David Glenn',{op:'sideGame',round:3,value:'40 Ball'})).status,200);
  assert.equal((await x.post('David Glenn',{op:'fortyBallBet',round:3,value:40})).status,200);
  assert.equal((await x.post('David Glenn',{op:'score',round:3,player:target,hole:1,gross:5,expectedGross:0,mutationId:'seed'})).status,200);

  for(let cycle=1;cycle<=5;cycle++){
    const b=await x.post('David Glenn',{op:'backup'});
    assert.equal(b.status,200,b.body.error);
    assert.equal((await x.post('David Glenn',{op:'score',round:3,player:target,hole:1,gross:4,expectedGross:5,mutationId:`edit-${cycle}`})).status,200);
    const r=await x.post('David Glenn',{op:'restoreBackup',backupId:b.body.backupId});
    assert.equal(r.status,200,r.body.error);
    const state=await x.get('David Glenn');
    assert.equal(state.scores[3][target][1],'5');
    assert.equal(state.sideGames[3],'40 Ball');
    assert.equal(state.fortyBallBets[3],40);
  }
});

test('pressure: repeated edits keep the final score correct and preserve audit entries',async()=>{
  const x=session();
  await x.login('David Glenn');
  let expected=0;
  for(let i=0;i<20;i++){
    const gross=3+(i%5);
    const r=await x.post('David Glenn',{op:'score',round:4,player:'David Glenn',hole:18,gross,expectedGross:expected,mutationId:`audit-${i}`});
    assert.equal(r.status,200,r.body.error);
    expected=gross;
  }
  const state=await x.get('David Glenn');
  assert.equal(+state.scores[4]['David Glenn'][18],expected);
  const rows=state.audit.filter(row=>row.round_no===4&&row.player==='David Glenn'&&row.hole===18);
  assert.equal(rows.length>=19,true);
});

test('pressure: direct reset remains blocked and does not alter tournament state',async()=>{
  const x=session();
  await x.login('David Glenn');
  assert.equal((await x.post('David Glenn',{op:'sideGame',round:1,value:'40 Ball'})).status,200);
  assert.equal((await x.post('David Glenn',{op:'score',round:1,player:'David Glenn',hole:1,gross:5,expectedGross:0,mutationId:'before-reset'})).status,200);
  const before=await x.get('David Glenn');
  const r=await x.post('David Glenn',{op:'reset'});
  assert.equal(r.status,409);
  const after=await x.get('David Glenn');
  assert.deepEqual(after.scores,before.scores);
  assert.deepEqual(after.sideGames,before.sideGames);
});


test('pressure: concurrent 40 Ball selections stop exactly at 40 counted scores',async()=>{
  const x=session();
  await x.login('David Glenn');
  assert.equal((await x.post('David Glenn',{op:'sideGame',round:1,value:'40 Ball'})).status,200);

  const names=GROUPS[1][1];
  for(const player of names){
    for(let hole=1;hole<=18;hole++){
      const seeded=await x.post('David Glenn',{op:'score',round:1,player,hole,gross:5,expectedGross:0,mutationId:`seed40-${player}-${hole}`});
      assert.equal(seeded.status,200,seeded.body.error);
    }
  }
  let count=0;
  outer:
  for(const player of names){
    for(let hole=1;hole<=18;hole++){
      if(count===39)break outer;
      const r=await x.post('David Glenn',{op:'fortyBallSelection',round:1,group:1,player,hole,value:true});
      assert.equal(r.status,200,r.body.error);
      count++;
    }
  }
  assert.equal(count,39);

  const candidates=[];
  for(const player of names){
    for(let hole=1;hole<=18;hole++){
      const key=player+'|'+hole;
      const state=await x.get('David Glenn');
      if(!state.fortyBallSelections?.[1]?.[1]?.[key])candidates.push({player,hole});
      if(candidates.length===2)break;
    }
    if(candidates.length===2)break;
  }
  assert.equal(candidates.length,2);

  const race=await Promise.all(candidates.map((p,i)=>x.post('David Glenn',{
    op:'fortyBallSelection',round:1,group:1,player:p.player,hole:p.hole,value:true
  })));
  assert.deepEqual(race.map(r=>r.status).sort(),[200,409]);

  const final=await x.get('David Glenn');
  assert.equal(Object.keys(final.fortyBallSelections[1][1]).length,40);
});

test('pressure: locks are isolated by round and group',async()=>{
  const x=session();
  await x.login('David Glenn');
  await x.login('Tyler Bohannon');

  const r1player=GROUPS[1][1][0];
  for(const player of GROUPS[1][1]){
    for(let hole=1;hole<=18;hole++){
      const seeded=await x.post('David Glenn',{op:'score',round:1,player,hole,gross:5,expectedGross:0,mutationId:`lock-seed-${player}-${hole}`});
      assert.equal(seeded.status,200,seeded.body.error);
    }
  }
  assert.equal((await x.post('David Glenn',{op:'lockGroup',round:1,group:1})).status,200);

  const blocked=await x.post('David Glenn',{op:'score',round:1,player:r1player,hole:2,gross:5,expectedGross:0,mutationId:'locked-r1'});
  assert.equal(blocked.status,423);

  const r2player=GROUPS[2][1][0];
  const allowed=await x.post('Tyler Bohannon',{op:'score',round:2,player:r2player,hole:1,gross:5,expectedGross:0,mutationId:'open-r2'});
  assert.equal(allowed.status,200,allowed.body.error);
});

test('pressure: side games and wagers remain isolated across rounds',async()=>{
  const x=session();
  await x.login('David Glenn');

  assert.equal((await x.post('David Glenn',{op:'sideGame',round:1,value:'40 Ball'})).status,200);
  assert.equal((await x.post('David Glenn',{op:'fortyBallBet',round:1,value:25})).status,200);
  assert.equal((await x.post('David Glenn',{op:'sideGame',round:2,value:'Nassau 6-6-6'})).status,200);
  assert.equal((await x.post('David Glenn',{op:'nassauGroup',round:2,group:1,value:'Nassau 6-6-6'})).status,200);
  assert.equal((await x.post('David Glenn',{op:'nassauBetConfig',round:2,group:1,config:{value:30,presses:[]}})).status,200);
  assert.equal((await x.post('David Glenn',{op:'sideGame',round:3,value:'None'})).status,200);

  const state=await x.get('David Glenn');
  assert.equal(state.sideGames[1],'40 Ball');
  assert.equal(state.fortyBallBets[1],25);
  assert.equal(state.sideGames[2],'Nassau 6-6-6');
  assert.equal(state.nassauGroups[2][1],'Nassau 6-6-6');
  assert.equal(state.nassauBets[2][1].value,30);
  assert.equal(state.sideGames[3],'None');
});


test('pressure: Nassau wager correction persists after scoring and updates existing press amount',async()=>{
  const x=session();
  await x.login('David Glenn');
  assert.equal((await x.post('David Glenn',{op:'sideGame',round:1,value:'Nassau 5-5-5-1-1-1'})).status,200);
  assert.equal((await x.post('David Glenn',{op:'nassauGroup',round:1,group:1,value:'Nassau 5-5-5-1-1-1'})).status,200);
  assert.equal((await x.post('David Glenn',{op:'nassauBetConfig',round:1,group:1,config:{value:20,presses:[]}})).status,200);

  for(const [player,gross] of [['David Glenn',6],['Nick Condeni',6],['Bill McCombs',4],['Will Long',4]]){
    assert.equal((await x.post('David Glenn',{op:'score',round:1,player,hole:1,gross,expectedGross:0,mutationId:'wager-edit-'+player})).status,200);
  }

  const press={id:'edit-press',segment:0,fromHole:2,pressedBy:'a',amount:20,parentPressId:null};
  assert.equal((await x.post('David Glenn',{op:'nassauBetConfig',round:1,group:1,config:{value:20,presses:[press]}})).status,200);

  const corrected={...press,amount:30};
  const changed=await x.post('David Glenn',{op:'nassauBetConfig',round:1,group:1,config:{value:30,presses:[corrected]}});
  assert.equal(changed.status,200,changed.body.error);

  const state=await x.get('David Glenn');
  assert.equal(state.nassauBets[1][1].value,30);
  assert.equal(state.nassauBets[1][1].presses[0].amount,30);
});
