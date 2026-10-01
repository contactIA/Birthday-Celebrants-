import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'

export const metadata: Metadata = {
  title: 'Aniversariantes',
  description: 'Mensagens de aniversário para pacientes da clínica',
}

// As letras do CRM (Geist e Geist Mono) vêm com o app (next/font), sem pedido a
// outro servidor na hora de abrir: dentro do iframe da plataforma, cada pedido a
// menos conta.
const corpo = Geist({ variable: '--font-corpo', subsets: ['latin'], weight: ['400', '500', '600', '700'] })
const dados = Geist_Mono({ variable: '--font-dados', subsets: ['latin'], weight: ['400', '500'] })

// Só o esqueleto do documento. O chrome de cada área vive no layout dela:
// `(painel)/layout.tsx` com o AppShell da clínica, `setup/layout.tsx` com o da
// equipe. O AppShell aqui chamaria `/api/clinica` também na área de setup, que
// não tem clínica nenhuma.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${corpo.variable} ${dados.variable} h-full`}>
      <body className="min-h-full">{children}</body>
    </html>
  )
}
