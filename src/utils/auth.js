// src/utils/auth.js
import supa from '../lib/supabase'

// E-Mail/Passwort Login
export async function signIn(email, password) {
  const { data, error } = await supa.auth.signInWithPassword({
    email,
    password,
  })
  if (error) throw error
  return data.user
}

// Logout
export async function signOut() {
  const { error } = await supa.auth.signOut()
  if (error) throw error
  return true
}

// aktuell eingeloggten User holen (oder null)
export async function getUser() {
  const { data, error } = await supa.auth.getUser()
  if (error) throw error
  return data.user ?? null
}
