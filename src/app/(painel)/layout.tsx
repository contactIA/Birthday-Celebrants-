import { AppShell } from '@/ui/AppShell'

// O painel da clínica: Agenda, Modelos e Histórico. O grupo `(painel)` não
// aparece na URL — existe só para estas telas terem o AppShell e a área de
// setup, não.
export default function LayoutDoPainel({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>
}
