'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import clsx from 'clsx'
import { PaginaBeta } from '@/ui/beta/PaginaBeta'

// O shell: cabeçalho, navegação das três telas, e a clínica do acesso.
//
// SEM SELETOR DE CLÍNICA. O app anterior tinha um, porque a rota de clínicas
// devolvia todas as cadastradas. Hoje cada acesso é escopado a uma só — trocar
// de clínica é abrir o link de outra, não escolher num menu.
//
// O seletor que existe é o de UNIDADE, e só aparece quando a clínica tem mais de
// uma. Ele lista as unidades da própria clínica; a escolha vira um cookie que o
// servidor confere a cada requisição (ver `unidadeDaRequisicao`).

interface Unidade {
  id: string
  nome: string
  principal: boolean
}

interface Clinica {
  id: string
  companyId: string
  nome: string
  unidades: Unidade[]
  unidadeAtualId: string
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

  // Clínica ainda não cadastrada: a página de beta substitui o shell INTEIRO,
  // navegação incluída — Agenda, Modelos e Histórico não levam a lugar nenhum
  // sem clínica. Antes era um cartão "painel ainda não liberado", sem saída;
  // agora é pedido de vaga, que cai na área de setup.
  if (estado.situacao === 'nao_liberada') return <PaginaBeta />

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
          // `?clinica=` em todo link interno: a URL de cada tela carrega a
          // clínica, e o F5 (que o navegador trata como navegação de entrada)
          // continua com escopo explícito. Sem isso o proxy recusaria o F5 em
          // Modelos ou Histórico — ver `navegacaoDeEntrada` em acesso/decisao.ts.
          const destino =
            estado.situacao === 'pronta' ? `${href}?clinica=${encodeURIComponent(estado.clinica.companyId)}` : href
          return (
            <Link
              key={href}
              href={destino}
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

      <div className="ml-auto flex min-w-0 items-center gap-3">
        {estado.situacao === 'pronta' && estado.clinica.unidades.length > 1 && (
          <SeletorDeUnidade clinica={estado.clinica} />
        )}
        <span className="truncate text-sm text-muted">
          {estado.situacao === 'pronta' ? estado.clinica.nome : ''}
        </span>
      </div>
    </header>
  )
}

function SeletorDeUnidade({ clinica }: { clinica: Clinica }) {
  const [trocando, setTrocando] = useState(false)
  const [erro, setErro] = useState(false)

  async function trocar(unidadeId: string) {
    if (unidadeId === clinica.unidadeAtualId) return
    setTrocando(true)
    setErro(false)
    try {
      const r = await fetch('/api/clinica', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ unidadeId }),
      })
      if (!r.ok) throw new Error()
      // Recarrega: agenda, modelos e histórico são todos da unidade anterior, e
      // refazer cada busca à mão é onde uma tela ficaria com dado da outra.
      window.location.reload()
    } catch {
      setErro(true)
      setTrocando(false)
    }
  }

  return (
    <label className="flex items-center gap-2 text-sm text-ink-2">
      <span className="sr-only sm:not-sr-only">Unidade</span>
      <select
        value={clinica.unidadeAtualId}
        disabled={trocando}
        onChange={(e) => trocar(e.target.value)}
        aria-invalid={erro || undefined}
        className="h-9 max-w-48 rounded-lg border border-line bg-surface px-2 text-sm text-ink disabled:opacity-60"
      >
        {clinica.unidades.map((u) => (
          <option key={u.id} value={u.id}>
            {u.nome}
          </option>
        ))}
      </select>
      {erro && <span className="text-xs text-erro">Não foi possível trocar</span>}
    </label>
  )
}
