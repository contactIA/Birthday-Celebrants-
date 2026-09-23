import type { Metadata } from 'next'
import './globals.css'
import { AppShell } from '@/ui/AppShell'

export const metadata: Metadata = {
  title: 'Aniversariantes',
  description: 'Mensagens de aniversário para pacientes da clínica',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className="h-full">
      <body className="min-h-full">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  )
}
