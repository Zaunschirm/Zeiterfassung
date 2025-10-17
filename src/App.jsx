import React from 'react'
import RoleBar from './components/RoleBar'
import DaySlider from './components/DaySlider'
import EntryTable from './components/EntryTable'
import db from './db'
import './styles.css'

export default function App() {
  return (<div className="app">
    <div className="header">
      <h1>Zeiterfassung – Rollen & Slider (15‑Min Raster)</h1>
      <div className="small">Mobil optimiert • Offline‑fähig • GitHub Pages ready</div>
    </div>
    <RoleBar />
    <DaySlider />
    <EntryTable />
    <footer>© {new Date().getFullYear()} Holzbau Zaunschirm</footer>
  </div>)
}
