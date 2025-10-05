
let runningStart = null;
function initTimesPage(){
  const me = currentUser();
  const sel = document.getElementById('userSelect');
  const users = readUsers();
  const options = (me.role==='admin' || me.role==='lead') ? users : users.filter(u=>u.id===me.id);
  sel.innerHTML = options.map(u=>`<option value="${u.id}">${u.name||u.username}</option>`).join('');
  sel.value = (me.role==='admin'||me.role==='lead') ? sel.value : me.id;
  dateInput.valueAsDate = new Date();
  startBtn.addEventListener('click', startWork);
  pauseBtn.addEventListener('click', ()=>alert('Pause über Dropdown berücksichtigen.'));
  stopBtn.addEventListener('click', stopWork);
  renderTimes();
}
function key(userId, dateStr){
  const base = readTimes(); if(!base[userId]) base[userId]={}; if(!base[userId][dateStr]) base[userId][dateStr]=[]; writeTimes(base); return base;
}
function startWork(){ if(runningStart){ alert('Bereits gestartet.'); return; } runningStart = Date.now(); renderTimes(); }
function stopWork(){
  if(!runningStart){ alert('Nicht gestartet.'); return; }
  const userId = userSelect.value; const dateStr = dateInput.value; const pauseMin = parseInt(pauseDropdown.value||'0',10); const status = dayStatus.value;
  const file = photoInput.files[0];
  const finalize = (photo)=>{ const dur = Math.max(0, Math.round((Date.now()-runningStart)/60000)-pauseMin);
    const rec = {from:runningStart, to:Date.now(), durMin:dur, pauseMin, status, photo:photo||null};
    const store = key(userId, dateStr); store[userId][dateStr].push(rec); writeTimes(store); runningStart=null; photoInput.value=''; renderTimes(); };
  if(file){ const r=new FileReader(); r.onload=()=>finalize(r.result); r.readAsDataURL(file); } else finalize(null);
}
function renderTimes(){
  const userId = userSelect.value || currentUser()?.id; const dateStr = dateInput.value; if(!userId || !dateStr) return;
  const base = readTimes(); const list = (base[userId] && base[userId][dateStr]) ? base[userId][dateStr] : [];
  const tbody = document.querySelector('#timeTable tbody'); const fmt = (ms)=> new Date(ms).toLocaleTimeString('de-AT',{hour:'2-digit', minute:'2-digit'});
  tbody.innerHTML = list.map(r=>`<tr><td>${fmt(r.from)}</td><td>${fmt(r.to)}</td><td>${r.durMin}</td><td>${r.pauseMin}</td><td>${r.status}</td><td>${r.photo?'<a target="_blank" href="'+r.photo+'">Foto</a>':'—'}</td></tr>`).join('');
}
