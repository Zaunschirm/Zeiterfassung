
// js/firestore-adapter.js – Firestore CRUD + Realtime
(function(){
  if(!window.FB){ window.FB = {}; }
  function waitDb(){ return new Promise(res=>{ if(FB.db && FB.fs) return res(); const on=()=>{window.removeEventListener("fb-ready",on);res();}; window.addEventListener("fb-ready",on); }); }
  async function init(){
    await waitDb();
    const { collection, doc, getDoc, getDocs, setDoc, deleteDoc, onSnapshot } = FB.fs;
    // USERS
    async function readUsersFS(){ const snap = await getDocs(collection(FB.db,"users")); return snap.docs.map(d=>d.data()); }
    async function writeUserFS(user){ await setDoc(doc(FB.db,"users",user.id), user, {merge:true}); }
    async function deleteUserFS(userId){
      await deleteDoc(doc(FB.db,"users",userId));
      const daysSnap = await getDocs(collection(FB.db,"times",userId,"days"));
      await Promise.all(daysSnap.docs.map(d=> deleteDoc(d.ref)));
      const weeks = await getDocs(collection(FB.db,"plan"));
      await Promise.all(weeks.docs.map(async w=>{
        const data = w.data()||{}; const days=data.days||{}; let changed=false;
        Object.keys(days).forEach(dk=>{
          const obj=days[dk]||{};
          Object.keys(obj).forEach(pid=>{
            const arr=(obj[pid]||[]);
            const n=arr.filter(x=>x.uid!==userId);
            if(n.length!==arr.length){ obj[pid]=n; changed=true; }
          });
        });
        if(changed) await setDoc(w.ref,{days},{merge:true});
      }));
    }
    // PROJECTS
    async function readProjectsFS(){ const snap = await getDocs(collection(FB.db,"projects")); return snap.docs.map(d=>d.data()); }
    async function writeProjectFS(p){ await setDoc(doc(FB.db,"projects",p.id), p, {merge:true}); }
    async function deleteProjectFS(pid){ await deleteDoc(doc(FB.db,"projects",pid)); }
    // PLAN
    async function readPlanFS(weekId){ const s = await getDoc(doc(FB.db,"plan",weekId)); return s.exists()? (s.data().days||{}) : {}; }
    async function writePlanFS(weekId, days){ await setDoc(doc(FB.db,"plan",weekId), {days}, {merge:true}); }
    // TIMES
    async function readTimesFS(userId, dayKey){
      if(dayKey){
        const s=await getDoc(doc(FB.db,"times",userId,"days",dayKey));
        return s.exists()? (s.data().entries||[]) : [];
      }
      const ds=await getDocs(collection(FB.db,"times",userId,"days"));
      const out={}; ds.docs.forEach(d=> out[d.id]=(d.data().entries||[])); return out;
    }
    async function writeTimesFS(userId, dayKey, entries){ await setDoc(doc(FB.db,"times",userId,"days",dayKey), {entries}, {merge:true}); }
    // Realtime
    onSnapshot(collection(FB.db,"users"), ()=> window.dispatchEvent(new CustomEvent('data-sync',{detail:{evt:'users', ts:Date.now()}})));
    onSnapshot(collection(FB.db,"projects"), ()=> window.dispatchEvent(new CustomEvent('data-sync',{detail:{evt:'projects', ts:Date.now()}})));
    onSnapshot(collection(FB.db,"plan"), ()=> window.dispatchEvent(new CustomEvent('data-sync',{detail:{evt:'plan', ts:Date.now()}})));
    onSnapshot(collection(FB.db,"times"), ()=> window.dispatchEvent(new CustomEvent('data-sync',{detail:{evt:'times', ts:Date.now()}})));
    window.FS = { readUsersFS, writeUserFS, deleteUserFS, readProjectsFS, writeProjectFS, deleteProjectFS, readPlanFS, writePlanFS, readTimesFS, writeTimesFS };
    window.dispatchEvent(new CustomEvent("fs-ready"));
  }
  init().catch(console.error);
})();
