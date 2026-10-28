import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawn,execFileSync} from 'node:child_process';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args=process.argv.slice(2);
if(args.length!==2||args[0]!=='--work'||!path.isAbsolute(args[1]))throw Error('Usage: node scripts/verify-starter.mjs --work ABSOLUTE_PRIVATE_WORK_DIR');
await fs.mkdir(args[1],{recursive:true});
const workspace=await fs.mkdtemp(path.join(args[1],'anonymous-score-check-'));
const project=path.join(workspace,'starter');
await fs.cp(path.join(root,'assets','starter'),project,{recursive:true,filter:p=>!['data','.git'].includes(path.basename(p))});
const {rankEvent,summary,compareTeams,awardSummary,parsePerformance}=await import(pathToFileURL(path.join(project,'logic.mjs')));
const baseEvent={id:'test',group:'丙组',sex:'男子',key:'100',name:'测试项目',type:'track',preliminary:false,relay:false,entries:Array.from({length:8},(_,i)=>({id:'p'+i,name:'选手'+i,team:'示例代表队'+i}))};
const results=Object.fromEntries(baseEvent.entries.map((e,i)=>[e.id,{status:'valid',value:String(10+i),version:1}]));
assert.equal(parsePerformance('2:31.45',baseEvent),151450);
assert.throws(()=>parsePerformance('0',baseEvent));
assert.equal(rankEvent({...baseEvent,entries:[baseEvent.entries[0]],relay:true},results).rows[0].score,14);
assert.equal(rankEvent({...baseEvent,entries:[baseEvent.entries[0]],relay:true},{p0:{...results.p0,recordBroken:true}}).rows[0].score,16);
assert.equal(rankEvent({...baseEvent,preliminary:true},results).rows[0].score,0);
const tied=structuredClone(results);tied.p2.value='11';tied.p1.officialRank=2;tied.p2.officialRank=2;
let ranked=rankEvent(baseEvent,tied);
assert.equal(ranked.complete,true);assert.equal(ranked.rows[1].score,4.5);assert.equal(ranked.rows[2].score,4.5);assert.equal(ranked.rows[3].rank,4);
const boundary=structuredClone(results);boundary.p6.value='15';boundary.p5.officialRank=6;boundary.p6.officialRank=6;
assert.equal(rankEvent(baseEvent,boundary).rows.find(r=>r.id==='p5').score,0.5);
assert.equal(rankEvent(baseEvent,{...tied,p1:{...tied.p1,officialRank:null}}).complete,false);
const seed={teams:baseEvent.entries.map(e=>({name:e.team,group:'丙组'})),events:[baseEvent]};
assert.equal(summary(seed,{events:{test:{results,confirmed:false}}}).rows.reduce((n,r)=>n+r.score,0),0);
assert.equal(summary(seed,{events:{test:{results,confirmed:true}}}).rows.reduce((n,r)=>n+r.score,0),22);
assert.equal(summary({...seed,events:[{...baseEvent,preliminary:true}]},{events:{test:{results,confirmed:true}}}).rows.reduce((n,r)=>n+r.score,0),0);
assert(compareTeams({score:10,wins:2,placeParticipants:[]},{score:10,wins:1,placeParticipants:[]})<0);
assert(compareTeams({score:10,wins:1,placeParticipants:[0,0,18]},{score:10,wins:1,placeParticipants:[0,0,12]})<0);
const awardEvent={...baseEvent,entries:baseEvent.entries.slice(0,4)};
const awardResults=Object.fromEntries(awardEvent.entries.map(e=>[e.id,{status:'valid',value:'10',officialRank:1}]));
const awards=awardSummary({...seed,events:[awardEvent]},{events:{test:{confirmed:true,results:awardResults}}});
assert.equal(awards.men.filter(r=>r.cutoffTie).length,4);assert.equal(awards.men.filter(r=>r.award).length,0);
assert.equal(awards.final,true);
const relayAwards=awardSummary({...seed,events:[{...awardEvent,relay:true}]},{events:{test:{confirmed:true,results:awardResults}}});
assert.equal(relayAwards.men.length,0);

