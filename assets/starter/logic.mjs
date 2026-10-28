export const DEFINITIONS = [
 ['100-pre','100米预赛','101','track',true], ['100','100米决赛','101','track',false],
 ['200','200米','102','track',false], ['400','400米','104','track',false],
 ['800','800米','108','track',false], ['1500','1500米','131','track',false],
 ['high','跳高','210','field',false], ['long','跳远','211','field',false],
 ['shot','铅球','220','field',false], ['relay','4×100米接力','121','track',false],
];
export function makeSeed(teams) {
 const events=[];
 for(const group of ['丙组','丁组']) for(const sex of ['男子','女子']) for(const [key,name,code,type,preliminary] of DEFINITIONS) {
  const id=`${group}-${sex}-${key}`;const entries=[];
  for(const [ti,t] of teams.entries()) {
   if(t.group!==group)continue;
   if(code==='121') {if(t.relay[sex])entries.push({id:`t${ti}`,team:t.team,name:`${sex}接力队`});}
   else for(const [pi,p] of t.people.entries())if(p.sex===sex&&p.codes.includes(code))entries.push({id:`t${ti}-p${pi}`,team:t.team,name:p.name});
  }
  events.push({id,group,sex,key,name,type,preliminary,relay:code==='121',entries});
 }
 return {teams:teams.map(t=>({name:t.team,group:t.group})),events};
}
export function parsePerformance(value,event) {
 const raw=String(value??'').trim();if(!raw)throw Error('请填写成绩');
 let number;
 if(event.type==='field') {
  if(!/^\d+(\.\d{1,3})?$/.test(raw))throw Error('田赛成绩请填写米数，例如 4.52');
  number=Number(raw);
 }else{
  if(/^\d{1,3}:[0-5]\d(\.\d{1,3})?$/.test(raw)) {const [m,s]=raw.split(':');number=Number(m)*60+Number(s);}
  else if(/^\d+(\.\d{1,3})?$/.test(raw))number=Number(raw);
  else throw Error('用时请填写秒数或分:秒，例如 12.35、2:31.45');
 }
 if(!Number.isFinite(number)||number<=0||number>100000)throw Error('成绩必须大于0且在有效范围内');
 return Math.round(number*1000);
}
export function rankEvent(event,results={}) {
 const limit=6;
 const rows=event.entries.map(e=>{
  const r=results[e.id]||{version:0};
  return {...e,...r,status:r.status||'pending',metric:r.status==='valid'?parsePerformance(r.value,event):null};
 });
 const valid=rows.filter(r=>r.status==='valid').sort((a,b)=>event.type==='track'?a.metric-b.metric:b.metric-a.metric);
 const unresolved=[];
 for(let i=0;i<valid.length;i++){
  const row=valid[i];const equal=valid.filter(v=>v.metric===row.metric);
  const autoRank=valid.findIndex(v=>v.metric===row.metric)+1;
  row.rank=row.officialRank||autoRank;
  row.tied=equal.length>1;
  row.needsReview=row.tied&&equal.some(v=>!v.officialRank);
  if(row.needsReview)unresolved.push(row.id);
  row.baseScore=0;row.bonus=0;
 }
 const duplicates=valid.filter((r,i)=>valid.some((v,j)=>j!==i&&v.rank===r.rank&&v.metric!==r.metric));
 const occupied=new Set();let badRanks=false;
 for(const rank of [...new Set(valid.map(r=>r.rank))].sort((a,b)=>a-b)){
  const tied=valid.filter(r=>r.rank===rank);
  if(rank!==occupied.size+1)badRanks=true;
  for(let i=0;i<tied.length;i++){if(occupied.has(rank+i))badRanks=true;occupied.add(rank+i);}
  const points=tied.reduce((sum,_,i)=>sum+(rank+i<=limit?([7,5,4,3,2,1][rank+i-1]||0):0),0)/tied.length;
  for(const row of tied){row.baseScore=event.preliminary?0:points*(event.relay?2:1);row.bonus=!event.preliminary&&row.recordBroken?2:0;row.score=row.needsReview?null:row.baseScore+row.bonus;row.awarded=!event.preliminary&&rank<=limit;}
 }
 const invalidOrder=valid.some((r,i)=>valid.slice(0,i).some(v=>v.metric!==r.metric&&v.rank>=r.rank));
 const errors=[];
 if(unresolved.length)errors.push('存在同成绩记录，请由裁判填写正式名次');
 if(duplicates.length)errors.push('正式名次有重复，请检查调整');
 if(badRanks)errors.push('名次须从1开始连续排列，并列后跳过所占名次（如1、2、2、4）');
 if(invalidOrder)errors.push('名次与成绩顺序不符，请检查调整');
 if(rows.some(r=>r.status==='pending'))errors.push('还有未处理的参赛记录，请填写成绩或标记未参赛');
 return {rows:[...valid.sort((a,b)=>a.rank-b.rank),...rows.filter(r=>r.status!=='valid')],limit,errors,complete:errors.length===0};
}
export function compareTeams(a,b){
 const primary=b.score-a.score||b.wins-a.wins;if(primary)return primary;
 for(let rank=2;rank<=6;rank++){
  const difference=(b.placeParticipants[rank]||0)-(a.placeParticipants[rank]||0);
  if(difference)return difference;
 }
 return 0;
}
export function summary(seed,state,group=null){
 const board=seed.teams.filter(t=>!group||t.group===group).map(t=>({team:t.name,group:t.group,score:0,wins:0,placeParticipants:Array(7).fill(0),details:[]}));
 const events=seed.events.filter(e=>(!group||e.group===group)&&e.entries.length);let confirmed=0;
 for(const e of events){
  const st=state.events[e.id]||{},counted=!!st.confirmed&&!e.preliminary;
  if(counted)confirmed++;
  for(const r of rankEvent(e,st.results).rows){
   const t=board.find(t=>t.team===r.team&&t.group===e.group);if(!t)continue;
   const included=counted&&r.status==='valid'&&r.score!=null;
   t.details.push({eventId:e.id,event:e.name,sex:e.sex,name:r.name,status:r.status,value:r.value||'',rank:r.rank??null,registered:e.entries.length,basePoints:r.baseScore==null?null:r.baseScore/(e.relay?2:1),multiplier:e.relay?2:1,bonus:r.bonus??0,score:r.score??null,counted:included,contribution:included?r.score:0,reason:e.preliminary?'预赛不计分':!st.confirmed?'项目未确认':r.status!=='valid'?'无有效成绩':r.score==null?'名次待确认':r.rank>6?'第六名以外，不计名次分':'已计入'});
   if(!included)continue;
   t.score+=r.score;
   if(r.rank===1)t.wins++;
   if(r.rank>=2&&r.rank<=6)t.placeParticipants[r.rank]+=e.entries.length;
  }
 }
 board.sort(compareTeams);
 board.forEach(t=>t.rank=confirmed?board.findIndex(x=>compareTeams(x,t)===0)+1:null);
 return {rows:board,confirmed,total:events.filter(e=>!e.preliminary).length};
}

