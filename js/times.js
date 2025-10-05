
let gridSelection = {start:null, end:null};
let dragging = false, anchor = null, lastTappedIdx = null;

function initTimesPage(){
  const me = currentUser();
  const cl = document.getElementById('userChecklist');
  const users = readUsers();
  const isLeadOrAdmin = (me.role==='admin' || me.role==='lead');
  let list = isLeadOrAdmin ? users : users.filter(u=>u.id===me.id);
  // render checkboxes
  cl.innerHTML = list.map(u=>`<label style="display:flex; align-items:center; gap:8px; padding:4px 0"><input type="checkbox" name="userChk" value="${u.id}" ${!isLeadOrAdmin?'checked disabled':''}> <span>${u.name||u.username}</span></label>`).join('');
  document.getElementById('multiHint').style.display = isLeadOrAdmin ? 'block' : 'none';

  document.getElementById('dateInput').valueAsDate = new Date();
  document.getElementById('pauseDropdown').value = '30';

  // buildTimeline removed in slider version
  setupSliders();
  // populate project select
  if(document.getElementById('projectSelect')){ populateProjectSelect(); document.getElementById('addProjBtn').addEventListener('click', addNewProject); }
  document.getElementById('bookBtn').addEventListener('click', bookFromGrid);
  document.getElementById('dayStatus').addEventListener('change', handleDayStatusLock);
  document.getElementById('dateInput').addEventListener('change', ()=>{ renderTimes(); renderMonth(); renderMonth(); });
  handleDayStatusLock();
  renderTimes(); renderMonth();
}

function buildTimeline(){
  const rs=document.getElementById('rangeStart'); const re=document.getElementById('rangeEnd');
  grid.innerHTML = '';
  for(let i=0;i<60;i++){
    const div = document.createElement('div');
    div.className = 'slot'; div.dataset.idx = i;
    div.addEventListener('mousedown', onSelectStart);
    div.addEventListener('mouseover', onSelectOver);
    div.addEventListener('mouseup', onSelectEnd);
    div.addEventListener('pointerdown', onPointerStart);
    div.addEventListener('pointermove', onPointerMove);
    div.addEventListener('pointerup', onPointerEnd);
    div.addEventListener('touchstart', e=>{ e.preventDefault(); onPointerStart({currentTarget:div}); }, {passive:false});
    div.addEventListener('touchmove', e=>{ e.preventDefault(); onPointerMove({currentTarget:div}); }, {passive:false});
    div.addEventListener('touchend', e=>{ e.preventDefault(); onPointerEnd({currentTarget:div}); }, {passive:false});
    grid.appendChild(div);
  }
  setSelection(7, 46);
  updateOutputs();
  document.addEventListener('mouseup', ()=> dragging=false);
  document.addEventListener('touchend', ()=> dragging=false);
  document.addEventListener('pointerup', ()=> dragging=false);

  document.addEventListener('click', (e)=>{
    const slot = e.target.closest('.slot'); if(!slot) return;
    const idx = parseInt(slot.dataset.idx,10);
    if(lastTappedIdx===null){ setSelection(idx, idx); lastTappedIdx=idx; }
    else { const a=Math.min(lastTappedIdx, idx), b=Math.max(lastTappedIdx, idx); setSelection(a,b); lastTappedIdx=null; }
  });
}

function onSelectStart(e){ const idx=parseInt(e.currentTarget.dataset.idx,10); dragging=true; anchor=idx; setSelection(idx,idx); }
function onSelectOver(e){ if(!dragging) return; const idx=parseInt(e.currentTarget.dataset.idx,10); setSelection(Math.min(anchor,idx), Math.max(anchor,idx)); }
function onSelectEnd(e){ if(!dragging) return; dragging=false; const idx=parseInt(e.currentTarget.dataset.idx,10); setSelection(Math.min(anchor,idx), Math.max(anchor,idx)); }
function onPointerStart(e){ const idx=parseInt(e.currentTarget.dataset.idx,10); dragging=true; anchor=idx; setSelection(idx,idx); }
function onPointerMove(e){ if(!dragging) return; const idx=parseInt(e.currentTarget.dataset.idx,10); setSelection(Math.min(anchor,idx), Math.max(anchor,idx)); }
function onPointerEnd(e){ dragging=false; }

function setSelection(a,b){
  gridSelection.start=a; gridSelection.end=b;
  document.querySelectorAll('.slot').forEach((el,i)=>{ if(i>=a && i<=b) el.classList.add('selected'); else el.classList.remove('selected'); });
  updateOutputs();
}

