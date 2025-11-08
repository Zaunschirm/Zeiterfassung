// src/App.jsx
import { useEffect, useState, createContext, useContext } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import NavBar from "./components/NavBar.jsx";
import DaySlider from "./components/DaySlider.jsx";
import MonthlyOverview from "./components/MonthlyOverview.jsx";
import LoginPanel from "./components/LoginPanel.jsx";

export const RoleCtx = createContext({ user: null, role: "mitarbeiter", id: null });

export default function App() {
  const [profile, setProfile] = useState(null);

  // Profil aus localStorage ziehen (wird in LoginPanel gesetzt)
  useEffect(() => {
    const isAuthed = localStorage.getItem("isAuthed") === "1";
    if (!isAuthed) return;
    const p = {
      id: localStorage.getItem("meId"),
      name: localStorage.getItem("meName"),
      code: localStorage.getItem("meCode"),
      role: (localStorage.getItem("meRole") || "mitarbeiter").toLowerCase(),
      notfallAdmin: localStorage.getItem("meNotfallAdmin") === "1",
    };
    setProfile(p);
  }, []);

  const ctx = {
    user: profile,
    role: profile?.role ?? "mitarbeiter",
    id: profile?.id ?? null,
  };

  if (!profile) return <LoginPanel onLoggedIn={setProfile} />;

  return (
    <RoleCtx.Provider value={ctx}>
      <BrowserRouter basename="/Zeiterfassung">
        <NavBar />
        <Routes>
          <Route path="/" element={<Navigate to="/zeiterfassung" replace />} />
          <Route path="/zeiterfassung" element={<DaySlider />} />
          <Route path="/monatsuebersicht" element={<MonthlyOverview />} />
          {/* weitere Routen können bleiben/ergänzt werden */}
          <Route path="*" element={<Navigate to="/zeiterfassung" replace />} />
        </Routes>
      </BrowserRouter>
    </RoleCtx.Provider>
  );
}

export const useRole = () => useContext(RoleCtx);
