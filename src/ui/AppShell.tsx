'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import clsx from 'clsx'

// O shell: cabeçalho, navegação das três telas, e a clínica do acesso.
//
// SEM SELETOR DE CLÍNICA. O app anterior tinha um, porque a rota de clínicas
// devolvia todas as cadastradas. Hoje cada acesso é escopado a uma só — trocar
// de clínica é abrir o link de outra, não escolher num menu. O que sobrou é o
// nome, como informação de contexto.

interface Clinica {
  id: string
  companyId: string
  nome: string
}

type EstadoDaClinica =
  | { situacao: 'carregando' }
  | { situacao: 'pronta'; clinica: Clinica }
  /** Acesso válido, clínica ainda não provisionada. Caminho normal, não falha. */
  | { situacao: 'nao_liberada' }
  | { situacao: 'erro'; mensagem: string }

const ContextoDaClinica = createContext<EstadoDaClinica>({ situacao: 'carregando' })

export function useClinica() {
  return useContext(ContextoDaClinica)
}

const NAVEGACAO = [
  { href: '/', rotulo: 'Agenda' },
  { href: '/modelos', rotulo: 'Modelos' },
  { href: '/historico', rotulo: 'Histórico' },
]

export function AppShell({ children }: { children: React.ReactNode }) {
  const [estado, setEstado] = useState<EstadoDaClinica>({ situacao: 'carregando' })

  useEffect(() => {
    let ativo = true
    fetch('/api/clinica')
      .then(async (r) => ({ ok: r.ok, corpo: await r.json() }))
      .then(({ ok, corpo }) => {
        if (!ativo) return
        if (corpo?.codigo === 'CLINICA_NAO_PROVISIONADA') {
          setEstado({ situacao: 'nao_liberada' })
          return
        }
        if (!ok) throw new Error(corpo?.error ?? 'Não foi possível carregar a clínica')
        setEstado({ situacao: 'pronta', clinica: corpo as Clinica })
      })
      .catch((e: Error) => ativo && setEstado({ situacao: 'erro', mensagem: e.message }))
    return () => {
      ativo = false
    }
  }, [])

  // Substitui o shell INTEIRO, incluindo a navegação: Agenda, Modelos e
  // Histórico não levam a lugar nenhum sem clínica, e deixar a nav visível
  // convida a três cliques em telas quebradas.
  if (estado.situacao === 'nao_liberada') return <NaoLiberada />

  return (
    <ContextoDaClinica.Provider value={estado}>
      <div className="flex min-h-screen flex-col">
        <Cabecalho estado={estado} />
        <main className="rolagem-discreta flex-1 overflow-y-auto px-6 py-6">{children}</main>
      </div>
    </ContextoDaClinica.Provider>
  )
}

function Cabecalho({ estado }: { estado: EstadoDaClinica }) {
  const caminho = usePathname()

  return (
    <header className="flex h-14 shrink-0 items-center gap-6 border-b border-line bg-surface px-6">
      <span className="text-[15px] font-semibold tracking-[-0.01em] text-ink">Aniversariantes</span>

      <nav className="flex items-center gap-1" aria-label="Seções">
        {NAVEGACAO.map(({ href, rotulo }) => {
          const ativo = caminho === href
          return (
            <Link
              key={href}
              href={href}
              aria-current={ativo ? 'page' : undefined}
              className={clsx(
                'rounded-full px-3 py-1.5 text-sm transition-colors',
                ativo
                  ? 'bg-accent-soft font-medium text-accent-ink'
                  : 'text-ink-2 hover:bg-sunk hover:text-ink'
              )}
            >
              {rotulo}
            </Link>
          )
        })}
      </nav>

      <span className="ml-auto truncate text-sm text-muted">
        {estado.situacao === 'pronta' ? estado.clinica.nome : ''}
      </span>
    </header>
  )
}

/**
 * Acesso válido, clínica ainda não provisionada.
 *
 * Deliberadamente curta: uma frase que diz o que fazer. Nada de explicar que o
 * painel existe, nem de expor identificador de conta — quem lê não precisa de
 * nenhuma das duas coisas para agir, e cada linha extra afasta a única que
 * importa. Sem botão: a ação é humana e fora do app.
 */
function NaoLiberada() {
  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm rounded-[12px] border border-line bg-surface px-8 py-10 text-center">
        <h1 className="text-[17px] font-semibold leading-snug text-ink">
          Painel ainda não liberado para esta clínica
        </h1>
        <p className="mt-2.5 text-sm leading-relaxed text-muted">
          Fale com quem administra a conta para liberar o acesso.
        </p>
      </div>
    </div>
  )
}
