
function initPlanningPage(){
  const today = new Date();
  weekPicker.value = isoWeekString(today);
  renderWeek();
  prevWeek.addEventListener('click', ()=> shiftWeek(-1));
  nextWeek.addEventListener('click', ()=> shiftWeek(1));
  weekPicker.addEventListener('change', renderWeek);
  copyPrev.addEventListener('click', copyPreviousWeek);
  exportCsv.addEventListener('click', exportPlanningCsv);
}
function shiftWeek(delta){
  const d = weekInputToDate(weekPicker.value);
  d.setDate(d.getDate() + delta*7);
  weekPicker.value = isoWeekString(d);
  renderWeek();
}
function isoWeekString(d){
  const dt = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = (dt.getUTCDay() + 6) % 7;
  dt.setUTCDate(dt.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(dt.getUTCFullYear(),0,4));
  const weekNo = 1 + Math.round(((dt - firstThursday)/86400000 - 3 + ((firstThursday.getUTCDay() + 6)%7))/7);
  const year = dt.getUTCFullYear();
  return year + '-W' + String(weekNo).padStart(2,'0');
}
function weekInputToDate(weekStr){
  const [y,w] = weekStr.split('-W').map(Number);
  const simple = new Date(Date.UTC(y,0,1 + (w-1)*7));
  const dow = simple.getUTCDay();
  const ISOweekStart = new Date(simple);
  if (dow <= 4) ISOweekStart.setUTCDate(simple.getUTCDate() - dow + 1);
  else ISOweekStart.setUTCDate(simple.getUTCDate() + 8 - dow);
  return new Date(ISOweekStart);
}
function daysOfWeek(weekStr){
  const start = weekInputToDate(weekStr);
  return Array.from({length:7}, (_,i)=> {
    const d = new Date(start); d.setDate(start.getDate()+i); return d;
  });
}
function renderWeek(){
  const weekStr = weekPicker.value;
  const days = daysOfWeek(weekStr);
  planHead.innerHTML = `<tr>
    <th style="width:200px">Mitarbeiter</th>
    ${days.map(d=>`<th>${d.toLocaleDateString('de-AT',{weekday:'short', day:'2-digit', month:'2-digit'})}</th>`).join('')}
  </tr>`;
  const users = readUsers();
  planBody.innerHTML = users.map(u=> rowForUser(u, days, weekStr)).join('');
  planBody.querySelectorAll('td[data-uid]').forEach(td=>{
    td.addEventListener('click', ()=> makeEditable(td));
    td.addEventListener('dblclick', ()=> applyPreset(td));
  });
}
function rowForUser(u, days, weekStr){
  const data = readPlan();
  const week = data[weekStr] || {};
  const cells = days.map(d=>{
    const key = dateKey(d);
    const v = ((week[key]||{})[u.id]) || '';
    return `<td data-uid="${u.id}" data-date="${key}" title="Klick: bearbeiten • Doppelklick: Schnellvorgabe">${escapeHtml(v)}</td>`;
  }).join('');
  return `<tr><th>${escapeHtml(u.name||u.username)}</th>${cells}</tr>`;
}
function dateKey(d){ return d.toISOString().slice(0,10); }
function saveCell(uid, date, value){
  const data = readPlan();
  if(!data[weekPicker.value]) data[weekPicker.value] = {};
  if(!data[weekPicker.value][date]) data[weekPicker.value][date] = {};
  data[weekPicker.value][date][uid] = value;
  writePlan(data);
}
function makeEditable(td){
  if(td.querySelector('textarea')) return;
  const orig = td.textContent.trim();
  td.innerHTML = `<textarea rows="2">${orig}</textarea>`;
  const ta = td.querySelector('textarea');
  ta.focus();
  ta.addEventListener('blur', ()=>{
    const val = ta.value.trim();
    td.textContent = val;
    saveCell(td.dataset.uid, td.dataset.date, val);
  });
}
function applyPreset(td){
  const preset = document.getElementById('preset').value;
  if(!preset) return;
  td.textContent = preset;
  saveCell(td.dataset.uid, td.dataset.date, preset);
}
function copyPreviousWeek(){
  const cur = weekPicker.value;
  const prevDate = weekInputToDate(cur); prevDate.setDate(prevDate.getDate()-7);
  const prev = isoWeekString(prevDate);
  const all = readPlan();
  if(!all[prev]){ alert('Keine Vorwoche vorhanden.'); return; }
  all[cur] = JSON.parse(JSON.stringify(all[prev]));
  writePlan(all); renderWeek();
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
      const val = ((data[dateKey(d)]||{})[u.id]) || '';
      row.push((val||'').replace(/\n/g,' ').replace(/;/g,','));
    });
    rows.push(row);
  });
  const csv = rows.map(r=>r.join(';')).join('\n');
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'Wocheneinteilung_'+weekStr+'.csv'; a.click();
  URL.revokeObjectURL(url);
}
function escapeHtml(s){ return (s||'').replace(/[&<>"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }
