'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'

// O chrome da área de setup. Deliberadamente diferente do painel da clínica
// (etiqueta "Setup" no cabeçalho): quem está aqui mexe em credenciais de todas
// as clínicas, e precisa saber que não está no painel de uma só.

export function SetupShell({ children }: { children: React.ReactNode }) {
  const caminho = usePathname()
  const [saindo, setSaindo] = useState(false)

  // A tela de entrar é só o cartão de senha — sem cabeçalho nem "Sair".
  if (caminho === '/setup/entrar') return <>{children}</>

  async function sair() {
    setSaindo(true)
    await fetch('/api/setup/sessao', { method: 'DELETE' }).catch(() => {})
    window.location.assign('/setup/entrar')
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex h-16 shrink-0 items-center gap-3 border-b border-line bg-surface px-4 sm:px-6">
        <Link href="/setup" className="text-[15px] font-semibold tracking-[-0.01em] text-ink">
          Aniversariantes
        </Link>
        <span className="rounded-full bg-ink px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white">
          Setup
        </span>
        <nav
          className="ml-3 flex min-w-0 items-center gap-0.5 overflow-x-auto rounded-[10px] bg-ground p-[3px]"
          aria-label="Seções do setup"
        >
          {[
            { href: '/setup', rotulo: 'Clínicas', ativo: caminho === '/setup' || caminho.startsWith('/setup/clinicas') },
            { href: '/setup/interessados', rotulo: 'Interessados', ativo: caminho === '/setup/interessados' },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={item.ativo ? 'page' : undefined}
              className={
                item.ativo
                  ? 'rounded-lg bg-surface px-3.5 py-[7px] text-sm font-medium whitespace-nowrap text-accent-ink shadow-[0_1px_2px_rgb(16_24_40/0.08)]'
                  : 'rounded-lg px-3.5 py-[7px] text-sm font-medium whitespace-nowrap text-ink-2 hover:text-ink'
              }
            >
              {item.rotulo}
            </Link>
          ))}
        </nav>
        <button
          onClick={sair}
          disabled={saindo}
          className="ml-auto rounded-lg px-3 py-1.5 text-sm font-medium text-ink-2 hover:bg-sunk hover:text-ink disabled:opacity-50"
        >
          {saindo ? 'Saindo…' : 'Sair'}
        </button>
      </header>
      {caminho === '/setup/previa-beta' ? (
        // A prévia ocupa a largura toda, como na aba da plataforma.
        <main className="flex-1">{children}</main>
      ) : (
        <main className="rolagem-discreta flex-1 overflow-y-auto px-6 py-8">
          <div className="mx-auto w-full max-w-4xl">{children}</div>
        </main>
      )}
    </div>
  )
}
