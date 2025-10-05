
// V67 – Weekly planning like 123erfasst: drag employees to day+project lanes
function initPlanning123(){
  const today = new Date(); weekPicker.value = isoWeekString(today);
  // init events
  prevWeek.addEventListener('click', ()=> shiftWeek(-1));
  nextWeek.addEventListener('click', ()=> shiftWeek(1));
  weekPicker.addEventListener('change', renderBoard);
  copyPrev.addEventListener('click', copyPreviousWeek);
  clearWeek.addEventListener('click', ()=>{ if(confirm('Woche wirklich leeren?')){ const all=readPlan(); all[weekPicker.value]={}; writePlan(all); renderBoard(); }});
  exportCsv.addEventListener('click', exportPlanningCsv);
  addProject.addEventListener('click', ()=>{
    const name = (projName.value||'').trim(); const color = projColor.value||'#C8A86B';
    if(!name) return;
    const projs = readProjects(); projs.push({id:'p'+Math.random().toString(36).slice(2,9), name, color});
    writeProjects(projs); projName.value=''; renderBoard();
  });
  renderBoard();
}

function isoWeekString(d){
  const dt=new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()));
  const dayNum=(dt.getUTCDay()+6)%7; dt.setUTCDate(dt.getUTCDate()-dayNum+3);
  const firstThursday=new Date(Date.UTC(dt.getUTCFullYear(),0,4));
  const weekNo=1+Math.round(((dt-firstThursday)/86400000-3+((firstThursday.getUTCDay()+6)%7))/7);
  const year=dt.getUTCFullYear(); return year+'-W'+String(weekNo).padStart(2,'0');
}
function weekInputToDate(weekStr){
  const [y,w]=weekStr.split('-W').map(Number);
  const simple=new Date(Date.UTC(y,0,1+(w-1)*7));
  const dow=simple.getUTCDay(); const start=new Date(simple);
  if(dow<=4) start.setUTCDate(simple.getUTCDate()-dow+1); else start.setUTCDate(simple.getUTCDate()+8-dow);
  return new Date(start);
}
function daysOfWeek(weekStr){ const start=weekInputToDate(weekStr); return Array.from({length:7},(_,i)=>{ const d=new Date(start); d.setDate(start.getDate()+i); return d; }); }
function dateKey(d){ return d.toISOString().slice(0,10); }

function readProjects(){ return JSON.parse(localStorage.getItem('z_projects')||'[]'); }
function writeProjects(arr){ localStorage.setItem('z_projects', JSON.stringify(arr)); }

function renderBoard(){
  // Employees
  const users = readUsers();
  const term = (document.getElementById('empSearch').value||'').toLowerCase();
  const emps = users.filter(u=> (u.name||'').toLowerCase().includes(term) || (u.username||'').toLowerCase().includes(term));
  empList.innerHTML = emps.map(u=>`<span class="empchip" draggable="true" data-uid="${u.id}">${escapeHtml(u.name||u.username)}</span>`).join('');
  empList.querySelectorAll('.empchip').forEach(chip=>{
    chip.addEventListener('dragstart', e=>{ e.dataTransfer.setData('text/plain', JSON.stringify({type:'emp', uid: chip.dataset.uid})); e.dataTransfer.effectAllowed='copy'; });
  });

  // Projects list editor
  const projs = readProjects();
  projList.innerHTML = projs.map(p=>`<span class="projchip" data-pid="${p.id}"><span class="color" style="background:${p.color}"></span>${escapeHtml(p.name)} <button class="remove" title="Löschen">×</button></span>`).join('');
  projList.querySelectorAll('.projchip .remove').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const pid = btn.parentElement.getAttribute('data-pid');
      const arr = readProjects().filter(x=>x.id!==pid); writeProjects(arr); renderBoard();
    });
  });

  // Board columns
  const days = daysOfWeek(weekPicker.value);
  const all = readPlan()[weekPicker.value] || {};
  const cols = days.map(d=>{
    const dk = dateKey(d);
    const lanes = projs.map(p=>{
      const list = (((all[dk]||{})[p.id])||[]);
      return `<div class="project" data-date="${dk}" data-pid="${p.id}">
        <div class="projhead"><span><span class="projcolor" style="background:${p.color}"></span>${escapeHtml(p.name)}</span></div>
        <div class="projdrop" data-date="${dk}" data-pid="${p.id}">${list.map(item=> renderAssignmentChip(item.uid)).join('')}</div>
      </div>`;
    }).join('');
    const head = d.toLocaleDateString('de-AT',{weekday:'long', day:'2-digit', month:'2-digit'});
    return `<div class="daycol" data-date="${dk}"><div class="dayhead">${head}</div>${lanes || '<div style="padding:10px; color:#777">Keine Projekte – oben anlegen.</div>'}</div>`;
  }).join('');
  boardCols.innerHTML = cols;

  // Activate drops & assignment drags
  document.querySelectorAll('.projdrop').forEach(zone=>{
    zone.addEventListener('dragover', e=>{ e.preventDefault(); zone.classList.add('highlight'); });
    zone.addEventListener('dragleave', ()=> zone.classList.remove('highlight'));
    zone.addEventListener('drop', e=>{
      e.preventDefault(); zone.classList.remove('highlight');
      const data = JSON.parse(e.dataTransfer.getData('text/plain'));
      if(data.type==='emp'){
        addAssign(zone.dataset.date, zone.dataset.pid, data.uid);
      } else if(data.type==='move'){
        moveAssign(data.uid, data.fromDate, data.fromPid, zone.dataset.date, zone.dataset.pid);
      }
    });
  });

  // Make existing assignments draggable
  document.querySelectorAll('.assignment').forEach(chip=>{
    chip.addEventListener('dragstart', e=>{
      const from = chip.closest('.projdrop');
      const payload = {type:'move', uid: chip.dataset.uid, fromDate: from.dataset.date, fromPid: from.dataset.pid};
      e.dataTransfer.setData('text/plain', JSON.stringify(payload));
      e.dataTransfer.effectAllowed='move';
    });
  });
}

