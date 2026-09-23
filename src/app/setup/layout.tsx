import type { Metadata } from 'next'
import { SetupShell } from '@/ui/setup/SetupShell'

export const metadata: Metadata = {
  title: 'Setup · Aniversariantes',
  // Área interna: fora de buscador, mesmo que alguém publique o endereço.
  robots: { index: false, follow: false },
}

export default function LayoutDoSetup({ children }: { children: React.ReactNode }) {
  return <SetupShell>{children}</SetupShell>
}
