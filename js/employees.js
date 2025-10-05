
let editingId = null;

function initEmployeePage(){
  const me = currentUser();
  if(me?.role!=='admin' && me?.role!=='lead'){
    alert('Keine Berechtigung.');
    location.replace('dashboard.html');
    return;
  }

  const els = {
    add: document.getElementById('addEmp'),
    cancel: document.getElementById('cancelEmp'),
    save: document.getElementById('saveEmp'),
    search: document.getElementById('search'),
    modal: document.getElementById('empModal'),
    name: document.getElementById('empName'),
    user: document.getElementById('empUser'),
    role: document.getElementById('empRole'),
    pw: document.getElementById('empPw'),
    photo: document.getElementById('empPhoto'),
    title: document.getElementById('modalTitle'),
    tableBody: document.querySelector('#empTable tbody')
  };

  els.add.addEventListener('click', ()=>openModal(els));
  els.cancel.addEventListener('click', (e)=>{ e.preventDefault(); closeModal(els); });
  els.save.addEventListener('click', ()=>saveEmp(els));
  els.search.addEventListener('input', ()=>renderTable(els));

  // Modal close on overlay and ESC
  els.modal.addEventListener('click', (e)=>{ if(e.target === els.modal) closeModal(els); });
  document.addEventListener('keydown', (e)=>{ if(e.key === 'Escape' && !els.modal.classList.contains('hidden')) closeModal(els); });

  renderTable(els);
}

function openModal(els, emp=null){
  editingId = emp?.id || null;
  els.title.textContent = editingId ? 'Mitarbeiter bearbeiten' : 'Mitarbeiter anlegen';
  els.name.value = emp?.name || '';
  els.user.value = emp?.username || '';
  els.role.value = emp?.role || 'employee';
  els.pw.value = '';
  els.photo.value = '';
  els.modal.classList.remove('hidden');
}

function closeModal(els){
  els.modal.classList.add('hidden');
}

function saveEmp(els){
  const name = els.name.value.trim();
  const username = els.user.value.trim();
  const role = els.role.value;
  const pw = els.pw.value;
  const file = els.photo.files[0];

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
    writeUsers(users);
    closeModal(els);
    renderTable(els);
  };

  if(file){
    const reader = new FileReader();
    reader.onload = ()=> upsert(reader.result);
    reader.readAsDataURL(file);
  } else {
    upsert(null);
  }
}

function removeEmp(id){
  if(!confirm('Mitarbeiter wirklich löschen?')) return;
  const users = readUsers().filter(u=>u.id!==id);
  writeUsers(users);
  // Re-render using fresh DOM lookups
  initEmployeePage();
}

function renderTable(els){
  const term = (els.search.value||'').toLowerCase();
  const users = readUsers().filter(u=> (u.name||'').toLowerCase().includes(term) || (u.username||'').toLowerCase().includes(term));
  els.tableBody.innerHTML = users.map(u=>`
    <tr>
      <td>${u.photo ? `<img class="avatar" src="${u.photo}">` : '—'}</td>
      <td>${u.name||''}</td>
      <td>${u.username||''}</td>
      <td>${u.role}</td>
      <td>${u.mustChangePassword ? 'Erstlogin' : 'Aktiv'}</td>
      <td>
        <button class="btn" data-edit="${u.id}">Bearbeiten</button>
        <button class="btn-ghost" data-del="${u.id}">Löschen</button>
      </td>
    </tr>
  `).join('');

  els.tableBody.querySelectorAll('button[data-edit]').forEach(b=>{
    b.addEventListener('click', ()=>{
      const emp = readUsers().find(x=>x.id===b.getAttribute('data-edit'));
      const newEls = {
        add: document.getElementById('addEmp'),
        cancel: document.getElementById('cancelEmp'),
        save: document.getElementById('saveEmp'),
        search: document.getElementById('search'),
        modal: document.getElementById('empModal'),
        name: document.getElementById('empName'),
        user: document.getElementById('empUser'),
        role: document.getElementById('empRole'),
        pw: document.getElementById('empPw'),
        photo: document.getElementById('empPhoto'),
        title: document.getElementById('modalTitle'),
        tableBody: document.querySelector('#empTable tbody')
      };
      openModal(newEls, emp);
    });
  });
  els.tableBody.querySelectorAll('button[data-del]').forEach(b=>{
    b.addEventListener('click', ()=> removeEmp(b.getAttribute('data-del')) );
  });
}
