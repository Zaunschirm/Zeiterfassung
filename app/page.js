import Link from 'next/link';

export default function Home() {
  return (
    <main style={{padding:24}}>
      <h1>Zauni – PIN Login</h1>
      <p><Link href="/login">Zur Anmeldung</Link></p>
      <p><Link href="/admin/employees">Admin: Mitarbeiter</Link></p>
    </main>
  );
}