function idxToTime(idx){ const minutesFromStart = idx*15; const totalMinutes = 5*60 + minutesFromStart; const h=Math.floor(totalMinutes/60); const m=totalMinutes%60; return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`; }

function updateOutputs(){
  if(gridSelection.start==null){ fromOut.textContent='—'; toOut.textContent='—'; durOut.textContent='0'; return; }
  const from = idxToTime(gridSelection.start);
  const to = idxToTime(gridSelection.end+1);
  fromOut.textContent = from; toOut.textContent = to;
  const totalMin = ((gridSelection.end - gridSelection.start + 1) * 15);
  const pauseMin = parseInt(document.getElementById('pauseDropdown').value||'0',10);
  const d = Math.max(0, totalMin - pauseMin);
  durOut.textContent = d;
}

function selectedUserIds(){
  const boxes = Array.from(document.querySelectorAll('input[name="userChk"]'));
  const ids = boxes.filter(b=>b.checked).map(b=>b.value);
  if(!ids.length){
    // fallback: if none checked and there is a disabled own checkbox, pick it
    const own = boxes.find(b=>b.disabled);
    if(own) return [own.value];
  }
  return ids;
}
  return [ sel.value ];
}

function bookFromGrid(){
  const status = document.getElementById('dayStatus').value;
  const pid = (document.getElementById('projectSelect')||{}).value || null;
  const dateStr = document.getElementById('dateInput').value;
  const pauseMin = parseInt(document.getElementById('pauseDropdown').value||'0',10);
  const ids = selectedUserIds();
  if(!ids.length){ alert('Bitte Mitarbeiter auswählen.'); return; }

  if(status==='vacation' || status==='sick'){
    ids.forEach(userId=>{
      const base = readTimes(); if(!base[userId]) base[userId]={}; if(!base[userId][dateStr]) base[userId][dateStr]=[];
      base[userId][dateStr].push({from: null, to: null, durMin: 0, pauseMin: 0, status});
      writeTimes(base);
    });
    renderTimes(); renderMonth();
    return;
  }

  if(gridSelection.start==null){ alert('Bitte Zeitbereich wählen.'); return; }
  const photoFile = document.getElementById('photoInput').files[0];
  const fromStr = idxToTime(gridSelection.start); const toStr = idxToTime(gridSelection.end+1);
  const fromMs = toDateTimeMs(dateStr, fromStr); const toMs = toDateTimeMs(dateStr, toStr);
  const duration = Math.max(0, Math.round((toMs - fromMs)/60000) - pauseMin);
  const finalize = (photo)=>{
    ids.forEach(userId=>{
      const base = readTimes(); if(!base[userId]) base[userId]={}; if(!base[userId][dateStr]) base[userId][dateStr]=[];
      base[userId][dateStr].push({from: fromMs, to: toMs, durMin: duration, pauseMin, status, projectId: pid||null, photo: photo||null});
      writeTimes(base);
    });
    document.getElementById('photoInput').value=''; renderTimes(); renderMonth();
  };
  if(photoFile){ const r=new FileReader(); r.onload=()=>finalize(r.result); r.readAsDataURL(photoFile); } else finalize(null);
}

function toDateTimeMs(dateStr, hhmm){ const [H,M]=hhmm.split(':').map(Number); const d=new Date(dateStr+'T00:00:00'); d.setHours(H); d.setMinutes(M); d.setSeconds(0); d.setMilliseconds(0); return d.getTime(); }

function minToHHMM(min){ const sign=min<0?'-':''; const m=Math.abs(min); const h=Math.floor(m/60); const mm=m%60; return sign+String(h).padStart(2,'0')+':'+String(mm).padStart(2,'0'); }

function renderTimes(){
  const sel = document.getElementById('userSelect');
  const me = currentUser();
  const userId = (sel.multiple ? (sel.selectedOptions[0]?.value || me?.id) : (sel.value || me?.id));
  const dateStr = document.getElementById('dateInput').value;
  if(!userId || !dateStr) return;
  const base = readTimes(); const list = (base[userId] && base[userId][dateStr]) ? base[userId][dateStr] : [];
  const tbody = document.querySelector('#timeTable tbody'); const fmt=(ms)=> new Date(ms).toLocaleTimeString('de-AT',{hour:'2-digit',minute:'2-digit'});
  tbody.innerHTML = list.map(r=>{ const f = r.from? fmt(r.from) : '—'; const t = r.to? fmt(r.to) : '—'; return `<tr><td>${f}</td><td>${t}</td><td>${r.durMin}</td><td>${r.pauseMin}</td><td>${r.status}</td><td>${projectNameById(r.projectId)||'—'}</td><td>${r.photo?'<a target="_blank" href="'+r.photo+'">Foto</a>':'—'}</td></tr>`; }).join('');
  computeTotalsForDay(userId, dateStr);
}

function computeTotalsForDay(userId, dateStr){
  const base = readTimes(); const list = (base[userId] && base[userId][dateStr]) ? base[userId][dateStr] : [];
  const sum = list.reduce((acc,r)=> acc + (r.durMin||0), 0);
  const overtime = Math.max(0, sum - 9*60);
  const tEl = document.getElementById('totalsToday'); const oEl = document.getElementById('overtimeToday');
  if(tEl) tEl.textContent = minToHHMM(sum); if(oEl) oEl.textContent = minToHHMM(overtime);
}

function handleDayStatusLock(){
  const status = document.getElementById('dayStatus').value;
  const pid = (document.getElementById('projectSelect')||{}).value || null;
  const pauseSel = document.getElementById('pauseDropdown');
  const rs=document.getElementById('rangeStart'); const re=document.getElementById('rangeEnd');
  if(status==='vacation' || status==='sick'){
    pauseSel.value = '0'; pauseSel.disabled = true;
    setSelection(0, 59);
    if(rs) rs.disabled=true; if(re) re.disabled=true;
  } else {
    pauseSel.disabled = false;
    if(rs) rs.disabled=false; if(re) re.disabled=false;
    if(gridSelection.start===0 && gridSelection.end===59){
      setSelection(7,46);
    }
  }
}

window.initTimesPage = initTimesPage;

function renderMonth(){
  const sel = document.getElementById('userSelect');
  const me = currentUser();
  const userId = (sel.multiple ? (sel.selectedOptions[0]?.value || me?.id) : (sel.value || me?.id));
  const dateStr = document.getElementById('dateInput').value;
  if(!userId || !dateStr) return;

  const d = new Date(dateStr+'T00:00:00');
  const year = d.getFullYear(); const month = d.getMonth(); // 0-based
  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month+1, 0);
  const daysInMonth = monthEnd.getDate();
  const label = monthStart.toLocaleDateString('de-AT', { month:'long', year:'numeric' });
  const times = readTimes(); const userDays = times[userId] || {};

  let rows = '', sumMin = 0, sumOt = 0;
  for(let day=1; day<=daysInMonth; day++){
    const dk = new Date(year, month, day).toISOString().slice(0,10);
    const list = userDays[dk] || [];
    const dayMin = list.reduce((acc,r)=> acc + (r.durMin||0), 0);
    const status = list.length ? (list[0].status || 'Arbeit') : '—';
    const projs = Array.from(new Set(list.map(r=> projectNameById(r.projectId)).filter(Boolean))).join(', ');
    const label = projs ? `${status} – ${projs}` : status;
    const hhmm = minToHHMM(dayMin);
    rows += `<tr><td>${dk}</td><td>${label}</td><td class="number">${hhmm}</td></tr>`;
    sumMin += dayMin;
    if(dayMin > 9*60) sumOt += (dayMin - 9*60);
  }
  const tbody = document.querySelector('#monthTable tbody');
  if(tbody) tbody.innerHTML = rows;
  const monthLabel = document.getElementById('monthLabel');
  if(monthLabel) monthLabel.textContent = label.charAt(0).toUpperCase()+label.slice(1);
  const mt = document.getElementById('monthTotal'); if(mt) mt.textContent = minToHHMM(sumMin);
  const mo = document.getElementById('monthOT'); if(mo) mo.textContent = minToHHMM(sumOt);
}

function projectNameById(pid){
  if(!pid) return '';
  const ps = readProjects(); const p = ps.find(x=>x.id===pid);
  return p ? p.name : '';
}

function populateProjectSelect(){
  const sel = document.getElementById('projectSelect'); if(!sel) return;
  const ps = readProjects();
  sel.innerHTML = `<option value="">(ohne Projekt)</option>` + ps.map(p=>`<option value="${p.id}">${p.name}</option>`).join('');
}
function addNewProject(){
  const me=currentUser(); if(!me || me.role!=='admin'){ alert('Projekte dürfen nur Admins anlegen.'); return; }
  const name = (document.getElementById('newProjName')||{}).value?.trim(); const cost=(document.getElementById('newProjKst')||{}).value?.trim();
  const color = (document.getElementById('newProjColor')||{}).value || '#C8A86B';
  if(!name){ alert('Bitte Projektnamen eingeben.'); return; }
  const ps = readProjects(); const id = 'p'+Math.random().toString(36).slice(2,9);
  ps.push({id, name, color, costCenter: cost||''}); writeProjects(ps);
  if(document.getElementById('newProjName')) document.getElementById('newProjName').value=''; if(document.getElementById('newProjKst')) document.getElementById('newProjKst').value='';
  populateProjectSelect();
  const sel = document.getElementById('projectSelect'); if(sel) sel.value = id;
  alert('Projekt angelegt.');
}

function setupSliders(){
  const rs=document.getElementById('rangeStart'); const re=document.getElementById('rangeEnd');
  function clamp(){
    let s=parseInt(rs.value||'7',10), e=parseInt(re.value||'46',10);
    if(e<s) e=s;
    rs.value=String(s); re.value=String(e);
    gridSelection.start=s; gridSelection.end=e;
    const from = idxToTime(s); const to = idxToTime(e+1);
    document.getElementById('labelStart').textContent = from;
    document.getElementById('labelEnd').textContent = to;
    fromOut.textContent = from; toOut.textContent = to;
    const pauseMin = parseInt(document.getElementById('pauseDropdown').value||'0',10);
    const totalMin = (e - s + 1) * 15;
    durOut.textContent = Math.max(0, totalMin - pauseMin);
  }
  rs.min=0; rs.max=59; re.min=0; re.max=59; rs.step=1; re.step=1;
  // defaults 06:45..16:30 -> indices from 05:00 base: 1h45=7, to=16:30 => from 05:00: 11h30 -> 46
  rs.value='7'; re.value='46'; clamp();
  rs.addEventListener('input', clamp); re.addEventListener('input', clamp);
  document.getElementById('pauseDropdown').addEventListener('change', clamp);
}
