// src/hooks/useSession.js
import { useEffect, useState, useCallback } from "react";
import {
  getSession as libGet,
  setSession as libSet,
  clearSession as libClear,
} from "../lib/session";

/**
 * 1:1 kompatibler React-Hook auf Basis von src/lib/session.js
 * - liefert { loading, isAuthenticated, user, role, loginWithCodePin, logout }
 * - zerstört keine bestehende Funktionalität
 */
export function useSession() {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);

  useEffect(() => {
    setSession(libGet());
    setLoading(false);
  }, []);

  const loginWithCodePin = useCallback(async ({ code, pin, role = "mitarbeiter", name = "" }) => {
    if (!code || !pin) throw new Error("Bitte Code und PIN eingeben.");
    const newSession = {
      user: { code, name, role },
      role,
      isAuthenticated: true,
      loggedInAt: new Date().toISOString(),
    };
    libSet(newSession);
    setSession(newSession);
    return newSession;
  }, []);

  const logout = useCallback(() => {
    libClear();
    setSession(null);
  }, []);

  return {
    loading,
    isAuthenticated: !!session?.isAuthenticated,
    user: session?.user ?? null,
    role: session?.role ?? "gast",
    loginWithCodePin,
    logout,
  };
}
