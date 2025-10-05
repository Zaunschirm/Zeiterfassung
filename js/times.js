
let runningStart = null;
function initTimesPage(){
  const me = currentUser();
  const sel = document.getElementById('userSelect');
  const users = readUsers();
  let options = [];
  if(me.role==='admin' || me.role==='lead'){ options = users; } else { options = users.filter(u=>u.id===me.id); }
  sel.innerHTML = options.map(u=>`<option value="${u.id}">${u.name||u.username}</option>`).join('');
  sel.value = (me.role==='admin'||me.role==='lead') ? sel.value : me.id;
  document.getElementById('dateInput').valueAsDate = new Date();
  document.getElementById('startBtn').addEventListener('click', startWork);
  document.getElementById('pauseBtn').addEventListener('click', bookPause);
  document.getElementById('stopBtn').addEventListener('click', stopWork);
  renderTimes();
}
function key(userId, dateStr){
  const base = readTimes();
  if(!base[userId]) base[userId] = {};
  if(!base[userId][dateStr]) base[userId][dateStr] = [];
  writeTimes(base);
  return base;
}
function startWork(){ if(runningStart){ alert('Bereits gestartet.'); return; } runningStart = Date.now(); renderTimes(); }
function stopWork(){
  if(!runningStart){ alert('Nicht gestartet.'); return; }
  const userId = document.getElementById('userSelect').value;
  const dateStr = document.getElementById('dateInput').value;
  const pauseMin = parseInt(document.getElementById('pauseDropdown').value||'0',10);
  const status = document.getElementById('dayStatus').value;
  const photoFile = document.getElementById('photoInput').files[0];
  const finalize = (photoData)=>{
    const duration = Math.max(0, Math.round((Date.now() - runningStart)/60000) - pauseMin);
    const rec = {from: runningStart, to: Date.now(), durMin: duration, pauseMin, status, photo: photoData||null};
    const store = key(userId, dateStr);
    store[userId][dateStr].push(rec);
    writeTimes(store);
    runningStart = null;
    document.getElementById('photoInput').value = '';
    renderTimes();
  };
  if(photoFile){ const reader = new FileReader(); reader.onload = ()=> finalize(reader.result); reader.readAsDataURL(photoFile); } else { finalize(null); }
}
function bookPause(){ alert('Pause wird über das Dropdown neben der Arbeitszeit berücksichtigt.'); }
function renderTimes(){
  const userId = document.getElementById('userSelect').value || currentUser()?.id;
  const dateStr = document.getElementById('dateInput').value;
  if(!userId || !dateStr) return;
  const base = readTimes();
  const list = (base[userId] && base[userId][dateStr]) ? base[userId][dateStr] : [];
  const tbody = document.querySelector('#timeTable tbody');
  const fmt = (ms)=> new Date(ms).toLocaleTimeString('de-AT', {hour:'2-digit', minute:'2-digit'});
  tbody.innerHTML = list.map(r=>`
    <tr>
      <td>${fmt(r.from)}</td><td>${fmt(r.to)}</td><td>${r.durMin}</td><td>${r.pauseMin}</td>
      <td>${r.status}</td><td>${r.photo ? '<a target="_blank" href="'+r.photo+'">Foto</a>' : '—'}</td>
    </tr>`).join('');
}
