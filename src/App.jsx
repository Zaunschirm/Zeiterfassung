// src/App.jsx
import { HashRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import RequireAuth from './auth/RequireAuth';

// Beispiel-Imports – bitte an deine Komponenten anpassen:
import LoginPanel from "./components/LoginPanel.jsx";              // <- anpassen/erstellen
import Zeiterfassung from './components/Zeiterfassung.jsx';// <- anpassen
import Monatsuebersicht from './components/Monatsuebersicht.jsx'; // <- anpassen
import Projektfotos from './components/Projektfotos.jsx';  // <- anpassen
import Mitarbeiter from './components/Mitarbeiter.jsx';    // <- anpassen
import NavBar from './components/NavBar.jsx';              // <- anpassen

function Layout({ children }) {
  const { ready, user } = useAuth();
  // Leiste/Navi nur zeigen, wenn Session ermittelt und eingeloggt
  return (
    <>
      {ready && user && <NavBar />}
      {children}
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <Layout>
          <Routes>
            {/* Öffentlich */}
            <Route path="/login" element={<LoginPanel />} />

            {/* Geschützt */}
            <Route
              path="/zeiterfassung"
              element={
                <RequireAuth>
                  <Zeiterfassung />
                </RequireAuth>
              }
            />
            <Route
              path="/monatsuebersicht"
              element={
                <RequireAuth>
                  <Monatsuebersicht />
                </RequireAuth>
              }
            />
            <Route
              path="/projektfotos"
              element={
                <RequireAuth>
                  <Projektfotos />
                </RequireAuth>
              }
            />
            <Route
              path="/mitarbeiter"
              element={
                <RequireAuth>
                  <Mitarbeiter />
                </RequireAuth>
              }
            />

            {/* Default: geschützt auf Zeiterfassung */}
            <Route
              path="*"
              element={
                <RequireAuth>
                  <Zeiterfassung />
                </RequireAuth>
              }
            />
          </Routes>
        </Layout>
      </HashRouter>
    </AuthProvider>
  );
}
