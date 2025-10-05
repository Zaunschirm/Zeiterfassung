
// V69 mobile + totals
let dragging = false;
let anchor = null;

function onSelectStart(e){
  const idx = parseInt(e.currentTarget.dataset.idx,10);
  dragging = true; anchor = idx;
  setSelection(idx, idx);
}
function onSelectOver(e){
  if(!dragging) return;
  const idx = parseInt(e.currentTarget.dataset.idx,10);
  setSelection(Math.min(anchor, idx), Math.max(anchor, idx));
}
function onSelectEnd(e){
  if(!dragging) return;
  dragging = false;
  const idx = parseInt(e.currentTarget.dataset.idx,10);
  setSelection(Math.min(anchor, idx), Math.max(anchor, idx));
}

function setSelection(a,b){
  gridSelection.start = a; gridSelection.end = b;
  document.querySelectorAll('.slot').forEach((el,i)=>{
    if(i>=a && i<=b) el.classList.add('selected'); else el.classList.remove('selected');
  });
  updateOutputs();
}

function idxToTime(idx){
  const minutesFromStart = idx*15; // 0..885
  const totalMinutes = 5*60 + minutesFromStart; // base 05:00
  const h = Math.floor(totalMinutes/60);
  const m = totalMinutes%60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
}

function updateOutputs(){
  if(gridSelection.start==null){ fromOut.textContent='—'; toOut.textContent='—'; durOut.textContent='0'; return; }
  const from = idxToTime(gridSelection.start);
  const to = idxToTime(gridSelection.end+1); // end inclusive slot; +1 boundary
  fromOut.textContent = from; toOut.textContent = to;
  const totalMin = ((gridSelection.end - gridSelection.start + 1) * 15);
  const pauseMin = parseInt(document.getElementById('pauseDropdown').value||'0',10);
  const d = Math.max(0, totalMin - pauseMin);
  durOut.textContent = d;
}

function bookFromGrid(){
  if(gridSelection.start==null){ alert('Bitte Zeitbereich wählen.'); return; }
  const userId = document.getElementById('userSelect').value;
  const dateStr = document.getElementById('dateInput').value;
  const pauseMin = parseInt(document.getElementById('pauseDropdown').value||'0',10);
  const status = document.getElementById('dayStatus').value;
  const photoFile = document.getElementById('photoInput').files[0];

  const fromStr = idxToTime(gridSelection.start);
  const toStr = idxToTime(gridSelection.end+1);

  const fromMs = toDateTimeMs(dateStr, fromStr);
  const toMs = toDateTimeMs(dateStr, toStr);
  const duration = Math.max(0, Math.round((toMs - fromMs)/60000) - pauseMin);

  const finalize = (photoData)=>{
    const rec = {from: fromMs, to: toMs, durMin: duration, pauseMin, status, photo: photoData||null};
    const base = readTimes();
    if(!base[userId]) base[userId] = {};
    if(!base[userId][dateStr]) base[userId][dateStr] = [];
    base[userId][dateStr].push(rec);
    writeTimes(base);
    document.getElementById('photoInput').value='';
    renderTimes();
  };
  if(photoFile){
    const reader = new FileReader(); reader.onload = ()=> finalize(reader.result); reader.readAsDataURL(photoFile);
  } else { finalize(null); }
}

function toDateTimeMs(dateStr, hhmm){
  const [H,M] = hhmm.split(':').map(Number);
  const d = new Date(dateStr+'T00:00:00');
  d.setHours(H); d.setMinutes(M); d.setSeconds(0); d.setMilliseconds(0);
  return d.getTime();
}

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
      <td>${fmt(r.from)}</td>
      <td>${fmt(r.to)}</td>
      <td>${r.durMin}</td>
      <td>${r.pauseMin}</td>
      <td>${r.status}</td>
      <td>${r.photo ? '<a target="_blank" href="'+r.photo+'">Foto</a>' : '—'}</td>
    </tr>
  `).join('');
  computeTotalsForDay(userId, dateStr);
}

function computeTotalsForDay(userId, dateStr){
  const base = readTimes();
  const list = (base[userId] && base[userId][dateStr]) ? base[userId][dateStr] : [];
  const sum = list.reduce((acc, r)=> acc + (r.durMin||0), 0);
  const overtime = Math.max(0, sum - 9*60);
  const tEl = document.getElementById('totalsToday');
  const oEl = document.getElementById('overtimeToday');
  if(tEl) tEl.textContent = minToHHMM(sum);
  if(oEl) oEl.textContent = minToHHMM(overtime);
}