let child,base,log='';
async function start(){
 child=spawn(process.execPath,['server.mjs'],{cwd:project,env:{...process.env,HOST:'127.0.0.1',PORT:'0',SCORE_DATA_DIR:path.join(project,'data')},windowsHide:true,stdio:['ignore','pipe','pipe']});
 base=await new Promise((resolve,reject)=>{
  const timeout=setTimeout(()=>reject(Error('Server readiness timeout')),10000);
  child.stdout.on('data',b=>{log+=b.toString();const match=log.match(/Scoreboard ready on (http:\/\/127\.0\.0\.1:\d+)/);if(match){clearTimeout(timeout);resolve(match[1]);}});
  child.stderr.on('data',b=>{log+=b.toString();});
  child.once('error',e=>{clearTimeout(timeout);reject(e);});
  child.once('exit',code=>{clearTimeout(timeout);reject(Error('Server exited before readiness: '+code));});
 });
}
async function stop(){if(child&&child.exitCode===null){const exited=new Promise(resolve=>child.once('exit',resolve));child.kill();await exited;}log='';}
async function request(route,token,body){
 return fetch(base+route,{headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{method:'POST',body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(5000)});
}
try{
 await start();
 const keys=JSON.parse(await fs.readFile(path.join(project,'data','access.json'),'utf8'));
 assert.notEqual(keys.editor,keys.viewer);
 assert.equal((await request('/')).status,200);
 for(const route of ['/api/state','/api/share','/api/export','/api/backup'])assert.equal((await request(route)).status,401);
 for(const route of ['/seed.json','/data/access.json','/data/private-links.txt'])assert.equal((await request(route)).status,404);
 const view=await (await request('/api/state',keys.viewer)).json();assert.equal(view.role,'viewer');assert.equal(view.state.revision,0);
 const share=await (await request('/api/share',keys.viewer)).json();assert.equal(share.editor,undefined);assert.equal(share.viewer,keys.viewer);
 for(const route of ['/api/result','/api/confirm','/api/award-selection'])assert.equal((await request(route,keys.viewer,{})).status,403);
 assert.equal((await request('/api/backup',keys.viewer)).status,404);
 const event=view.seed.events.find(e=>e.key==='100'&&e.group==='丙组'&&e.sex==='男子');
 const payload={eventId:event.id,entryId:event.entries[0].id,status:'valid',value:'12.35',version:0,operator:'记录员001'};
 assert.equal((await request('/api/result',keys.editor,payload)).status,200);
 assert.equal((await request('/api/result',keys.editor,payload)).status,409);
 assert.equal((await request('/api/confirm',keys.editor,{eventId:event.id,version:1,confirmed:true})).status,400);
 for(const entry of event.entries.slice(1))assert.equal((await request('/api/result',keys.editor,{...payload,entryId:entry.id,status:'dns',value:''})).status,200);
 assert.equal((await request('/api/confirm',keys.editor,{eventId:event.id,version:event.entries.length,confirmed:true})).status,200);
 assert.equal((await request('/api/result',keys.editor,{...payload,version:1})).status,409);
 assert.equal((await request('/api/confirm',keys.editor,{eventId:event.id,version:event.entries.length+1,confirmed:false})).status,200);
 assert.equal((await request('/api/result',keys.editor,{...payload,version:1,value:'12.1'})).status,200);
 const backup=await (await request('/api/backup',keys.editor)).json();assert(backup.seed&&backup.state);assert(!JSON.stringify(backup).includes(keys.editor));
 const csvResponse=await request('/api/export',keys.viewer);assert.equal(csvResponse.status,200);assert((await csvResponse.text()).includes('12.1'));
 execFileSync(process.execPath,['WriteLinks.mjs','--base',base],{cwd:project,windowsHide:true,env:{...process.env,SCORE_DATA_DIR:path.join(project,'data')}});
 const linkFile=await fs.readFile(path.join(project,'data','share-links.txt'),'utf8');assert(linkFile.includes(base+'/?key='+keys.viewer));
 assert.throws(()=>execFileSync(process.execPath,['WriteLinks.mjs','--base',base+'/?key=not-a-real-key'],{cwd:project,windowsHide:true,stdio:'pipe'}));
 const revision=backup.state.revision;await stop();await start();
 const restored=await (await request('/api/state',keys.editor)).json();assert.equal(restored.state.revision,revision);assert.equal(restored.state.events[event.id].results[event.entries[0].id].value,'12.1');
 assert((await fs.readFile(path.join(project,'data','audit.ndjson'),'utf8')).includes('记录员001'));
 console.log('PASS: scoring, tie boundaries, awards, permissions, conflict, confirmation, exports, link generation and restart persistence.');
 console.log('All generated runtime data remains in the isolated --work directory. No public tunnel or production data was used.');
}finally{await stop();}
