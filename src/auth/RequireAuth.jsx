// src/auth/RequireAuth.jsx
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthProvider';

export default function RequireAuth({ children }) {
  const { user, ready } = useAuth();
  const location = useLocation();

  // Während wir die Session ermitteln -> nichts (oder Loader)
  if (!ready) return null; // optional: <div>Lade…</div>

  // Nicht eingeloggt -> zum Login
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;

  // Eingeloggt
  return children;
}
