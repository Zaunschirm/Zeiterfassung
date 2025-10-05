
// Robust employees management with reliable modal close (Abbrechen)
(() => {
  let editingId = null;

  function qs(id){ return document.getElementById(id); }

  function getEls(){
    return {
      add: qs('addEmp'),
      cancel: qs('cancelEmp'),
      save: qs('saveEmp'),
      search: qs('search'),
      modal: qs('empModal'),
      name: qs('empName'),
      user: qs('empUser'),
      role: qs('empRole'),
      pw: qs('empPw'),
      photo: qs('empPhoto'),
      title: qs('modalTitle'),
      tableBody: document.querySelector('#empTable tbody')
    };
  }

  function openModal(emp=null){
    const E = getEls();
    editingId = emp?.id || null;
    E.title.textContent = editingId ? 'Mitarbeiter bearbeiten' : 'Mitarbeiter anlegen';
    E.name.value = emp?.name || '';
    E.user.value = emp?.username || '';
    E.role.value = emp?.role || 'employee';
    E.pw.value = '';
    E.photo.value = '';
    E.modal.classList.remove('hidden');
    // trap focus optional
  }

  function closeModal(){
    const E = getEls();
    E.modal.classList.add('hidden');
  }

  function saveEmp(){
    const E = getEls();
    const name = E.name.value.trim();
    const username = E.user.value.trim();
    const role = E.role.value;
    const pw = E.pw.value;
    const file = E.photo.files[0];
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
      closeModal(); renderTable();
    };
    if(file){ const r=new FileReader(); r.onload=()=>upsert(r.result); r.readAsDataURL(file); } else upsert(null);
  }

  function removeEmp(id){
    if(!confirm('Mitarbeiter wirklich löschen?')) return;
    const users = readUsers().filter(u=>u.id!==id);
    writeUsers(users); renderTable();
  }

  function renderTable(){
    const E = getEls();
    const term = (E.search.value||'').toLowerCase();
    const users = readUsers().filter(u=> (u.name||'').toLowerCase().includes(term) || (u.username||'').toLowerCase().includes(term));
    E.tableBody.innerHTML = users.map(u=>`
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

    // bind row buttons
    E.tableBody.querySelectorAll('button[data-edit]').forEach(b=>{
      b.addEventListener('click', ()=>{
        const emp = readUsers().find(x=>x.id===b.getAttribute('data-edit'));
        openModal(emp);
      });
    });
    E.tableBody.querySelectorAll('button[data-del]').forEach(b=>{
      b.addEventListener('click', ()=> removeEmp(b.getAttribute('data-del')) );
    });
  }

  function initEmployeePage(){
    const me = currentUser();
    if(me?.role!=='admin' && me?.role!=='lead'){
      alert('Keine Berechtigung.');
      location.replace('dashboard.html'); return;
    }
    const E = getEls();
    // ensure cancel is type="button" to avoid submits
    if(E.cancel) E.cancel.setAttribute('type','button');

    E.add?.addEventListener('click', ()=>openModal());
    E.cancel?.addEventListener('click', (e)=>{ e.preventDefault(); closeModal(); });
    E.save?.addEventListener('click', saveEmp);
    E.search?.addEventListener('input', renderTable);

    // close on overlay click
    E.modal?.addEventListener('click', (ev)=>{ if(ev.target===E.modal) closeModal(); });
    // close on ESC
    document.addEventListener('keydown', (ev)=>{ if(ev.key==='Escape' && !E.modal.classList.contains('hidden')) closeModal(); });

    renderTable();
  }

  // expose init
  window.initEmployeePage = initEmployeePage;
})();
