
(function(){
  const logoutBtn = document.getElementById('logoutBtn');
  if(logoutBtn) logoutBtn.addEventListener('click', logout);
  window.renderNavByRole = function(){
    const me = currentUser();
    document.querySelectorAll('.require-role-admin').forEach(el=>{ if(me?.role!=='admin') el.style.display='none'; });
    document.querySelectorAll('.require-role-lead').forEach(el=>{ if(!(me?.role==='admin'||me?.role==='lead')) el.style.display='none'; });
  };
  async function shadow(){ try{ const users = await DBAPI.readUsers(); localStorage.setItem(DB.usersKey, JSON.stringify(users)); }catch(e){} }
  window.addEventListener('fs-ready', shadow);
  window.addEventListener('data-sync', (e)=>{ if(e.detail?.evt==='users') shadow(); });
})();
