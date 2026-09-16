import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {onRequestGet,onRequestPost} from '../functions/api/secure-state.js';
import {GROUPS,validateWagerChange} from '../lib/wager-rules.js';

function database(){
  const sqlite=new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../cloudflare/migrations/0001_initial.sql',import.meta.url),'utf8'));
  sqlite.exec(readFileSync(new URL('../cloudflare/migrations/0002_activity.sql',import.meta.url),'utf8'));
  sqlite.exec(readFileSync(new URL('../cloudflare/migrations/0003_login_throttle.sql',import.meta.url),'utf8'));
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
  const {db,sqlite}=database(),tokens={};
  const send=async(method,player,body)=>{
    const req=new Request('https://beta.example/api/secure-state',{method,headers:method==='GET'?{'x-ballyhack-player':player||'','x-ballyhack-token':tokens[player]||''}:{'content-type':'application/json'},body:method==='POST'?JSON.stringify({actor:player,authToken:tokens[player],...body}):undefined});
    const response=await(method==='GET'?onRequestGet:onRequestPost)({request:req,env:{DB:db}});
    return {status:response.status,body:await response.json()};
  };
  return {
    db,sqlite,send,
    async login(player){const x=await send('POST',player,{op:'auth',player,pin:'1234'});assert.equal(x.status,200,x.body.error);tokens[player]=x.body.token},
    async get(player){const x=await send('GET',player);assert.equal(x.status,200,x.body.error);return x.body},
    async post(player,body){
      const setting={sideGame:'sideGames',nassauGroup:'nassauGroups',nassauBetConfig:'nassauBets',fortyBallSelection:'fortyBallSelections',fortyBallBet:'fortyBallBets'}[body.op];
      const revision=setting?sqlite.prepare('SELECT updated_at FROM tournament_settings WHERE key=?').get(setting)?.updated_at||null:undefined;
      const epoch=sqlite.prepare("SELECT value FROM tournament_settings WHERE key='epoch'").get()?.value;
      return send('POST',player,{...body,epoch:epoch?JSON.parse(epoch):null,...(setting&&body.expectedRevision===undefined?{expectedRevision:revision}:{})});
    }
  };
}

test('Nassau press and counter-press are validated on the server',async()=>{
  const x=session();for(const p of ['David Glenn','Nick Condeni','Bill McCombs'])await x.login(p);
  assert.equal((await x.post('David Glenn',{op:'nassauGroup',round:1,group:1,value:'Nassau 6-6-6'})).status,200);
  assert.equal((await x.post('David Glenn',{op:'sideGame',round:1,value:'Nassau 6-6-6'})).status,200);
  const bet={value:20,presses:[]};
  assert.equal((await x.post('David Glenn',{op:'nassauBetConfig',round:1,group:1,config:bet})).status,200);
  for(const [player,gross] of [['David Glenn',6],['Nick Condeni',6],['Bill McCombs',4],['Will Long',4]]){
    assert.equal((await x.post('David Glenn',{op:'score',round:1,player,hole:1,gross,expectedGross:0,mutationId:'first-'+player})).status,200);
  }
  const original={id:'press-one',segment:0,fromHole:2,pressedBy:'a',amount:20,parentPressId:null};
  assert.equal((await x.post('Bill McCombs',{op:'nassauBetConfig',round:1,group:1,config:{value:20,presses:[original]}})).status,409,'Opposing team may not place the first press');
  assert.equal((await x.post('David Glenn',{op:'nassauBetConfig',round:1,group:1,config:{value:20,presses:[original]}})).status,200);
  const counter={id:'counter-one',segment:0,fromHole:2,pressedBy:'b',amount:20,parentPressId:'press-one'};
  assert.equal((await x.post('Bill McCombs',{op:'nassauBetConfig',round:1,group:1,config:{value:20,presses:[original,counter]}})).status,200);
  assert.equal((await x.post('David Glenn',{op:'nassauBetConfig',round:1,group:1,config:{value:20,presses:[original,counter,{...counter,id:'counter-two'}]}})).status,409);
  x.sqlite.prepare("INSERT INTO tournament_group_locks VALUES (1,1,'David Glenn','2026-09-16T00:00:00Z')").run();
  assert.equal((await x.post('David Glenn',{op:'nassauBetConfig',round:1,group:1,config:bet})).status,423);
  assert.equal((await x.post('David Glenn',{op:'sideGame',round:1,value:'40 Ball'})).status,423);
});

