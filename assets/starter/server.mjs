import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {parsePerformance,rankEvent,summary,awardSummary} from './logic.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
const store=process.env.SCORE_DATA_DIR||path.join(root,'data');await fs.mkdir(store,{recursive:true});
const seed=JSON.parse(await fs.readFile(path.join(root,'seed.json'),'utf8'));
const keyFile=path.join(store,'access.json');let keys;
try{keys=JSON.parse(await fs.readFile(keyFile,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;keys={editor:crypto.randomBytes(24).toString('hex'),viewer:crypto.randomBytes(24).toString('hex')};await fs.writeFile(keyFile,JSON.stringify(keys));}
const stateFile=path.join(store,'results.json');let state;
try{state=JSON.parse(await fs.readFile(stateFile,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;state={revision:0,events:{},updatedAt:null};}
let queue=Promise.resolve();
function send(res,code,data){res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
function fail(message,code=400){const e=new Error(message);e.code=code;throw e;}
function role(req){const token=req.headers.authorization?.replace(/^Bearer /,'');return token===keys.editor?'editor':token===keys.viewer?'viewer':null;}
async function body(req){let s='';for await(const chunk of req){s+=chunk;if(s.length>8192)fail('提交内容过长',413);}try{return JSON.parse(s);}catch{fail('提交内容格式错误');}}
async function persist(next,entry){
 await fs.writeFile(stateFile+'.tmp',JSON.stringify(next));await fs.rename(stateFile+'.tmp',stateFile);
 state=next;await fs.appendFile(path.join(store,'audit.ndjson'),JSON.stringify({time:new Date().toISOString(),revision:state.revision,...entry})+'\n');
}
async function api(req,res,url){
 const access=role(req);if(!access)return send(res,401,{error:'访问口令无效，请使用完整的共享链接'});
 if(req.method==='GET'&&url.pathname==='/api/state')return send(res,200,{seed,state,role:access});
 if(req.method==='GET'&&url.pathname==='/api/export'){
  const csv=[['组别','性别','项目','代表队','姓名','状态','成绩','排名','得分','项目已确认']];
  for(const e of seed.events){const st=state.events[e.id]||{};for(const r of rankEvent(e,st.results).rows)csv.push([e.group,e.sex,e.name,r.team,r.name,{pending:'待录入',valid:'有效',dns:'未参赛',dnf:'未完成',dq:'犯规取消成绩'}[r.status],r.value||'',r.rank??'',r.score??'',st.confirmed?'是':'否']);}
  if(url.searchParams.get('kind')==='awards'){
   csv.length=0;csv.push(['奖项','组别','性别','项目','姓名或代表队','代表队','名次','积分','评选状态']);
   const awards=awardSummary(seed,state);const phase=awards.final?'正式':'暂定（项目未全部确认）';
   for(const [category,label] of [['teams','最佳团体奖'],['men','最佳运动员奖'],['women','最佳运动员奖']])for(const r of awards[category])if(r.award||r.cutoffTie)csv.push([label,r.group,r.sex||'','',r.name||r.team,r.team,r.rank,r.score,r.cutoffTie&&!r.resolved?'同分待裁判确认':r.award?phase:'裁判未选定']);
   for(const r of awards.singles)csv.push(['单项奖',r.group,r.sex,r.event,r.name,r.team,r.rank,r.score,'该项目已确认']);
  }
  if(url.searchParams.get('kind')==='team-details'){
   csv.length=0;csv.push(['组别','代表队','团体名次','团体总分','性别','项目','运动员或接力队','成绩','单项名次','基础分','接力倍数','破纪录加分','单项计算分','计入团体分','计入状态','项目报名人数']);
   for(const t of summary(seed,state).rows)for(const d of t.details)csv.push([t.group,t.team,t.rank??'',t.score,d.sex,d.event,d.name,d.value,d.rank??'',d.basePoints??'',d.multiplier,d.bonus,d.score??'',d.contribution,d.reason,d.registered]);
  }
  const text='\uFEFF'+csv.map(row=>row.map(v=>'"'+String(v).replace(/^[=+@-]/,"'$&").replaceAll('"','""')+'"').join(',')).join('\r\n');
  res.writeHead(200,{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':"attachment; filename*=UTF-8''"+encodeURIComponent('院运会成绩导出.csv'),'Cache-Control':'no-store'});return res.end(text);
 }
 if(req.method==='GET'&&url.pathname==='/api/share')return send(res,200,access==='editor'?keys:{viewer:keys.viewer});
 if(req.method==='GET'&&url.pathname==='/api/backup'&&access==='editor'){
  res.writeHead(200,{'Content-Type':'application/json','Content-Disposition':'attachment; filename="scores-backup.json"','Cache-Control':'no-store'});return res.end(JSON.stringify({seed,state},null,2));
 }
 if(req.method!=='POST')return send(res,404,{error:'接口不存在'});
 if(access!=='editor')return send(res,403,{error:'当前链接仅可查看'});
 if(req.headers.origin){let origin;try{origin=new URL(req.headers.origin).host;}catch{fail('来源无效',403);}if(origin!==req.headers.host)fail('来源不匹配',403);}
 const input=await body(req);
 const task=queue.then(async()=>{
  if(url.pathname==='/api/award-selection'){
   if(input.revision!==state.revision)fail('积分内容已更新，请刷新后重新选择',409);
   if(!['teams','men','women'].includes(input.category))fail('奖项无效');
   const rows=awardSummary(seed,state)[input.category],row=rows.find(r=>r.id===input.id&&r.cutoffTie);if(!row)fail('该记录不属于获奖名额边界的同分记录');
   if(typeof input.selected!=='boolean')fail('选择无效');
   const next=structuredClone(state);next.awardDecisions||={};const ids=new Set(next.awardDecisions[input.category]||[]);if(input.selected)ids.add(input.id);else ids.delete(input.id);
   const quota=input.category==='teams'?6:3;if(ids.size>quota-row.rank+1)fail('已选满同分名额，请先取消其他人选');
   next.awardDecisions[input.category]=[...ids];next.revision++;next.updatedAt=new Date().toISOString();await persist(next,{action:'award-selection',category:input.category,id:input.id,selected:input.selected,operator:String(input.operator||'未署名').slice(0,30)});return send(res,200,{revision:state.revision});
  }
  const event=seed.events.find(e=>e.id===input.eventId);if(!event)fail('项目不存在',404);
  const next=structuredClone(state);const ev=next.events[event.id]||{results:{},confirmed:false,version:0};next.events[event.id]=ev;
  if(url.pathname==='/api/result'){
   if(ev.confirmed)fail('项目已确认，先撤回确认才能修改',409);
   const entry=event.entries.find(e=>e.id===input.entryId);if(!entry)fail('参赛记录不存在',404);
   const old=ev.results[entry.id]||{version:0};if(input.version!==old.version)fail('这条成绩已被其他人修改，请刷新后再填写',409);
   if(!['pending','valid','dns','dnf','dq'].includes(input.status))fail('状态无效');
   const value=input.status==='valid'?String(input.value||'').trim():'';if(input.status==='valid'){try{parsePerformance(value,event);}catch(e){fail(e.message);}}
   const officialRank=input.officialRank==null||input.officialRank===''?null:Number(input.officialRank);
   if(officialRank!==null&&(!Number.isInteger(officialRank)||officialRank<1||officialRank>event.entries.length||input.status!=='valid'))fail('正式名次必须是有效范围内的整数');
   const operator=String(input.operator||'未署名').trim().slice(0,30);
   if(input.recordBroken!=null&&typeof input.recordBroken!=='boolean')fail('破纪录标记无效');
   if(input.recordBroken&&(input.status!=='valid'||event.preliminary))fail('只有正式项目有效成绩可以标记破校纪录');
   ev.results[entry.id]={value,status:input.status,officialRank,recordBroken:!!input.recordBroken,operator,version:old.version+1,updatedAt:new Date().toISOString()};
   next.awardDecisions={};ev.version++;next.revision++;next.updatedAt=new Date().toISOString();
   await persist(next,{action:'result',eventId:event.id,entryId:entry.id,operator,before:old,after:ev.results[entry.id]});
  }else if(url.pathname==='/api/confirm'){
   if(input.version!==ev.version)fail('项目内容已更新，请刷新后再确认',409);
   if(typeof input.confirmed!=='boolean')fail('确认状态无效');
   if(input.confirmed){const ranked=rankEvent(event,ev.results);if(!event.entries.length)fail('该项目无报名记录');if(!ranked.complete)fail(ranked.errors.join('；'));}
   next.awardDecisions={};ev.confirmed=input.confirmed;ev.version++;next.revision++;next.updatedAt=new Date().toISOString();
   await persist(next,{action:input.confirmed?'confirm':'reopen',eventId:event.id,operator:String(input.operator||'未署名').slice(0,30)});
  }else fail('接口不存在',404);
  send(res,200,{revision:state.revision});
 });queue=task.catch(()=>{});await task;
}
const server=http.createServer(async(req,res)=>{
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');
 res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'");
 try{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname.startsWith('/api/'))return await api(req,res,url);
  const assets={'/':'index.html','/app.js':'app.js','/styles.css':'styles.css','/logic.mjs':'logic.mjs','/lucide.js':'lucide.js','/icon.svg':'icon.svg'};
  const name=assets[url.pathname];if(!name){res.writeHead(404);return res.end('Not found');}
  const content=await fs.readFile(path.join(root,name));const ext=path.extname(name);
  res.writeHead(200,{'Content-Type':{'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'}[ext],'Cache-Control':'no-cache'});res.end(content);
 }catch(e){if(!res.headersSent)send(res,typeof e.code==='number'?e.code:500,{error:typeof e.code==='number'?e.message:'保存或读取失败，请稍后重试'});else res.end();console.error(e.message);}
});
const port=Number(process.env.PORT||8787),host=process.env.HOST||'127.0.0.1';
if(!Number.isInteger(port)||port<0||port>65535)throw Error('Invalid PORT');
server.on('error',e=>{console.error('Service start failed: '+e.code);process.exitCode=1;});
server.listen(port,host,async()=>{
 const actual=server.address().port;
 const base='http://127.0.0.1:'+actual;
 const links=['PRIVATE - DO NOT SHARE THIS FILE','Editor: '+base+'/?key='+keys.editor,'Viewer: '+base+'/?key='+keys.viewer].join('\n')+'\n';
 try{await fs.writeFile(path.join(store,'private-links.txt'),links,{mode:0o600});console.log('Scoreboard ready on '+base+'; private entry links: data/private-links.txt (or SCORE_DATA_DIR)');}
 catch(e){console.error('Private links could not be written: '+e.code);server.close();process.exitCode=1;}
});
