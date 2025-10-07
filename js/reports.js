
function minToHHMM(min){ const sign=min<0?'-':''; const m=Math.abs(min); const h=Math.floor(m/60); const mm=m%60; return sign+String(h).padStart(2,'0')+':'+String(mm).padStart(2,'0'); }
function eachDate(from, to){ const out=[]; const d=new Date(from.getTime()); d.setHours(0,0,0,0); const end=new Date(to.getTime()); end.setHours(0,0,0,0); while(d<=end){ out.push(d.toISOString().slice(0,10)); d.setDate(d.getDate()+1); } return out; }
async function calc(){
  const users = JSON.parse(localStorage.getItem('z_users')||'[]');
  const tbody = document.querySelector('#repTable tbody');
  const from = new Date(document.getElementById('fromDate').value);
  const to = new Date(document.getElementById('toDate').value);
  const dates = eachDate(from,to);
  const rows=[]; let totalMin=0, totalOT=0, totalDays=0;
  for(const u of users){
    let m=0, ot=0, days=0; const worked=[];
    for(const dk of dates){
      const list = await DBAPI.readTimesByUserDay(u.id, dk);
      const sumDay = list.reduce((acc,r)=> acc + (r.durMin||0), 0);
      if(list.length>0){ days+=1; worked.push(dk); }
      m += sumDay;
      if(sumDay>9*60) ot += (sumDay - 9*60);
    }
    rows.push({name: (u.name||u.username), min:m, ot, days, dates: worked});
    totalMin += m; totalOT += ot; totalDays += days;
  }
  rows.sort((a,b)=> a.name.localeCompare(b.name, 'de'));
  tbody.innerHTML = rows.map(r=>`<tr><td>${r.name}</td><td class="number">${minToHHMM(r.min)}</td><td class="number">${minToHHMM(r.ot)}</td><td class="number">${r.days}</td><td>${(r.dates||[]).join(', ')||'—'}</td></tr>`).join('');
  document.getElementById('sumAll').textContent = minToHHMM(totalMin);
  document.getElementById('sumOt').textContent = minToHHMM(totalOT);
  document.getElementById('sumDays').textContent = String(totalDays);
  const fd=document.getElementById('fromDate').value, td=document.getElementById('toDate').value;
  const meta = document.getElementById('printMeta'); meta.textContent = `Zeitraum: ${fd} bis ${td}`; meta.classList.remove('hidden');
}
document.addEventListener('DOMContentLoaded', ()=>{
  protectPage(['admin']); renderNavByRole();
  const now=new Date(); const start=new Date(now); start.setDate(start.getDate()-6);
  document.getElementById('fromDate').valueAsDate = start;
  document.getElementById('toDate').valueAsDate = now;
  document.getElementById('refreshBtn').addEventListener('click', calc);
  document.getElementById('printBtn').addEventListener('click', ()=>{ calc(); window.print(); });
  calc();
});
