import React from 'react';
import RoleBar from './components/RoleBar';
import DaySlider from './components/DaySlider';
import EntryTable from './components/EntryTable';
import LoginPanel from './components/LoginPanel';
import EmployeeCreate from './components/EmployeeCreate';
import EmployeeList from './components/EmployeeList';
import './styles.css';

export default function App() {
  const [session, setSession] = React.useState({ role: 'admin', employeeId: 1 });
  const [user, setUser] = React.useState(null);

  return (
    <div className="app">
      <header className="header">
        <h1>Zeiterfassung • Rollen • Supabase-ready</h1>
        <div className="small">Mobil • Offline • GitHub Pages</div>
      </header>

      {/* Login */}
      <LoginPanel onAuth={setUser} />

      {/* Rollenanzeige / Zeiteingabe */}
      <RoleBar session={session} setSession={setSession} />
      <DaySlider session={session} setSession={setSession} />
      <EntryTable session={session} user={user} />

      {/* Mitarbeiterverwaltung */}
      <EmployeeCreate />
      <EmployeeList />

      <footer>
        © {new Date().getFullYear()} Holzbau Zaunschirm GmbH
      </footer>
    </div>
  );
}
