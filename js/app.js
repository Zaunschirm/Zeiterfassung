
(function(){
  const logoutBtn = document.getElementById('logoutBtn');
  if(logoutBtn) logoutBtn.addEventListener('click', logout);
  window.renderNavByRole = function(){
    const me = currentUser();
    document.querySelectorAll('.require-role-admin').forEach(el=>{ if(me?.role!=='admin') el.style.display='none'; });
    document.querySelectorAll('.require-role-lead').forEach(el=>{ if(!(me?.role==='admin'||me?.role==='lead')) el.style.display='none'; });
  };
})();

// Safe logout binding and role-based nav visible
(function(){
  const bind = ()=>{
    const btn=document.getElementById('logoutBtn');
    if(btn && !btn.__bound){
      btn.__bound=true;
      btn.addEventListener('click', ()=>{
        if(typeof logout==='function') logout(); else location.href='login.html';
      });
    }
    window.renderNavByRole = function(){
      try{
        const me = (typeof currentUser==='function') ? currentUser() : null;
        document.querySelectorAll('.require-role-admin').forEach(el=>{ if(me?.role!=='admin') el.style.display='none'; });
        document.querySelectorAll('.require-role-lead').forEach(el=>{ if(!(me?.role==='admin'||me?.role==='lead')) el.style.display='none'; });
      }catch(e){}
    };
  };
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', bind); else bind();
})();

// V03c DOM-ready + safe currentUser usage
(function(){
  const ready = (fn)=> (document.readyState==='loading') ? document.addEventListener('DOMContentLoaded', fn) : fn();
  ready(()=>{
    const btn = document.getElementById('logoutBtn');
    if(btn && !btn.__bound){
      btn.__bound = true;
      btn.addEventListener('click', ()=>{ try{ if(typeof logout==='function') logout(); else location.href='login.html'; }catch(_){ location.href='login.html'; } });
    }
    // Auto-render roles if function exists
    try{ if(typeof renderNavByRole==='function') renderNavByRole(); }catch(_){}
  });
})();