// 奖项只汇总经裁判确认的正式项目；接力没有个人报名信息，不分摊给个人。
export function awardSummary(seed,state,group=null){
 const events=seed.events.filter(e=>(!group||e.group===group)&&!e.preliminary&&e.entries.length);
 const teams=summary(seed,state,group).rows;
 const people=new Map(),singles=[];let confirmed=0;
 for(const e of events){
  for(const r of e.entries)if(!e.relay){const id=e.group+'|'+r.id;if(!people.has(id))people.set(id,{id,name:r.name,team:r.team,group:e.group,sex:e.sex,score:0,details:[]});}
  const st=state.events[e.id];if(!st?.confirmed)continue;confirmed++;
  for(const r of rankEvent(e,st.results).rows){if(r.status!=='valid'||r.score==null)continue;
   if(!e.relay){const p=people.get(e.group+'|'+r.id);p.score+=r.score;p.details.push({event:e.name,rank:r.rank,baseScore:r.baseScore,bonus:r.bonus,score:r.score});}
   if(r.awarded)singles.push({group:e.group,sex:e.sex,event:e.name,name:r.name,team:r.team,rank:r.rank,score:r.score,relay:e.relay});
  }
 }
 function rank(rows,quota,category){const compare=category==='teams'?compareTeams:(a,b)=>b.score-a.score;rows.sort(compare);for(const r of rows){r.id=r.id||r.team;r.rank=rows.findIndex(x=>compare(x,r)===0)+1;const same=rows.filter(x=>compare(x,r)===0).length;r.cutoffTie=r.score>0&&r.rank<=quota&&r.rank+same-1>quota;r.selected=(state.awardDecisions?.[category]||[]).includes(r.id);r.award=r.score>0&&r.rank<=quota&&!r.cutoffTie;}
  const tied=rows.filter(r=>r.cutoffTie),slots=tied.length?quota-tied[0].rank+1:0;
  if(tied.filter(r=>r.selected).length===slots)for(const r of tied){r.award=r.selected;r.resolved=true;}
  return rows;}
 const athletes=[...people.values()];
 return {teams:rank(teams,6,'teams'),men:rank(athletes.filter(p=>p.sex==='男子'),3,'men'),women:rank(athletes.filter(p=>p.sex==='女子'),3,'women'),singles,confirmed,total:events.length,final:events.length>0&&confirmed===events.length};
}
