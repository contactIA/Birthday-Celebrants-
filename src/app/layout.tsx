import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Aniversariantes',
  description: 'Mensagens de aniversário para pacientes da clínica',
}

// Só o esqueleto do documento. O chrome de cada área vive no layout dela:
// `(painel)/layout.tsx` com o AppShell da clínica, `setup/layout.tsx` com o da
// equipe. O AppShell aqui chamaria `/api/clinica` também na área de setup, que
// não tem clínica nenhuma.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className="h-full">
      <body className="min-h-full">{children}</body>
    </html>
  )
}