function renderAssignmentChip(uid){
  const u = readUsers().find(x=>x.id===uid); if(!u) return '';
  return `<span class="assignment" draggable="true" data-uid="${u.id}">${escapeHtml(u.name||u.username)}</span>`;
}

function addAssign(date, pid, uid){
  const all = readPlan(); const week = weekPicker.value;
  if(!all[week]) all[week] = {}; if(!all[week][date]) all[week][date] = {}; if(!all[week][date][pid]) all[week][date][pid] = [];
  // prevent duplicate user in same project/day
  if(all[week][date][pid].some(x=>x.uid===uid)) return;
  all[week][date][pid].push({uid});
  writePlan(all); renderBoard();
}

function moveAssign(uid, fromDate, fromPid, toDate, toPid){
  if(fromDate===toDate && fromPid===toPid) return;
  const all = readPlan(); const week=weekPicker.value;
  const arr = (((all[week]||{})[fromDate]||{})[fromPid]||[]);
  const idx = arr.findIndex(x=>x.uid===uid); if(idx<0) return;
  const item = arr.splice(idx,1)[0];
  if(!all[week]) all[week] = {}; if(!all[week][toDate]) all[week][toDate]={}; if(!all[week][toDate][toPid]) all[week][toDate][toPid]=[];
  // avoid duplicate at destination
  if(!all[week][toDate][toPid].some(x=>x.uid===uid)) all[week][toDate][toPid].push(item);
  writePlan(all); renderBoard();
}

function copyPreviousWeek(){
  const cur = weekPicker.value;
  const prevDate = weekInputToDate(cur); prevDate.setDate(prevDate.getDate()-7);
  const prev = isoWeekString(prevDate);
  const all = readPlan();
  if(!all[prev]){ alert('Keine Vorwoche vorhanden.'); return; }
  all[cur] = JSON.parse(JSON.stringify(all[prev]));
  writePlan(all); renderBoard();
}

function exportPlanningCsv(){
  const weekStr = weekPicker.value;
  const days = daysOfWeek(weekStr);
  const users = readUsers();
  const projs = readProjects();
  const data = readPlan()[weekStr] || {};
  const header = ['Mitarbeiter', ...days.map(d=>d.toLocaleDateString('de-AT',{weekday:'short', day:'2-digit', month:'2-digit'}))];
  const rows = [header];
  users.forEach(u=>{
    const row = [u.name||u.username];
    days.forEach(d=>{
      const dk = dateKey(d);
      const entries = projs.map(p=>{
        const list = (((data[dk]||{})[p.id])||[]).filter(x=>x.uid===u.id);
        return list.length ? p.name : '';
      }).filter(Boolean);
      row.push(entries.join(', '));
    });
    rows.push(row);
  });
  const csv = rows.map(r=>r.join(';')).join('\\n');
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'Wocheneinteilung_'+weekStr+'.csv'; a.click();
  URL.revokeObjectURL(url);
}

function escapeHtml(s){ return (s||'').replace(/[&<>\"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',\"'\":'&#39;' }[c])); }
