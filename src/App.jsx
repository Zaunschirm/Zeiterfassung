
import React from 'react'
import RoleBar from './components/RoleBar'
import DaySlider from './components/DaySlider'
import EntryTable from './components/EntryTable'
import LoginPanel from './components/LoginPanel'
import './styles.css'

export default function App() {
  const [session, setSession] = React.useState({ role:'admin', employeeId:1 })
  const [user, setUser] = React.useState(null)
  return (<div className="app">
    <div className="header"><h1>Zeiterfassung • Rollen • Supabase-ready</h1>
      <div className="small">Mobil • Offline • GitHub Pages</div></div>
    <LoginPanel onAuth={setUser} />
    <RoleBar session={session} setSession={setSession} />
    <DaySlider session={session} />
    <EntryTable session={session} user={user} />
    <footer>© {new Date().getFullYear()} Holzbau Zaunschirm</footer>
  </div>)
}
import EmployeeCreate from './components/EmployeeCreate';
import EmployeeList from './components/EmployeeList';

export default function App() {
  return (
    <>
      {/* LoginPanel & restlicher Inhalt, den du schon hast … */}

      <EmployeeCreate onCreated={() => {/* optional: kannst du benutzen, wenn App laden soll */}} />
      <EmployeeList />
    </>
  );
}
