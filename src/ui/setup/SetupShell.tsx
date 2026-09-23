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
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-surface px-6">
        <Link href="/setup" className="text-[15px] font-semibold tracking-[-0.01em] text-ink">
          Aniversariantes
        </Link>
        <span className="rounded-full bg-ink px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white">
          Setup
        </span>
        <button
          onClick={sair}
          disabled={saindo}
          className="ml-auto rounded-full px-3 py-1.5 text-sm text-ink-2 hover:bg-sunk hover:text-ink disabled:opacity-50"
        >
          {saindo ? 'Saindo…' : 'Sair'}
        </button>
      </header>
      <main className="rolagem-discreta flex-1 overflow-y-auto px-6 py-8">
        <div className="mx-auto w-full max-w-4xl">{children}</div>
      </main>
    </div>
  )
}
