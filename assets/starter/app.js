import {rankEvent,summary,awardSummary} from './logic.mjs';
const points=v=>v==null?'—':Number(v.toFixed(4)).toString();
const $=s=>document.querySelector(s);const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const queryKey=new URLSearchParams(location.search).get('key');
let key=queryKey||new URLSearchParams(location.hash.slice(1)).get('key')||sessionStorage.getItem('score-key')||'';
if(location.hash||queryKey)history.replaceState(null,'',location.pathname);
let snapshot=null,group='丙组',sex='男子',eventKey='100-pre',view='entry',search='',filterTeam='',editing=null,confirming=null,busy=false,online=false;
let timer;
let searchComposing=false;
let refreshPending=null,sharePending=false;
let teamScope='all';
const icons=()=>window.lucide?.createIcons();
function toast(text){$('#toast').textContent=text;$('#toast').hidden=false;clearTimeout(timer);timer=setTimeout(()=>$('#toast').hidden=true,3500);}
async function api(route,options={}){
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),8000);
 try{
  const res=await fetch(route,{cache:'no-store',...options,signal:controller.signal,headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json',...options.headers}});
  const text=await res.text();let value;try{value=JSON.parse(text);}catch{const e=Error('共享连接暂时不可用，请稍后重试');e.status=res.status;throw e;}
  if(!res.ok){const e=Error(value.error||'请求失败，请重试');e.status=res.status;throw e;}return value;
 }catch(e){if(e.name==='AbortError'||e instanceof TypeError)throw Error(options.method==='POST'?'连接中断，保存状态尚未确认。请恢复连接并刷新核实后再操作。':'连接超时或中断，请检查网络后重试');throw e;}finally{clearTimeout(timeout);}
}
function event(){return snapshot.seed.events.find(e=>e.group===group&&e.sex===sex&&e.key===eventKey);}
function currentState(){return snapshot.state.events[event().id]||{results:{},version:0,confirmed:false};}
function statusTag(r){return r.needsReview?'<span class="badge review">并列待确认</span>':`<span class="badge ${r.status==='valid'?'confirmed':''}">${{pending:'待录入',valid:'有效',dns:'未参赛',dnf:'未完成',dq:'犯规'}[r.status]}</span>`;}
function render(){
 // Keep the live input attached while the IME owns its composing text.
 if(searchComposing)return;
 const isEditor=snapshot.role==='editor';document.body.classList.toggle('readonly',!isEditor);
 $('#role').textContent=isEditor?'录入权限':'只读查看';$('#login').hidden=true;$('#desk').hidden=false;
 $('#operator').value=localStorage.getItem('score-operator')||'';
 $('#updated').textContent=snapshot.state.updatedAt?'更新于 '+new Date(snapshot.state.updatedAt).toLocaleString('zh-CN',{hour12:false}):'尚无成绩';
 $('#team-count').textContent=snapshot.seed.teams.filter(t=>t.group===group).length+' 支代表队';
 $('#athlete-count').textContent=new Set(snapshot.seed.events.filter(e=>e.group===group&&!e.relay).flatMap(e=>e.entries.map(r=>r.id))).size+' 名运动员';
 const full=['teams','people','awards'].includes(view);
 $('#sidebar').hidden=full;document.querySelector('main').style.gridTemplateColumns=full?'1fr':'';
 $('#group').hidden=view==='people'||view==='awards';
 $('#events').innerHTML=snapshot.seed.events.filter(e=>e.group===group&&e.sex===sex).map(e=>`<button class="event ${e.key===eventKey?'active':''}" data-event="${e.key}"><span>${esc(e.name)}</span><small class="${snapshot.state.events[e.id]?.confirmed?'done':''}">${snapshot.state.events[e.id]?.confirmed?'已确认':e.entries.length+(e.relay?'队':'人')}</small></button>`).join('');
 document.querySelectorAll('#group button').forEach(b=>b.classList.toggle('active',b.dataset.value===group));
 document.querySelectorAll('#sex button').forEach(b=>b.classList.toggle('active',b.dataset.value===sex));
 document.querySelectorAll('#tabs button').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
 if(view==='teams'){renderTeams();icons();return;}
 if(view==='people'||view==='awards'){renderAwards(view==='people');icons();return;}
 const e=event(),st=currentState(),ranked=rankEvent(e,st.results);let rows=ranked.rows;
 const pending=rows.filter(r=>r.status==='pending').length;const ties=rows.filter(r=>r.needsReview).length;
 const head=`<div class="page-head"><div><h1>${esc(e.name)} <span class="muted">/ ${sex}</span></h1><div class="meta"><span>${group}</span><span>${e.entries.length} ${e.relay?'支接力队':'人报名'}</span><span>录取前 ${ranked.limit} 名${e.preliminary?' · 预赛不计分':''}</span><span class="badge ${st.confirmed?'confirmed':''}">${st.confirmed?'已确认':'进行中'}</span></div></div>${isEditor&&e.entries.length?`<button id="confirm-event" ${online?'':'disabled'} class="${st.confirmed?'':'primary'}"><i data-lucide="${st.confirmed?'undo-2':'check-check'}"></i>${st.confirmed?'撤回确认':'确认项目'}</button>`:''}</div>`;
 const notice=st.confirmed?'<div class="notice confirmed">项目成绩已确认'+(e.preliminary?'。':'，已计入团体总分。')+'</div>':ties?`<div class="notice">${ties} 条成绩并列待确认。请裁判为同成绩运动员填写正式名次，再确认项目。允许同成绩同名次，并列后须跳过所占名次。</div>`:pending?`<div class="notice">还有 ${pending} 条待录入记录。项目确认后${e.preliminary?'将锁定预赛成绩':'计入团体总分'}。</div>`:'';
 const teams=[...new Set(e.entries.map(r=>r.team))];
 const filters=`<div class="filters"><input id="search" aria-label="搜索姓名" placeholder="搜索姓名" value="${esc(search)}"><select id="team-filter" aria-label="筛选代表队"><option value="">全部代表队</option>${teams.map(t=>`<option ${filterTeam===t?'selected':''} value="${esc(t)}">${esc(t)}</option>`).join('')}</select><span class="count">${e.type==='track'?'用时 / 秒或分:秒':'成绩 / 米'} · ${rows.length-pending}/${rows.length} 已处理</span></div>`;
 if(view==='entry')rows=[...rows].sort((a,b)=>e.entries.findIndex(x=>x.id===a.id)-e.entries.findIndex(x=>x.id===b.id));
 rows=rows.filter(r=>(!filterTeam||r.team===filterTeam)&&(!search||r.name.includes(search)||r.team.includes(search)));
 const table=rows.length?`<div class="table-wrap"><table><thead><tr>${view==='ranking'?'<th class="position">名次</th>':''}<th>运动员 / 代表队</th><th class="table-value">成绩</th>${view==='entry'?'<th class="result-status">状态</th>':'<th class="table-score">得分</th>'}${view==='entry'&&isEditor?'<th class="table-action"></th>':''}</tr></thead><tbody>${rows.map(r=>`<tr>${view==='ranking'?`<td class="position">${r.rank??'—'}</td>`:''}<td class="name-cell"><strong>${esc(r.name)}</strong><small>${esc(r.team)}</small>${view==='ranking'&&r.needsReview?statusTag(r):''}</td><td class="value">${r.status==='valid'?esc(r.value)+(r.recordBroken?'<small class="record-note">破校纪录 +2</small>':''):r.status==='pending'?'<span class="muted">—</span>':statusTag(r)}</td>${view==='entry'?`<td>${statusTag(r)}</td>`:`<td class="score">${points(r.score)}</td>`}${view==='entry'&&isEditor?`<td class="table-action"><button data-edit="${r.id}" title="填写或修改成绩" ${st.confirmed||!online?'disabled':''}><i data-lucide="square-pen"></i>${r.status==='pending'?'填写':'修改'}</button></td>`:''}</tr>`).join('')}</tbody></table></div>`:'<div class="empty">暂无符合条件的参赛记录</div>';
 $('#workspace').innerHTML=head+notice+filters+table;icons();
}
function renderTeams(){
 const board=summary(snapshot.seed,snapshot.state,teamScope==='all'?null:group);const max=board.rows[0]?.score||1;
 const detailRows=t=>t.details.map(d=>`<tr><td>${esc(d.sex)} · ${esc(d.event)}<small class="muted"> · ${esc(d.name)}</small></td><td>${d.value?esc(d.value):'—'}</td><td>${d.rank??'—'}</td><td>${points(d.basePoints)}</td><td>×${d.multiplier}</td><td>${points(d.bonus)}</td><td>${points(d.contribution)}</td><td>${esc(d.reason)}</td></tr>`).join('');
 $('#workspace').innerHTML=`<div class="page-head"><div><h1>${teamScope==='all'?'丙丁合并':group}团体积分榜</h1><div class="meta"><span>${board.rows.length} 支代表队</span><span class="badge ${board.confirmed===board.total?'confirmed':'review'}">${board.confirmed===board.total?'全部项目已确认':'阶段积分'}</span></div></div><button id="export-team-details"><i data-lucide="download"></i>导出积分明细</button></div><div class="filters"><select id="team-scope" aria-label="团体榜范围"><option value="all" ${teamScope==='all'?'selected':''}>丙丁合并</option><option value="group" ${teamScope==='group'?'selected':''}>仅看${group}</option></select><span>已确认 ${board.confirmed} / ${board.total} 个正式项目</span></div><div class="notice">按前六名7、5、4、3、2、1分计分，不再减1录取；接力名次分×2，破校纪录另加2分。同总分先比冠军次数，再比获第2至6名项目的报名人数汇总。</div><div class="table-wrap"><table><thead><tr><th class="position">名次</th><th>代表队</th><th>总分</th><th>冠军次数</th><th>获第2名项目报名人数合计</th></tr></thead><tbody>${board.rows.map(t=>`<tr><td class="position">${t.rank??'—'}</td><td class="team-name">${esc(t.team)}<div class="bar"><span></span></div></td><td class="score">${points(t.score)}</td><td>${t.wins}</td><td>${t.placeParticipants[2]}</td></tr>`).join('')}</tbody></table></div><section class="award-section"><h2>各代表队积分明细</h2>${board.rows.map(t=>`<details class="team-ledger"><summary>${esc(t.team)} · ${points(t.score)}分 · 积分明细</summary><div class="meta"><span>冠军 ${t.wins} 次</span>${[2,3,4,5,6].map(n=>`<span>获第${n}名项目报名人数合计 ${t.placeParticipants[n]}</span>`).join('')}</div><div class="table-wrap"><table><thead><tr><th>项目 / 运动员</th><th>成绩</th><th>名次</th><th>基础分</th><th>倍数</th><th>破纪录加分</th><th>计入团体分</th><th>计入状态</th></tr></thead><tbody>${detailRows(t)}</tbody><tfoot><tr><th colspan="6">团体合计</th><th>${points(t.score)}</th><th>仅汇总已确认正式项目</th></tr></tfoot></table></div></details>`).join('')}</section>`;
 // Widths are data-only values; CSP allows no inline styles, so assign through the CSSOM.
 $('#workspace').querySelectorAll('.bar span').forEach((el,i)=>{el.removeAttribute('style');el.style.width=Math.round(board.rows[i].score/max*100)+'%';});
}
function renderAwards(personal){
 const a=awardSummary(snapshot.seed,snapshot.state),editor=snapshot.role==='editor';
 const pending=[...a.teams,...a.men,...a.women].some(r=>r.cutoffTie&&!r.resolved);
 const status=a.final?(pending?'积分已结算 · 同分待裁判确认':'全部项目已确认'):'暂定结果 · 比赛尚未全部确认';
 function rowsTable(rows,category,title){
  const list=personal?rows:rows.filter(r=>r.award||r.cutoffTie);
  return `<section class="award-section"><h2>${title}</h2>${list.length?`<div class="table-wrap"><table><thead><tr><th class="position">名次</th><th>${category==='teams'?'代表队':'运动员 / 代表队'}</th><th class="table-score">总分</th><th class="award-status">${personal?'已确认单项得分':'奖项状态'}</th></tr></thead><tbody>${list.map(r=>`<tr><td class="position">${r.rank}</td><td class="name-cell"><strong>${esc(r.name||r.team)}</strong><small>${esc(r.group)}${r.name?' · '+esc(r.team):''}</small></td><td class="score">${points(r.score)}</td><td>${personal?`<small class="muted">${r.details.map(d=>`${esc(d.event)} 第${d.rank}名 ${points(d.score)}分${d.bonus?'（含破纪录+2）':''}`).join('<br>')||'尚无已确认积分'}</small>`:r.cutoffTie?`<span class="badge ${r.resolved?'confirmed':'review'}">${r.resolved?(r.award?'裁判选定':'未选定'):'同分待裁判确认'}</span>${editor?`<button class="award-choice" data-category="${category}" data-person="${esc(r.id)}" data-selected="${!r.selected}" ${online?'':'disabled'}>${r.selected?'取消选定':'裁判选定'}</button>`:''}`:`<span class="badge ${a.final?'confirmed':'review'}">${a.final?'获奖':'暂定获奖'}</span>`}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">等待已确认项目产生积分</div>'}</section>`;
 }
 $('#workspace').innerHTML=`<div class="page-head"><div><h1>${personal?'个人积分榜':'自动评奖'}</h1><div class="meta"><span>丙丁合并评选</span><span>已确认 ${a.confirmed} / ${a.total} 个正式项目</span></div></div>${!personal?'<button id="export-awards"><i data-lucide="download"></i>导出奖项</button>':''}</div><div class="notice ${a.final&&!pending?'confirmed':''}">${status}。团体前6队，最佳运动员男子、女子各3人。接力只计团体，预赛不计分。${pending?'获奖名额处存在同分，请裁判选足剩余名额。':''}</div>${personal?'':rowsTable(a.teams,'teams','最佳团体奖 · 前6队')}${rowsTable(a.men,'men',personal?'男子个人积分':'最佳男子运动员 · 前3人')}${rowsTable(a.women,'women',personal?'女子个人积分':'最佳女子运动员 · 前3人')}${personal?'':`<section class="award-section"><h2>各单项获奖名单</h2><p class="muted">仅显示已确认正式项目的前六名，不减1录取。接力以代表队列出。</p>${a.singles.length?`<div class="table-wrap"><table><thead><tr><th>组别 / 项目</th><th>运动员 / 代表队</th><th class="position">名次</th><th class="table-score">得分</th></tr></thead><tbody>${a.singles.map(r=>`<tr><td>${esc(r.group)} · ${esc(r.sex)}<br>${esc(r.event)}</td><td class="name-cell"><strong>${esc(r.name)}</strong><small>${esc(r.team)}</small></td><td class="position">${r.rank}</td><td class="score">${points(r.score)}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">等待项目确认</div>'}</section>`}`;
}
async function refresh(force=false){
 if(refreshPending){await refreshPending;if(force)return refresh(true);return;}
 refreshPending=(async()=>{
 try{const wasOnline=online,next=await api('/api/state');online=true;$('#connection').textContent='已同步';$('#connection').title='点击重新同步';$('#connection').classList.remove('offline');
  if(force||!wasOnline||!snapshot||next.state.revision!==snapshot.state.revision){snapshot=next;render();}
 }catch(e){const wasOnline=online;online=false;$('#connection').textContent='连接中断 · 点击重试';$('#connection').title='正在自动重连，也可点击重试';$('#connection').classList.add('offline');if(!snapshot||e.status===401){$('#login').hidden=false;$('#desk').hidden=true;$('#login-error').textContent=e.status===401?e.message:'暂时无法连接，正在自动重试，请勿重新输入访问码';}else{if(wasOnline)render();if(force)toast(e.message);}}
 })();try{await refreshPending;}finally{refreshPending=null;}
}
function openEdit(id){
 const e=event(),r=e.entries.find(r=>r.id===id),st=currentState().results[id]||{version:0};editing={eventId:e.id,entryId:id,version:st.version};
 $('#edit-name').textContent=r.name;$('#edit-team').textContent=r.team+' · '+e.name+' · '+e.sex;
 $('#edit-status').value=st.status&&st.status!=='pending'?st.status:'valid';$('#edit-value').value=st.value||'';$('#edit-rank').value=st.officialRank||'';$('#edit-rank').max=e.entries.length;
 $('#edit-record').checked=!!st.recordBroken;$('#record-label').hidden=e.preliminary;
 $('#edit-value').placeholder=e.type==='track'?'例如 12.35 或 2:31.45':'例如 4.52';$('#edit-error').textContent='';statusFields();$('#edit-dialog').showModal();$('#edit-value').focus();
}
function statusFields(){const enabled=$('#edit-status').value==='valid';$('#value-label').hidden=!enabled;$('#rank-label').hidden=!enabled;$('#record-label').hidden=!enabled||event().preliminary;$('#edit-value').required=enabled;}
$('#edit-status').addEventListener('change',statusFields);
$('#edit-form').addEventListener('submit',async ev=>{ev.preventDefault();if(busy)return;busy=true;$('#save-result').disabled=true;try{await api('/api/result',{method:'POST',body:JSON.stringify({...editing,status:$('#edit-status').value,value:$('#edit-value').value,officialRank:$('#edit-status').value==='valid'?$('#edit-rank').value:null,recordBroken:$('#edit-status').value==='valid'&&!event().preliminary&&$('#edit-record').checked,operator:$('#operator').value})});$('#edit-dialog').close();await refresh(true);toast('成绩已保存');}catch(e){$('#edit-error').textContent=e.message;if(e.status===409)await refresh(true);}finally{busy=false;$('#save-result').disabled=false;}});
$('#workspace').addEventListener('click',ev=>{const b=ev.target.closest('button');if(!b)return;if(b.dataset.edit)openEdit(b.dataset.edit);if(b.id==='confirm-event'){const e=event(),st=currentState();confirming={eventId:e.id,confirmed:!st.confirmed,version:st.version};$('#confirm-title').textContent=st.confirmed?'撤回项目确认':'确认项目成绩';$('#confirm-copy').textContent=st.confirmed?'撤回后可修改成绩，该项目会暂时移出正式团体总分。':`${group} · ${sex} · ${e.name}，确认后锁定本项目成绩${e.preliminary?'。':'并计入团体总分。'}`;$('#confirm-error').textContent='';$('#confirm-dialog').showModal();}});
$('#confirm-form').addEventListener('submit',async ev=>{ev.preventDefault();if(busy)return;busy=true;try{await api('/api/confirm',{method:'POST',body:JSON.stringify({...confirming,operator:$('#operator').value})});$('#confirm-dialog').close();await refresh(true);toast(confirming.confirmed?'项目已确认':'已撤回确认');}catch(e){$('#confirm-error').textContent=e.message;if(e.status===409)await refresh(true);}finally{busy=false;}});
function updateSearch(input){search=input.value;const start=input.selectionStart,end=input.selectionEnd;render();const current=$('#search');if(current){current.focus();current.setSelectionRange(start,end);}}
$('#workspace').addEventListener('compositionstart',ev=>{if(ev.target.id==='search')searchComposing=true;});
$('#workspace').addEventListener('compositionend',ev=>{if(ev.target.id==='search'){searchComposing=false;updateSearch(ev.target);}});
$('#workspace').addEventListener('input',ev=>{if(ev.target.id==='search'&&!searchComposing&&!ev.isComposing)updateSearch(ev.target);});
$('#workspace').addEventListener('change',ev=>{if(ev.target.id==='team-filter'){filterTeam=ev.target.value;render();}if(ev.target.id==='team-scope'){teamScope=ev.target.value;render();}});
$('#group').addEventListener('click',ev=>{const b=ev.target.closest('button');if(b){group=b.dataset.value;filterTeam='';search='';render();}});
$('#sex').addEventListener('click',ev=>{const b=ev.target.closest('button');if(b){sex=b.dataset.value;filterTeam='';search='';render();}});
$('#tabs').addEventListener('click',ev=>{const b=ev.target.closest('button');if(b){view=b.dataset.view;render();}});
$('#events').addEventListener('click',ev=>{const b=ev.target.closest('button');if(b){eventKey=b.dataset.event;filterTeam='';search='';render();}});
$('#operator').addEventListener('input',ev=>localStorage.setItem('score-operator',ev.target.value));
document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>b.closest('dialog').close()));
function shareUrl(token){return location.origin+'/?key='+encodeURIComponent(token);}
async function openShare(){
 if(!$('#share-dialog').open)$('#share-dialog').showModal();
 if(sharePending)return;sharePending=true;$('#share-links').innerHTML='<p role="status">正在获取共享链接，请稍候…</p>';
 try{const keys=await api('/api/share');$('#share-links').innerHTML=[['viewer','只读查看链接'],['editor','成绩录入链接']].filter(([k])=>keys[k]).map(([k,title])=>`<div class="share-row"><strong>${title}</strong><div class="share-line"><input readonly value="${esc(shareUrl(keys[k]))}" aria-label="${title}"><button class="copy-link" data-key="${k}" title="复制${title}" aria-label="复制${title}"><i data-lucide="copy"></i></button></div></div>`).join('')+'<p class="muted">复制后粘贴到微信或QQ发送。成绩录入链接仅发给记录员。</p>';icons();}
 catch(e){$('#share-links').innerHTML=`<p role="alert" class="error">${esc(e.message)}</p><button id="retry-share">重试获取链接</button>`;}
 finally{sharePending=false;}
}
$('#share').addEventListener('click',openShare);
$('#share-links').addEventListener('click',async ev=>{const b=ev.target.closest('button');if(!b)return;if(b.id==='retry-share'){openShare();return;}if(!b.classList.contains('copy-link'))return;const input=b.previousElementSibling;try{await navigator.clipboard.writeText(input.value);toast('共享链接已复制，可粘贴发送');}catch{input.focus();input.select();input.setSelectionRange(0,input.value.length);let copied=false;try{copied=document.execCommand('copy');}catch{}toast(copied?'共享链接已复制，可粘贴发送':'未能自动复制，请长按或选中链接手动复制');}});
async function download(route,name){try{const response=await fetch(route,{headers:{Authorization:`Bearer ${key}`}});if(!response.ok)throw Error('导出失败');const blob=await response.blob();const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}catch(e){toast(e.message);}}
$('#export').addEventListener('click',()=>download('/api/export','院运会成绩导出.csv'));
$('#backup').addEventListener('click',()=>download('/api/backup','院运会成绩备份.json'));
$('#workspace').addEventListener('click',ev=>{if(ev.target.closest('#export-team-details'))download('/api/export?kind=team-details','院运会团体积分明细.csv');});
$('#login-form').addEventListener('submit',async ev=>{ev.preventDefault();key=$('#access-key').value.trim();sessionStorage.setItem('score-key',key);await refresh(true);});
if(key){sessionStorage.setItem('score-key',key);await refresh(true);}else $('#login').hidden=false;
icons();setInterval(()=>{if(key&&!busy)refresh();},2500);
$('#connection').addEventListener('click',()=>{if(key&&!busy)refresh(true);});
window.addEventListener('online',()=>{if(key&&!busy)refresh(true);});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&key&&!busy)refresh(true);});

$('#workspace').addEventListener('click',async ev=>{
 const b=ev.target.closest('button');if(!b)return;
 if(b.id==='export-awards')return download('/api/export?kind=awards','院运会奖项名单.csv');
 if(b.dataset.category){if(busy)return;busy=true;b.disabled=true;
  try{await api('/api/award-selection',{method:'POST',body:JSON.stringify({category:b.dataset.category,id:b.dataset.person,selected:b.dataset.selected==='true',revision:snapshot.state.revision,operator:$('#operator').value})});await refresh(true);toast('裁判选择已保存');}
  catch(e){toast(e.message);await refresh(true);}finally{busy=false;b.disabled=false;}
 }
});
