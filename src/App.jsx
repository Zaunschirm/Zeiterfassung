// src/App.jsx  (1:1 ersetzen)
import { useEffect, useState, createContext, useContext } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import NavBar from "./components/NavBar.jsx";
import DaySlider from "./components/DaySlider.jsx";
import MonthlyOverview from "./components/MonthlyOverview.jsx";
import LoginPanel from "./components/LoginPanel.jsx";
import { supabase } from './lib/supabase'


export const RoleCtx = createContext({ user: null, role: "mitarbeiter", id: null });

export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null); // {id, name, code, role}

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
  }, []);

  // wir haben PIN-Login ohne Supabase-Auth → wir speichern im localStorage
  useEffect(() => {
    const raw = localStorage.getItem("hz_login");
    if (raw) setProfile(JSON.parse(raw));
  }, []);

  const ctx = { user: profile, role: profile?.role ?? "mitarbeiter", id: profile?.id ?? null };

  if (!profile) return <LoginPanel onLoggedIn={setProfile} />;

  return (
    <RoleCtx.Provider value={ctx}>
      <BrowserRouter basename="/Zeiterfassung">
        <NavBar />
        <Routes>
          <Route path="/" element={<Navigate to="/zeiterfassung" replace />} />
          <Route path="/zeiterfassung" element={<DaySlider />} />
          <Route path="/monatsuebersicht" element={<MonthlyOverview />} />
          {/* Platzhalter: Projekte, Fotos, Admin könnt ihr später anhängen */}
          <Route path="*" element={<Navigate to="/zeiterfassung" replace />} />
        </Routes>
      </BrowserRouter>
    </RoleCtx.Provider>
  );
}

export const useRole = () => useContext(RoleCtx);
