
let gridSelection = {start:null, end:null};

function initTimesPage(){
  const me = currentUser();
  const cl = document.getElementById('userChecklist');
  const users = readUsers();
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

  populateProjectSelect();
  document.getElementById('addProjBtn').addEventListener('click', addNewProject);

  renderTimes(); renderMonth();
}

function setupSliders(){
  const rs=document.getElementById('rangeStart'); const re=document.getElementById('rangeEnd');
  function idxToTime(idx){ const minutesFromStart = idx*15; const totalMinutes = 5*60 + minutesFromStart; const h=Math.floor(totalMinutes/60); const m=totalMinutes%60; return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`; }
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

function toDateTimeMs(dateStr, hhmm){ const [H,M]=hhmm.split(':').map(Number); const d=new Date(dateStr+'T00:00:00'); d.setHours(H); d.setMinutes(M); d.setSeconds(0); d.setMilliseconds(0); return d.getTime(); }
function minToHHMM(min){ const sign=min<0?'-':''; const m=Math.abs(min); const h=Math.floor(m/60); const mm=m%60; return sign+String(h).padStart(2,'0')+':'+String(mm).padStart(2,'0'); }
function projectNameById(pid){ if(!pid) return ''; const ps=readProjects(); const p=ps.find(x=>x.id===pid); return p? p.name : ''; }

function bookFromGrid(){
  const status = document.getElementById('dayStatus').value;
  const dateStr = document.getElementById('dateInput').value;
  const pauseMin = parseInt(document.getElementById('pauseDropdown').value||'0',10);
  const ids = selectedUserIds();
  if(!ids.length){ alert('Bitte Mitarbeiter auswählen.'); return; }

  const pid = (document.getElementById('projectSelect')||{}).value || null;

  if(status==='vacation' || status==='sick'){
    ids.forEach(userId=>{
      const base = readTimes(); if(!base[userId]) base[userId]={}; if(!base[userId][dateStr]) base[userId][dateStr]=[];
      base[userId][dateStr].push({from: null, to: null, durMin: 0, pauseMin: 0, status, projectId: null});
      writeTimes(base);
    });
    renderTimes(); renderMonth();
    return;
  }

  if(gridSelection.start==null){ alert('Bitte Zeitbereich wählen.'); return; }
  const fromStr = idxToTime(gridSelection.start); const toStr = idxToTime(gridSelection.end+1);
  const fromMs = toDateTimeMs(dateStr, fromStr); const toMs = toDateTimeMs(dateStr, toStr);
  const totalMin = Math.max(0, Math.round((toMs - fromMs)/60000));
  const duration = Math.max(0, totalMin - pauseMin);

  ids.forEach(userId=>{
    const base = readTimes(); if(!base[userId]) base[userId]={}; if(!base[userId][dateStr]) base[userId][dateStr]=[];
    base[userId][dateStr].push({from: fromMs, to: toMs, durMin: duration, pauseMin, status, projectId: pid||null});
    writeTimes(base);
  });
  renderTimes(); renderMonth();
  function idxToTime(idx){ const minutesFromStart = idx*15; const totalMinutes = 5*60 + minutesFromStart; const h=Math.floor(totalMinutes/60); const m=minutesFromStart%60; return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`; }
}

function renderTimes(){}

function renderMonth(){
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
  const times = readTimes(); const userDays = times[userId] || {};

  let rows = '', sumMin = 0, sumOt = 0;
  for(let day=1; day<=daysInMonth; day++){
    const dk = new Date(year, month, day).toISOString().slice(0,10);
    const list = userDays[dk] || [];
    if(!list.length) continue;
    const dayMin = list.reduce((acc,r)=> acc + (r.durMin||0), 0);
    const status = list.length ? (list[0].status || 'Arbeit') : '—';
    const projs = Array.from(new Set(list.map(r=> (projectNameById(r.projectId)||'').trim()).filter(Boolean))).join(', ');
    const label2 = projs ? `${status} – ${projs}` : status;
    const hhmm = minToHHMM(dayMin);
    rows += `<tr><td>${dk}</td><td>${label2}</td><td class="number">${hhmm}</td></tr>`;
    sumMin += dayMin;
    if(dayMin > 9*60) sumOt += (dayMin - 9*60);
  }
  const tbody = document.querySelector('#monthTable tbody');
  if(tbody) tbody.innerHTML = rows || '<tr><td colspan="3" style="color:#6b7280">Keine Einträge im Monat.</td></tr>';
  const monthLabel = document.getElementById('monthLabel'); if(monthLabel){ const s = label; monthLabel.textContent = s.charAt(0).toUpperCase()+s.slice(1); }
  const mt = document.getElementById('monthTotal'); if(mt) mt.textContent = minToHHMM(sumMin);
  const mo = document.getElementById('monthOT'); if(mo) mo.textContent = minToHHMM(sumOt);
}

function populateProjectSelect(){
  const sel = document.getElementById('projectSelect'); if(!sel) return;
  const ps = readProjects();
  sel.innerHTML = `<option value="">(ohne Projekt)</option>` + ps.map(p=>`<option value="${p.id}">${p.name}${p.costCenter? ' • KSt '+p.costCenter:''}</option>`).join('');
}
function addNewProject(){
  const me=currentUser(); if(!me || me.role!=='admin'){ alert('Projekte dürfen nur Admins anlegen.'); return; }
  const name = (document.getElementById('newProjName')||{}).value?.trim();
  const color = (document.getElementById('newProjColor')||{}).value || '#C8A86B';
  const cost=(document.getElementById('newProjKst')||{}).value?.trim();
  if(!name){ alert('Bitte Projektnamen eingeben.'); return; }
  const ps = readProjects(); const id = 'p'+Math.random().toString(36).slice(2,9);
  ps.push({id, name, color, costCenter: cost||''}); writeProjects(ps);
  const np=document.getElementById('newProjName'); const nk=document.getElementById('newProjKst');
  if(np) np.value=''; if(nk) nk.value='';
  populateProjectSelect();
  const sel = document.getElementById('projectSelect'); if(sel) sel.value = id;
  alert('Projekt angelegt.');
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
