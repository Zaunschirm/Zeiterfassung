
// js/firebase-init.js – Dummy-Config; bitte deine Firebase-Daten einsetzen!
(async function(){
  window.FB = window.FB || {};
  const appMod = await import("https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js");
  const fsMod = await import("https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js");
  const firebaseConfig = {
    apiKey: "DEIN_API_KEY",                           // z.B. "AIzaSyAbC123..."
    authDomain: "DEIN_PROJEKT.firebaseapp.com",       // z.B. "zaunschirm-app.firebaseapp.com"
    projectId: "DEIN_PROJEKT_ID",                     // z.B. "zaunschirm-app"
    storageBucket: "DEIN_PROJEKT.appspot.com",        // z.B. "zaunschirm-app.appspot.com"
    messagingSenderId: "DEINE_SENDER_ID",             // z.B. "123456789012"
    appId: "DEINE_APP_ID"                             // z.B. "1:123456789012:web:abcdef123456"
  };
  const app = appMod.initializeApp(firebaseConfig);
  const db = fsMod.getFirestore(app);
  try{ await fsMod.enableIndexedDbPersistence(db); }catch(e){ console.warn('Offline-Persistenz nicht aktiv:', e?.code||e); }
  window.FB.app = app; window.FB.db = db; window.FB.fs = fsMod;
  window.dispatchEvent(new CustomEvent("fb-ready"));
})();
