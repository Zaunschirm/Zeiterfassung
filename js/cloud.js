
/**
 * Cloud Sync for "Arbeitseinteilung & Zeiterfassung"
 * Works with Firebase Firestore (client-only). Fill CLOUD.config & companyKey on the Cloud page.
 * If not configured, app stays local (no change needed).
 */
window.CLOUD = {
  enabled: false,          // set true after saving settings
  companyKey: null,        // e.g. "zaunschirm"
  config: null,            // Firebase config object
  _initialized: false,
  _db: null,
  _unsub: null,
  _cache: null,            // last state from cloud
};

async function cloudInitIfNeeded(){
  if(!window.CLOUD.enabled || window.CLOUD._initialized) return;
  if(!window.CLOUD.config || !window.CLOUD.companyKey){ console.warn('Cloud enabled but not configured'); return; }

  // Load Firebase via CDN (modular v10 compat import)
  if(!window.firebase){
    await new Promise((resolve, reject)=>{
      const s1=document.createElement('script'); s1.src='https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js'; s1.onload=resolve; s1.onerror=reject; document.head.appendChild(s1);
    });
    await new Promise((resolve, reject)=>{
      const s2=document.createElement('script'); s2.src='https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js'; s2.onload=resolve; s2.onerror=reject; document.head.appendChild(s2);
    });
    await new Promise((resolve, reject)=>{
      const s3=document.createElement('script'); s3.src='https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js'; s3.onload=resolve; s3.onerror=reject; document.head.appendChild(s3);
    });
  }
  const app = firebase.initializeApp(window.CLOUD.config);
  window.CLOUD._db = firebase.firestore();
  // anonymous auth (for rules you can allow read/write for signed-in users and restrict by companyKey doc path)
  try{ await firebase.auth().signInAnonymously(); }catch(e){ console.warn('Anon auth failed', e); }
  window.CLOUD._initialized = true;
}

function cloudDocRef(){
  return window.CLOUD._db.collection('companies').doc(String(window.CLOUD.companyKey)).collection('state').doc('default');
}

async function cloudSubscribe(onChange){
  await cloudInitIfNeeded();
  if(!window.CLOUD.enabled) return ()=>{};
  if(window.CLOUD._unsub) window.CLOUD._unsub(); // reset
  window.CLOUD._unsub = cloudDocRef().onSnapshot((snap)=>{
    if(snap.exists){
      const data = snap.data()||{};
      window.CLOUD._cache = data;
      onChange && onChange(data);
    }else{
      const init = { users:[], times:{}, plan:{}, projects:[] };
      cloudDocRef().set(init, {merge:true});
      window.CLOUD._cache = init;
      onChange && onChange(init);
    }
  }, (err)=> console.error('Cloud subscribe error', err));
  return window.CLOUD._unsub;
}

async function cloudSaveFull(state){
  await cloudInitIfNeeded();
  if(!window.CLOUD.enabled) return;
  try{
    await cloudDocRef().set(state, {merge:false});
  }catch(e){
    console.error('Cloud save failed', e);
    alert('Cloud-Speichern fehlgeschlagen: '+e.message);
  }
}

function cloudGetCache(){ return window.CLOUD._cache; }

// Settings helpers (persisted locally)
function loadCloudSettings(){
  try{
    const raw = localStorage.getItem('z_cloud_settings');
    if(!raw) return;
    const s = JSON.parse(raw);
    window.CLOUD.enabled = !!s.enabled;
    window.CLOUD.companyKey = s.companyKey || null;
    window.CLOUD.config = s.config || null;
  }catch(e){}
}
function saveCloudSettings(enabled, companyKey, config){
  const s = { enabled: !!enabled, companyKey: companyKey||null, config: config||null };
  localStorage.setItem('z_cloud_settings', JSON.stringify(s));
  window.CLOUD.enabled = s.enabled; window.CLOUD.companyKey = s.companyKey; window.CLOUD.config = s.config;
  if(window.CLOUD._unsub){ try{ window.CLOUD._unsub(); }catch(_){}; window.CLOUD._unsub=null; }
  window.CLOUD._initialized=false;
}
loadCloudSettings();
