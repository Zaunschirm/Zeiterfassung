
import { supa } from '../lib/supabase'

export async function signIn(email, password) {
  if (!supa) throw new Error('Supabase nicht konfiguriert (.env)')
  const { data, error } = await supa.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data.user
}
export async function signOut() {
  if (!supa) return
  await supa.auth.signOut()
}
export async function getUser() {
  if (!supa) return null
  const { data } = await supa.auth.getUser()
  return data.user || null
}