test('One-hole matches reject presses and a counter-press needs a recorded parent',()=>{
  const names=GROUPS[1][1],scores=Object.fromEntries(names.map(n=>[n,{1:5}]));
  const base={names,format:'Nassau 5-5-5-1-1-1',scores,previous:{value:10,presses:[]},actor:'David Glenn'};
  assert.match(validateWagerChange({...base,next:{value:10,presses:[{id:'bad',segment:3,fromHole:16,pressedBy:'a',amount:10,parentPressId:null}]}}),/one-hole/);
  assert.match(validateWagerChange({...base,next:{value:10,presses:[{id:'orphan',segment:0,fromHole:2,pressedBy:'b',amount:10,parentPressId:'missing'}]}}),/opposing press/);
});

test('A stale phone cannot overwrite settings or an edited score',async()=>{
  const x=session();await x.login('David Glenn');await x.login('Nick Condeni');
  const first=await x.get('David Glenn');
  assert.equal((await x.post('David Glenn',{op:'sideGame',round:1,value:'40 Ball'})).status,200);
  assert.equal((await x.post('Nick Condeni',{op:'sideGame',round:1,value:'None',expectedRevision:first.revisions.sideGames||null})).status,409);
  assert.equal((await x.post('David Glenn',{op:'score',round:1,player:'Nick Condeni',hole:1,gross:4,expectedGross:0,mutationId:'a'})).status,200);
  assert.equal((await x.post('Nick Condeni',{op:'score',round:1,player:'Nick Condeni',hole:1,gross:5,expectedGross:0,mutationId:'b'})).status,409);
  assert.equal((await x.get('Nick Condeni')).scores[1]['Nick Condeni'][1],'4');
  const parallel=await Promise.all([
    x.post('David Glenn',{op:'score',round:1,player:'Nick Condeni',hole:2,gross:4,expectedGross:0,mutationId:'parallel-a'}),
    x.post('Nick Condeni',{op:'score',round:1,player:'Nick Condeni',hole:2,gross:5,expectedGross:0,mutationId:'parallel-b'})
  ]);
  assert.deepEqual(parallel.map(x=>x.status).sort(),[200,409]);
});

test('Complete Nassau match keeps separate presses through lock, unlock, and correction',async()=>{
  const x=session();for(const p of ['David Glenn','Bill McCombs'])await x.login(p);
  await x.post('David Glenn',{op:'nassauGroup',round:1,group:1,value:'Nassau 6-6-6'});
  await x.post('David Glenn',{op:'sideGame',round:1,value:'Nassau 6-6-6'});
  await x.post('David Glenn',{op:'nassauBetConfig',round:1,group:1,config:{value:30,presses:[]}});
  for(const n of GROUPS[1][1])await x.post('David Glenn',{op:'score',round:1,player:n,hole:1,gross:n==='David Glenn'||n==='Nick Condeni'?6:4,expectedGross:0,mutationId:`start-${n}`});
  const original={id:'press-a',segment:0,fromHole:2,pressedBy:'a',amount:30,parentPressId:null};
  const counter={id:'press-b',segment:0,fromHole:2,pressedBy:'b',amount:30,parentPressId:'press-a'};
  assert.equal((await x.post('David Glenn',{op:'nassauBetConfig',round:1,group:1,config:{value:30,presses:[original]}})).status,200);
  assert.equal((await x.post('Bill McCombs',{op:'nassauBetConfig',round:1,group:1,config:{value:30,presses:[original,counter]}})).status,200);
  for(const n of GROUPS[1][1])for(let h=2;h<=18;h++){
    const out=await x.post('David Glenn',{op:'score',round:1,player:n,hole:h,gross:5,expectedGross:0,mutationId:`finish-${n}-${h}`});
    assert.equal(out.status,200,out.body.error);
  }
  assert.equal((await x.post('David Glenn',{op:'lockGroup',round:1,group:1})).status,200);
  assert.equal((await x.post('David Glenn',{op:'score',round:1,player:'David Glenn',hole:18,gross:4,expectedGross:5,mutationId:'locked-edit'})).status,423);
  assert.equal((await x.post('Bill McCombs',{op:'unlockGroup',round:1,group:1})).status,403);
  assert.equal((await x.post('David Glenn',{op:'unlockGroup',round:1,group:1})).status,200);
  assert.equal((await x.post('David Glenn',{op:'score',round:1,player:'David Glenn',hole:18,gross:4,expectedGross:5,mutationId:'corrected'})).status,200);
  const state=await x.get('David Glenn');
  assert.equal(state.nassauBets[1][1].presses.length,2);
  assert.equal(state.scores[1]['David Glenn'][18],'4');
  assert.equal(state.audit[0].old_gross,5);
});

