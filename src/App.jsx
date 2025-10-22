import React, { useState } from 'react';

import RoleBar from './components/RoleBar';
import DaySlider from './components/DaySlider';
import EntryTable from './components/EntryTable';
import LoginPanel from './components/LoginPanel';

import EmployeeCreate from './components/EmployeeCreate';
import EmployeeList from './components/EmployeeList';

import './styles.css';

export default function App() {
  // Demo/Fake-Session (lokal ohne Supabase-Auth)
  const [session, setSession] = useState({ role: 'admin', employeeId: 1 });
  const [user, setUser] = useState(null);

  // Key-Refresh für EmployeeList nach dem Anlegen
  const [listKey, setListKey] = useState(0);
  const handleCreated = () => setListKey((k) => k + 1);

  return (
    <div className="app">
      <header className="header">
        <h1>Zeiterfassung • Rollen • Supabase-ready</h1>
        <div className="small">Mobil • Offline • GitHub Pages</div>
      </header>

      {/* Login */}
      <LoginPanel onAuth={setUser} />

      {/* Rolle/Zeiteingabe */}
      <RoleBar session={session} setSession={setSession} />
      <DaySlider session={session} setSession={setSession} />
      <EntryTable session={session} user={user} />

      {/* Mitarbeiterverwaltung */}
      <EmployeeCreate onCreated={handleCreated} />
      <EmployeeList key={listKey} />

      <footer>
        © {new Date().getFullYear()} Holzbau Zaunschirm GmbH
      </footer>
    </div>
  );
}
