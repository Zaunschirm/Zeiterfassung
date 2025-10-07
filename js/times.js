
let gridSelection = {start:null, end:null};
function idxToTime(idx){ const minutesFromStart = idx*15; const totalMinutes = 5*60 + minutesFromStart; const h=Math.floor(totalMinutes/60); const m=totalMinutes%60; return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`; }
function toDateTimeMs(dateStr, hhmm){ const [H,M]=hhmm.split(':').map(Number); const d=new Date(dateStr+'T00:00:00'); d.setHours(H); d.setMinutes(M); d.setSeconds(0); d.setMilliseconds(0); return d.getTime(); }
function minToHHMM(min){ const sign=min<0?'-':''; const m=Math.abs(min); const h=Math.floor(m/60); const mm=m%60; return sign+String(h).padStart(2,'0')+':'+String(mm).padStart(2,'0'); }
async function initTimesPage(){
  const me = currentUser();
  const cl = document.getElementById('userChecklist');
  const users = await DBAPI.readUsers();
  const isLeadOrAdmin = (me.role==='admin' || me.role==='lead');
  let list = isLeadOrAdmin ? users : users.filter(u=>u.id===me.id);
  cl.innerHTML = list.map(u=>`<label style="display:flex; align-items:center; gap:8px; padding:4px 0"><input type="checkbox" name="userChk" value="${u.id}" ${!isLeadOrAdmin?'checked disabled':''}> <span>${u.name||u.username}</span></label>`).join('');
  document.getElementById('multiHint').style.display = isLeadOrAdmin ? 'block' : 'none';
  document.getElementById('dateInput').valueAsDate = new Date();
  document.getElementById('pauseDropdown').value = '30';
  setupSliders();
  document.getElementById('bookBtn').addEventListener('click', bookFromGrid);
  document.getElementById('dayStatus').addEventListener('change', handleDayStatusLock);
  document.getElementById('dateInput').addEventListener('change', ()=>{ renderTimes(); renderMonth(); });
  handleDayStatusLock();
  await populateProjectSelect();
  renderTimes(); renderMonth();
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
    const net = Math.max(0, totalMin - pauseMin);
    durOut.textContent = minToHHMM(net);
  }
  rs.min=0; rs.max=59; re.min=0; re.max=59; rs.step=1; re.step=1;
  rs.value='7'; re.value='46'; clamp();
  rs.addEventListener('input', clamp); re.addEventListener('input', clamp);
  document.getElementById('pauseDropdown').addEventListener('change', clamp);
}
function selectedUserIds(){
  const boxes = Array.from(document.querySelectorAll('input[name="userChk"]'));
  const ids = boxes.filter(b=>b.checked).map(b=>b.value);
  if(!ids.length){
    const own = boxes.find(b=>b.disabled);
    if(own) return [own.value];
  }
  return ids;
}
async function bookFromGrid(){
  const status = document.getElementById('dayStatus').value;
  const dateStr = document.getElementById('dateInput').value;
  const pauseMin = parseInt(document.getElementById('pauseDropdown').value||'0',10);
  const ids = selectedUserIds();
  if(!ids.length){ alert('Bitte Mitarbeiter auswählen.'); return; }
  const pid = (document.getElementById('projectSelect')||{}).value || null;
  if(status==='vacation' || status==='sick'){
    for(const userId of ids){
      const list = await DBAPI.readTimesByUserDay(userId, dateStr);
      list.push({from:null,to:null,durMin:0,pauseMin:0,status,projectId:null});
      await DBAPI.writeTimesByUserDay(userId, dateStr, list);
    }
    renderTimes(); renderMonth();
    return;
  }
  if(gridSelection.start==null){ alert('Bitte Zeitbereich wählen.'); return; }
  const fromStr = idxToTime(gridSelection.start); const toStr = idxToTime(gridSelection.end+1);
  const fromMs = toDateTimeMs(dateStr, fromStr); const toMs = toDateTimeMs(dateStr, toStr);
  const totalMin = Math.max(0, Math.round((toMs - fromMs)/60000));
  const duration = Math.max(0, totalMin - pauseMin);
  for(const userId of ids){
    const list = await DBAPI.readTimesByUserDay(userId, dateStr);
    list.push({from: fromMs, to: toMs, durMin: duration, pauseMin, status, projectId: pid||null});
    await DBAPI.writeTimesByUserDay(userId, dateStr, list);
  }
  renderTimes(); renderMonth();
}
async function renderTimes(){ /* Platzhalter für Tagesliste – Monatsliste reicht laut Anforderungen */ }
async function renderMonth(){
  const me = currentUser();
  const userId = selectedUserIds()[0] || me?.id;
  const dateStr = document.getElementById('dateInput').value;
  if(!userId || !dateStr) return;
  const d = new Date(dateStr+'T00:00:00');
  const year = d.getFullYear(); const month = d.getMonth();
  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month+1, 0);
  const daysInMonth = monthEnd.getDate();
  const label = monthStart.toLocaleDateString('de-AT', { month:'long', year:'numeric' });
  const userDays = await DBAPI.readTimesByUser(userId);
  let rows = '', sumMin = 0, sumOt = 0;
  const psAll = await DBAPI.readProjects();
  for(let day=1; day<=daysInMonth; day++){
    const dk = new Date(year, month, day).toISOString().slice(0,10);
    const list = userDays[dk] || [];
    if(!list.length) continue;
    const dayMin = list.reduce((acc,r)=> acc + (r.durMin||0), 0);
    const status = list.length ? (list[0].status || 'Arbeit') : '—';
    const names = Array.from(new Set(list.map(r=> r.projectId).filter(Boolean))).map(pid=> (psAll.find(p=>p.id===pid)?.name)||'').filter(Boolean).join(', ');
    const label2 = names ? `${status} – ${names}` : status;
    rows += `<tr><td>${dk}</td><td>${label2}</td><td class="number">${minToHHMM(dayMin)}</td></tr>`;
    sumMin += dayMin;
    if(dayMin > 9*60) sumOt += (dayMin - 9*60);
  }
  const tbody = document.querySelector('#monthTable tbody');
  if(tbody) tbody.innerHTML = rows || '<tr><td colspan="3" style="color:#6b7280">Keine Einträge im Monat.</td></tr>';
  const monthLabel = document.getElementById('monthLabel'); if(monthLabel){ const s = label; monthLabel.textContent = s.charAt(0).toUpperCase()+s.slice(1); }
  const mt = document.getElementById('monthTotal'); if(mt) mt.textContent = minToHHMM(sumMin);
  const mo = document.getElementById('monthOT'); if(mo) mo.textContent = minToHHMM(sumOt);
}
async function populateProjectSelect(){
  const sel = document.getElementById('projectSelect'); if(!sel) return;
  const ps = await DBAPI.readProjects();
  sel.innerHTML = `<option value="">(ohne Projekt)</option>` + ps.map(p=>`<option value="${p.id}">${p.name}${p.costCenter? ' • KSt '+p.costCenter:''}</option>`).join('');
}
function handleDayStatusLock(){
  const status = document.getElementById('dayStatus').value;
  const rs=document.getElementById('rangeStart'); const re=document.getElementById('rangeEnd');
  if(status==='vacation' || status==='sick'){
    document.getElementById('pauseDropdown').value = '0';
    if(rs) rs.disabled=true; if(re) re.disabled=true;
  } else {
    if(rs) rs.disabled=false; if(re) re.disabled=false;
  }
}
window.addEventListener('data-sync', (e)=>{ const evt=e.detail?.evt; if(evt==='times'||evt==='projects'){ renderMonth(); populateProjectSelect(); } });