test('A golfer requests an unlock and only the commissioner can approve it',async()=>{
  const x=session();
  for(const player of ['David Glenn','Nick Condeni','Joe Phelan'])await x.login(player);
  for(const player of GROUPS[1][1])for(let hole=1;hole<=18;hole++){
    const result=await x.post('Nick Condeni',{op:'score',round:1,player,hole,gross:5,expectedGross:0,mutationId:`card-${player}-${hole}`});
    assert.equal(result.status,200,result.body.error);
  }
  assert.equal((await x.post('Nick Condeni',{op:'lockGroup',round:1,group:1})).status,200);
  assert.equal((await x.post('Joe Phelan',{op:'requestUnlock',round:1,group:1})).status,403);
  assert.equal((await x.post('Nick Condeni',{op:'requestUnlock',round:1,group:1})).status,200);
  assert.equal((await x.get('Nick Condeni')).unlockRequests['1-1'].requestedBy,'Nick Condeni');
  assert.equal((await x.post('Nick Condeni',{op:'unlockGroup',round:1,group:1})).status,403);
  assert.equal((await x.post('David Glenn',{op:'unlockGroup',round:1,group:1})).status,200);
  assert.equal((await x.get('Nick Condeni')).unlockRequests['1-1'],undefined);
  assert.equal((await x.post('Nick Condeni',{op:'score',round:1,player:'Nick Condeni',hole:18,gross:4,expectedGross:5,mutationId:'after-unlock'})).status,200);
});

test('Incorrect PINs trigger escalating per-golfer waits and a successful login resets the count',async()=>{
  const x=session();await x.login('David Glenn');await x.login('Nick Condeni');
  for(let attempt=1;attempt<=4;attempt++){
    assert.equal((await x.send('POST','Nick Condeni',{op:'auth',player:'Nick Condeni',pin:'9999'})).status,401);
  }
  const fifth=await x.send('POST','Nick Condeni',{op:'auth',player:'Nick Condeni',pin:'9999'});
  assert.equal(fifth.status,429);
  assert.equal(fifth.body.retryAfterSeconds,60);
  assert.equal((await x.send('POST','Nick Condeni',{op:'auth',player:'Nick Condeni',pin:'1234'})).status,429);
  assert.equal((await x.get('Nick Condeni')).safeguards.authenticated,true);
  assert.equal((await x.send('POST','David Glenn',{op:'auth',player:'David Glenn',pin:'1234'})).status,200);
  x.sqlite.prepare('UPDATE tournament_login_attempts SET locked_until=0 WHERE player=?').run('Nick Condeni');
  const sixth=await x.send('POST','Nick Condeni',{op:'auth',player:'Nick Condeni',pin:'9999'});
  assert.equal(sixth.status,429);
  assert.equal(sixth.body.retryAfterSeconds,300);
  x.sqlite.prepare('UPDATE tournament_login_attempts SET locked_until=0 WHERE player=?').run('Nick Condeni');
  const seventh=await x.send('POST','Nick Condeni',{op:'auth',player:'Nick Condeni',pin:'9999'});
  assert.equal(seventh.status,429);
  assert.equal(seventh.body.retryAfterSeconds,900);
  x.sqlite.prepare('UPDATE tournament_login_attempts SET locked_until=0 WHERE player=?').run('Nick Condeni');
  assert.equal((await x.send('POST','Nick Condeni',{op:'auth',player:'Nick Condeni',pin:'1234'})).status,200);
  assert.equal(x.sqlite.prepare('SELECT failed_count FROM tournament_login_attempts WHERE player=?').get('Nick Condeni'),undefined);
  assert.equal((await x.send('POST','Nick Condeni',{op:'auth',player:'Nick Condeni',pin:'9999'})).status,401);
  assert.equal(x.sqlite.prepare('SELECT failed_count FROM tournament_login_attempts WHERE player=?').get('Nick Condeni').failed_count,1);
});

test('Signing in again keeps an existing device session valid',async()=>{
  const x=session();
  const first=await x.send('POST','David Glenn',{op:'auth',player:'David Glenn',pin:'1234'});
  const second=await x.send('POST','David Glenn',{op:'auth',player:'David Glenn',pin:'1234'});
  assert.equal(first.status,200);
  assert.equal(second.status,200);
  assert.notEqual(first.body.token,second.body.token);
  for(const token of [first.body.token,second.body.token]){
    const request=new Request('https://beta.example/api/secure-state',{
      headers:{'x-ballyhack-player':'David Glenn','x-ballyhack-token':token}
    });
    const response=await onRequestGet({request,env:{DB:x.db}});
    assert.equal(response.status,200);
    assert.equal((await response.json()).safeguards.role,'admin');
  }
});

