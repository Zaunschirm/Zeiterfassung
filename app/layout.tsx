import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Zauni – Zeiterfassung',
  description: 'Login per Mitarbeitercode + PIN'
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body>
        <div className="container">{children}</div>
      </body>
    </html>
  )
}
