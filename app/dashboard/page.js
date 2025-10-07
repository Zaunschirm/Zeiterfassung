'use client';
export default function Dashboard(){ async function logout(){ await fetch('/api/logout',{method:'POST'}); location.href='/login'; } return (<div style={{padding:24}}><h1>Dashboard</h1><p>Erfolgreich eingeloggt. (Geschützter Bereich)</p><button onClick={logout} style={{padding:'10px 14px',border:0,borderRadius:10,background:'#222',color:'#fff'}}>Logout</button></div>); }
