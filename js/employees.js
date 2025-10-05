
let editingId = null;
function initEmployeePage(){
  const me = currentUser();
  if(me?.role!=='admin' && me?.role!=='lead'){
    alert('Keine Berechtigung.'); window.location.replace('dashboard.html'); return;
  }
  document.getElementById('addEmp').addEventListener('click', ()=>openModal());
  document.getElementById('cancelEmp').addEventListener('click', closeModal);
  document.getElementById('saveEmp').addEventListener('click', saveEmp);
  document.getElementById('search').addEventListener('input', renderTable);
  renderTable();
}
function openModal(emp=null){
  editingId = emp?.id || null;
  modalTitle.textContent = editingId ? 'Mitarbeiter bearbeiten' : 'Mitarbeiter anlegen';
  empName.value = emp?.name || '';
  empUser.value = emp?.username || '';
  empRole.value = emp?.role || 'employee';
  empPw.value = '';
  empPhoto.value = '';
  empModal.classList.remove('hidden');
}
function closeModal(){ empModal.classList.add('hidden'); }
function saveEmp(){
  const name = empName.value.trim();
  const username = empUser.value.trim();
  const role = empRole.value;
  const pw = empPw.value;
  const file = empPhoto.files[0];
  if(!name || !username){ alert('Name und Nutzername sind erforderlich.'); return; }
  const users = readUsers();
  let user = users.find(u=>u.id===editingId);
  const upsert = (photoData)=>{
    if(user){
      user.name = name; user.username = username; user.role = role;
      if(pw) user.password = pw;
      if(photoData) user.photo = photoData;
    }else{
      const id = 'u' + Math.random().toString(36).slice(2,9);
      user = {id, name, username, role, password: pw || '1234', mustChangePassword: true};
      if(photoData) user.photo = photoData;
      users.push(user);
    }
    writeUsers(users); closeModal(); renderTable();
  };
  if(file){ const r=new FileReader(); r.onload=()=>upsert(r.result); r.readAsDataURL(file); } else { upsert(null); }
}
function removeEmp(id){
  if(!confirm('Mitarbeiter wirklich löschen?')) return;
  const users = readUsers().filter(u=>u.id!==id);
  writeUsers(users); renderTable();
}
function renderTable(){
  const tbody = document.querySelector('#empTable tbody');
  const term = (document.getElementById('search').value||'').toLowerCase();
  const users = readUsers().filter(u=> (u.name||'').toLowerCase().includes(term) || (u.username||'').toLowerCase().includes(term));
  tbody.innerHTML = users.map(u=>`
    <tr>
      <td>${u.photo ? `<img class="avatar" src="${u.photo}">` : '—'}</td>
      <td>${u.name||''}</td>
      <td>${u.username||''}</td>
      <td>${u.role}</td>
      <td>${u.mustChangePassword ? 'Erstlogin' : 'Aktiv'}</td>
      <td>
        <button class="btn" onclick='(${openModal.toString()})'"+JSON.stringify(u)+"''>Bearbeiten</button>
        <button class="btn-outline" onclick="removeEmp('${u.id}')">Löschen</button>
      </td>
    </tr>
  `).join('');
}
