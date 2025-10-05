
(function(){
  const logoutBtn = document.getElementById('logoutBtn');
  if(logoutBtn){ logoutBtn.addEventListener('click', logout); }
  window.renderNavByRole = function(){
    const me = currentUser();
    document.querySelectorAll('.require-role-admin').forEach(el=>{
      if(me?.role!=='admin'){ el.style.display='none'; }
    });
    document.querySelectorAll('.require-role-lead').forEach(el=>{
      if(!(me?.role==='admin' || me?.role==='lead')){ el.style.display='none'; }
    });
  };
})();
