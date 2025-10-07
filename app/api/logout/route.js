import { cookies } from 'next/headers';
export async function POST() {
  cookies().set({ name: 'session', value: '', path: '/', maxAge: 0 });
  return Response.json({ ok: true });
}
