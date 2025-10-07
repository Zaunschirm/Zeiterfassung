
function isoWeekString(d){ const dt=new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate())); const dayNum=(dt.getUTCDay()+6)%7; dt.setUTCDate(dt.getUTCDate()-dayNum+3); const firstThursday=new Date(Date.UTC(dt.getUTCFullYear(),0,4)); const weekNo=1+Math.round(((dt-firstThursday)/86400000-3+((firstThursday.getUTCDay()+6)%7))/7); const year=dt.getUTCFullYear(); return year+'-W'+String(weekNo).padStart(2,'0'); }
function weekInputToDate(weekStr){ const [y,w]=weekStr.split('-W').map(Number); const simple=new Date(Date.UTC(y,0,1+(w-1)*7)); const dow=simple.getUTCDay(); const start=new Date(simple); if(dow<=4) start.setUTCDate(simple.getUTCDate()-dow+1); else start.setUTCDate(simple.getUTCDate()+8-dow); return new Date(start); }
function daysOfWeek(weekStr){ const s=weekInputToDate(weekStr); return Array.from({length:7},(_,i)=>{ const d=new Date(s); d.setDate(s.getDate()+i); return d; }); }
function dateKey(d){ return d.toISOString().slice(0,10); }
function escapeHtml(s){ return (s||'').replace(/[&<>"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;' }[c])); }
async function initPlanning123(){
  const me=currentUser();
  const canEdit = (me && me.role==='admin');
  window.__canEditPlanning = canEdit;
  const today=new Date(); weekPicker.value = isoWeekString(today);
  prevWeek.addEventListener('click', ()=> shiftWeek(-1));
  nextWeek.addEventListener('click', ()=> shiftWeek(1));
  weekPicker.addEventListener('change', renderBoard);
  if(window.__canEditPlanning) copyPrev.addEventListener('click', copyPreviousWeek); else copyPrev.disabled=true;
  if(window.__canEditPlanning) clearWeek.addEventListener('click', async ()=>{ if(confirm('Woche wirklich leeren?')){ await DBAPI.writePlanWeek(weekPicker.value, {}); renderBoard(); }}); else clearWeek.disabled=true;
  exportCsv.addEventListener('click', exportPlanningCsv);
  if(window.__canEditPlanning) addProject.addEventListener('click', addProjectHandler); else addProject.disabled=true;
  renderBoard();
}
async function addProjectHandler(){
  const name=(projName.value||'').trim(); const color=projColor.value||'#C8A86B'; const cost=(projKst&&projKst.value||'').trim(); if(!name) return;
  await DBAPI.addProject({id:'p'+Math.random().toString(36).slice(2,9), name, color, costCenter: cost});
  if(projName) projName.value=''; if(projKst) projKst.value=''; renderBoard();
}
async function renderBoard(){
  const users = await DBAPI.readUsers(); const term=(empSearch.value||'').toLowerCase();
  const emps = users.filter(u=> (u.name||'').toLowerCase().includes(term) || (u.username||'').toLowerCase().includes(term));
  empList.innerHTML = emps.map(u=>`<span class="empchip" draggable="${window.__canEditPlanning?'true':'false'}" data-uid="${u.id}">${escapeHtml(u.name||u.username)}</span>`).join('');
  if(window.__canEditPlanning){
    empList.querySelectorAll('.empchip').forEach(chip=> chip.addEventListener('dragstart', e=>{ e.dataTransfer.setData('text/plain', JSON.stringify({type:'emp', uid:chip.dataset.uid})); e.dataTransfer.effectAllowed='copy'; }));
  }
  const projs = await DBAPI.readProjects();
  projList.innerHTML = projs.map(p=>`<span class="projchip" data-pid="${p.id}"><span class="projcolor" style="background:${p.color}"></span>${escapeHtml(p.name)}${p.costCenter?` <small style='color:#6b7280'>(KSt ${escapeHtml(p.costCenter)})</small>`:''} ${window.__canEditPlanning?'<button class="remove" title="Löschen">×</button>':''}</span>`).join('');
  if(window.__canEditPlanning){
    projList.querySelectorAll('.remove').forEach(btn=> btn.addEventListener('click', async ()=>{ const pid=btn.parentElement.getAttribute('data-pid'); await DBAPI.deleteProject(pid); renderBoard(); }));
  }
  const days = daysOfWeek(weekPicker.value);
  const daysData = await DBAPI.readPlanWeek(weekPicker.value);
  boardCols.innerHTML = days.map(d=>{
    const dk=dateKey(d);
    const lanes = projs.map(p=>{
      const list = (((daysData[dk]||{})[p.id])||[]);
      return `<div class="project" data-date="${dk}" data-pid="${p.id}">
        <div class="projhead"><span><span class="projcolor" style="background:${p.color}"></span>${escapeHtml(p.name)}</span></div>
        <div class="projdrop" data-date="${dk}" data-pid="${p.id}">${list.map(item=> renderAssignmentChip(item.uid)).join('')}</div>
      </div>`;
    }).join('');
    const head = d.toLocaleDateString('de-AT',{weekday:'long', day:'2-digit', month:'2-digit'});
    return `<div class="daycol" data-date="${dk}"><div class="dayhead">${head}</div>${lanes||'<div style="padding:10px; color:#777">Keine Projekte – oben anlegen.</div>'}</div>`;
  }).join('');
  if(window.__canEditPlanning){
    document.querySelectorAll('.projdrop').forEach(zone=>{
      zone.addEventListener('dragover', e=>{ e.preventDefault(); zone.classList.add('highlight'); });
      zone.addEventListener('dragleave', ()=> zone.classList.remove('highlight'));
      zone.addEventListener('drop', async e=>{
        e.preventDefault(); zone.classList.remove('highlight');
        const data = JSON.parse(e.dataTransfer.getData('text/plain'));
        if(data.type==='emp') await addAssign(zone.dataset.date, zone.dataset.pid, data.uid);
        else if(data.type==='move') await moveAssign(data.uid, data.fromDate, data.fromPid, zone.dataset.date, zone.dataset.pid);
      });
    });
    document.querySelectorAll('.assignment').forEach(chip=> chip.addEventListener('dragstart', e=>{
      const from = chip.closest('.projdrop'); const payload={type:'move', uid:chip.dataset.uid, fromDate:from.dataset.date, fromPid:from.dataset.pid};
      e.dataTransfer.setData('text/plain', JSON.stringify(payload)); e.dataTransfer.effectAllowed='move';
    }));
  }
}
function renderAssignmentChip(uid){ const u=(JSON.parse(localStorage.getItem(DB.usersKey)||'[]')).find(x=>x.id===uid); const name=u?(u.name||u.username):uid; return `<span class="assignment" draggable="${window.__canEditPlanning?'true':'false'}" data-uid="${uid}">${name}</span>`; }
async function addAssign(date,pid,uid){
  const days = await DBAPI.readPlanWeek(weekPicker.value);
  if(!days[date]) days[date]={}; if(!days[date][pid]) days[date][pid]=[];
  if(days[date][pid].some(x=>x.uid===uid)) return;
  days[date][pid].push({uid});
  await DBAPI.writePlanWeek(weekPicker.value, days);
  renderBoard();
}
async function moveAssign(uid,fd,fp,td,tp){
  if(fd===td && fp===tp) return;
  const days = await DBAPI.readPlanWeek(weekPicker.value);
  const arr=(((days[fd]||{})[fp]||[])); const idx=arr.findIndex(x=>x.uid===uid); if(idx<0) return; const item=arr.splice(idx,1)[0];
  if(!days[td]) days[td]={}; if(!days[td][tp]) days[td][tp]=[];
  if(!days[td][tp].some(x=>x.uid===uid)) days[td][tp].push(item);
  await DBAPI.writePlanWeek(weekPicker.value, days);
  renderBoard();
}
function shiftWeek(delta){ const ref=weekInputToDate(weekPicker.value); ref.setDate(ref.getDate()+delta*7); weekPicker.value = isoWeekString(ref); renderBoard(); }
function copyPreviousWeek(){ alert('Vorwoche kopieren: Funktion in V03b minimal – kann in V03c erweitert werden.'); }
function exportPlanningCsv(){
  (async ()=>{
    const w=weekPicker.value; const days=daysOfWeek(w);
    const users=JSON.parse(localStorage.getItem(DB.usersKey)||'[]'); const projs=await DBAPI.readProjects(); const data=await DBAPI.readPlanWeek(w);
    const header=['Mitarbeiter', ...days.map(d=>d.toLocaleDateString('de-AT',{weekday:'short',day:'2-digit',month:'2-digit'}))]; const rows=[header];
    users.forEach(u=>{ const row=[u.name||u.username]; days.forEach(d=>{ const dk=dateKey(d); const entries=projs.map(p=>{ const list=(((data[dk]||{})[p.id])||[]).filter(x=>x.uid===u.id); return list.length?p.name:''; }).filter(Boolean); row.push(entries.join(', ')); }); rows.push(row); });
    const csv=rows.map(r=>r.join(';')).join('\n'); const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='Wocheneinteilung_'+w+'.csv'; a.click(); URL.revokeObjectURL(url);
  })();
}
window.addEventListener('data-sync', (e)=>{ const evt=e.detail?.evt; if(evt==='plan'||evt==='projects'||evt==='users'){ renderBoard(); }});