test('Commissioner restore recovers state atomically and rejects old offline edits',async()=>{
  const x=session();await x.login('David Glenn');await x.login('Nick Condeni');
  assert.equal((await x.post('David Glenn',{op:'sideGame',round:1,value:'40 Ball'})).status,200);
  assert.equal((await x.post('David Glenn',{op:'fortyBallBet',round:1,value:25})).status,200);
  await x.post('David Glenn',{op:'score',round:1,player:'Nick Condeni',hole:1,gross:4,expectedGross:0,mutationId:'original'});
  x.sqlite.prepare("INSERT INTO tournament_group_locks VALUES (1,2,'David Glenn','2026-09-16T00:00:00Z')").run();
  const before=await x.post('David Glenn',{op:'backup'});assert.equal(before.status,200);
  x.sqlite.prepare('DELETE FROM tournament_group_locks WHERE round_no=1 AND group_no=2').run();
  await x.post('David Glenn',{op:'score',round:1,player:'Nick Condeni',hole:1,gross:5,expectedGross:4,mutationId:'change'});
  assert.equal((await x.post('Nick Condeni',{op:'restoreBackup',backupId:before.body.backupId})).status,403);
  const restored=await x.post('David Glenn',{op:'restoreBackup',backupId:before.body.backupId});assert.equal(restored.status,200,restored.body.error);
  const state=await x.get('David Glenn');
  assert.equal(state.scores[1]['Nick Condeni'][1],'4');
  assert.equal(state.fortyBallBets[1],25);
  assert.equal(state.locks[1][2].lockedBy,'David Glenn');
  const stale=await x.send('POST','Nick Condeni',{op:'score',round:1,player:'Nick Condeni',hole:2,gross:4,expectedGross:0,mutationId:'offline-old',epoch:null});
  assert.equal(stale.status,409);
  const current=await x.post('Nick Condeni',{op:'score',round:1,player:'Nick Condeni',hole:2,gross:4,expectedGross:0,mutationId:'fresh'});
  assert.equal(current.status,200);
  assert.equal((await x.get('David Glenn')).backups.length>=2,true);
});

test('Four-round scoring and 40 Ball selections remain available to both groups',async()=>{
  const x=session();await x.login('David Glenn');
  for(let round=1;round<=4;round++){
    assert.equal((await x.post('David Glenn',{op:'sideGame',round,value:round===1?'40 Ball':'None'})).status,200);
    if(round===1)assert.equal((await x.post('David Glenn',{op:'fortyBallBet',round,value:25})).status,200);
    for(const name of Object.values(GROUPS[round]).flat())for(let hole=1;hole<=18;hole++){
      const result=await x.post('David Glenn',{op:'score',round,player:name,hole,gross:5,expectedGross:0,mutationId:`${round}-${name}-${hole}`});
      assert.equal(result.status,200,`${round} ${name} ${hole}: ${result.body.error}`);
    }
    if(round===1){
      for(const group of [1,2])for(const name of GROUPS[round][group].slice(0,2))for(let hole=1;hole<=18;hole++){
        const result=await x.post('David Glenn',{op:'fortyBallSelection',round,group,player:name,hole,value:true});
        assert.equal(result.status,200,result.body.error);
      }
      for(const group of [1,2])for(let hole=1;hole<=4;hole++){
        const result=await x.post('David Glenn',{op:'fortyBallSelection',round,group,player:GROUPS[round][group][2],hole,value:true});
        assert.equal(result.status,200,result.body.error);
      }
    }
    for(const group of [1,2])assert.equal((await x.post('David Glenn',{op:'lockGroup',round,group})).status,200);
    if(round===1)assert.equal((await x.post('David Glenn',{op:'fortyBallSelection',round,group:1,player:GROUPS[round][1][0],hole:1,value:false})).status,423);
  }
  const state=await x.get('David Glenn');
  assert.equal(Object.values(state.scores).flatMap(round=>Object.values(round).flatMap(holes=>Object.keys(holes))).length,4*8*18);
  assert.equal(state.fortyBallBets[1],25);
  assert.equal(Object.keys(state.fortyBallSelections[1][1]).length,40);
  assert.equal(Object.keys(state.fortyBallSelections[1][2]).length,40);
  assert.equal(Object.values(state.locks).flatMap(groups=>Object.keys(groups)).length,8);
});
