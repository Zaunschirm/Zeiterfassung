
// V65 – Drag&Drop Wochenplanung
function initPlanningDnD(){
  const today = new Date();
  weekPicker.value = isoWeekString(today);
  renderBoard();

  prevWeek.addEventListener('click', ()=> shiftWeek(-1));
  nextWeek.addEventListener('click', ()=> shiftWeek(1));
  weekPicker.addEventListener('change', renderBoard);
  copyPrev.addEventListener('click', copyPreviousWeek);
  clearWeek.addEventListener('click', ()=>{ if(confirm('Woche wirklich leeren?')){ const all=readPlan(); all[weekPicker.value]={}; writePlan(all); renderBoard(); } });
  exportCsv.addEventListener('click', exportPlanningCsv);
  empSearch.addEventListener('input', renderEmpList);
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
function daysOfWeek(weekStr){
  const start=weekInputToDate(weekStr);
  return Array.from({length:7},(_,i)=>{ const d=new Date(start); d.setDate(start.getDate()+i); return d; });
}
function shiftWeek(delta){ const d=weekInputToDate(weekPicker.value); d.setDate(d.getDate()+delta*7); weekPicker.value=isoWeekString(d); renderBoard(); }

function renderBoard(){
  // Emp list
  renderEmpList();
  // Days columns
  const days = daysOfWeek(weekPicker.value);
  boardCols.innerHTML = days.map(d=>{
    const id = dateKey(d);
    const head = d.toLocaleDateString('de-AT', {weekday:'long', day:'2-digit', month:'2-digit'});
    return `<div class="daycol" data-date="${id}">
      <div class="dayhead">${head}</div>
      <div class="daydrop" data-date="${id}"></div>
    </div>`;
  }).join('');

  // Fill assignments
  const data = readPlan()[weekPicker.value] || {};
  days.forEach(d=>{
    const dk = dateKey(d);
    const list = (data[dk]||[]);
    list.forEach(item=> addAssignmentChip(dk, item.uid, item.label, false));
  });

  // Activate droppables
  document.querySelectorAll('.daydrop').forEach(zone=>{
    zone.addEventListener('dragover', e=>{ e.preventDefault(); zone.classList.add('highlight'); });
    zone.addEventListener('dragleave', ()=> zone.classList.remove('highlight'));
    zone.addEventListener('drop', e=>{
      e.preventDefault(); zone.classList.remove('highlight');
      const uid = e.dataTransfer.getData('text/plain');
      const label = buildLabel();
      addAssignmentChip(zone.dataset.date, uid, label, true);
    });
  });
}

function renderEmpList(){
  const users = readUsers();
  const term = (document.getElementById('empSearch').value||'').toLowerCase();
  const list = users.filter(u=> (u.name||'').toLowerCase().includes(term) || (u.username||'').toLowerCase().includes(term));
  empList.innerHTML = list.map(u=>`<span class="empchip" draggable="true" data-uid="${u.id}">${escapeHtml(u.name||u.username)} <span class="badge">${u.role}</span></span>`).join('');
  empList.querySelectorAll('.empchip').forEach(chip=>{
    chip.addEventListener('dragstart', e=>{
      e.dataTransfer.setData('text/plain', chip.dataset.uid);
      e.dataTransfer.effectAllowed='copy';
    });
  });
}

function buildLabel(){
  const p = document.getElementById('preset').value;
  const n = document.getElementById('note').value.trim();
  if(p && n) return p+' · '+n;
  return p || n || '';
}

function addAssignmentChip(dateKeyStr, uid, label, persist){
  const zone = document.querySelector(`.daydrop[data-date="${dateKeyStr}"]`);
  const user = readUsers().find(u=>u.id===uid);
  if(!user || !zone) return;
  // prevent duplicates of same user+label in same day
  const exists = Array.from(zone.querySelectorAll('.assignment')).some(x=> x.dataset.uid===uid && x.dataset.label===(label||''));
  if(exists) return;
  const wrap = document.createElement('span');
  wrap.className = 'assignment';
  wrap.dataset.uid = uid;
  wrap.dataset.label = label||'';
  wrap.innerHTML = `${escapeHtml(user.name||user.username)} ${label?`<span class="label">${escapeHtml(label)}</span>`:''} <button title="Entfernen">×</button>`;
  wrap.querySelector('button').addEventListener('click', ()=>{
    wrap.remove();
    saveZone(dateKeyStr);
  });
  zone.appendChild(wrap);
  if(persist) saveZone(dateKeyStr);
}

function saveZone(dateKeyStr){
  const all = readPlan();
  const week = weekPicker.value;
  if(!all[week]) all[week] = {};
  const zone = document.querySelector(`.daydrop[data-date="${dateKeyStr}"]`);
  const items = Array.from(zone.querySelectorAll('.assignment')).map(el=>({uid: el.dataset.uid, label: el.dataset.label||''}));
  all[week][dateKeyStr] = items;
  writePlan(all);
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
  const data = readPlan()[weekStr] || {};
  const header = ['Mitarbeiter', ...days.map(d=>d.toLocaleDateString('de-AT',{weekday:'short', day:'2-digit', month:'2-digit'}))];
  const rows = [header];
  users.forEach(u=>{
    const row = [u.name||u.username];
    days.forEach(d=>{
      const list = (data[dateKey(d)]||[]).filter(x=>x.uid===u.id);
      const txt = list.map(x=>x.label||'').join(', ');
      row.push(txt);
    });
    rows.push(row);
  });
  const csv = rows.map(r=>r.join(';')).join('\n');
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'Wocheneinteilung_'+weekStr+'.csv'; a.click();
  URL.revokeObjectURL(url);
}

function dateKey(d){ return d.toISOString().slice(0,10); }
function escapeHtml(s){ return (s||'').replace(/[&<>\"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',\"'\":'&#39;' }[c])); }
