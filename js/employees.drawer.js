
// Drawer controller
(function(){
  function $id(id){return document.getElementById(id);}
  const UI = {
    backdrop: $id('empDrawerBackdrop'),
    drawer: $id('empDrawer'),
    title: $id('drawerTitle'),
    closeBtn: $id('drawerClose'),
    cancelBtn: $id('drawerCancel'),
    addBtn: $id('addEmp'),
    saveBtn: $id('saveEmp'),
    name: $id('empName'),
    user: $id('empUser'),
    role: $id('empRole'),
    pw: $id('empPw'),
    photo: $id('empPhoto'),
    tbody: document.querySelector('#empTable tbody')
  };
  function drawerOpen(emp){
    UI.title.textContent = emp ? 'Mitarbeiter bearbeiten' : 'Mitarbeiter anlegen';
    UI.name.value = emp?.name || ''; UI.user.value = emp?.username || ''; UI.role.value = emp?.role || 'employee'; UI.pw.value='';
    if(UI.photo) UI.photo.value='';
    UI.backdrop.classList.remove('hidden'); UI.backdrop.classList.add('open'); UI.drawer.classList.add('open');
    setTimeout(()=> UI.name?.focus(), 30);
  }
  function drawerClose(){
    UI.drawer.classList.remove('open'); UI.backdrop.classList.remove('open');
    setTimeout(()=> UI.backdrop.classList.add('hidden'), 200);
    setTimeout(()=> UI.addBtn?.focus(), 100);
  }
  window.openModal = function(emp){ drawerOpen(emp); };
  window.closeModal = function(){ drawerClose(); };
  window.closeEmpModal = drawerClose;
  document.addEventListener('DOMContentLoaded', ()=>{
    UI.addBtn && UI.addBtn.addEventListener('click', ()=>drawerOpen(null));
    UI.closeBtn && UI.closeBtn.addEventListener('click', drawerClose);
    UI.cancelBtn && UI.cancelBtn.addEventListener('click', drawerClose);
    UI.backdrop && UI.backdrop.addEventListener('click', (ev)=>{ if(ev.target===UI.backdrop) drawerClose(); });
    document.addEventListener('keydown', (ev)=>{ if(ev.key==='Escape' && UI.drawer.classList.contains('open')) drawerClose(); });
  });
})();
