'use client'

import clsx from 'clsx'
import { useCallback, useEffect, useState } from 'react'
import { Aviso, Botao, Vazio } from '@/ui/primitivos'
import { SituacaoDoEnvio } from '@/ui/SituacaoDoEnvio'
import { formatarTelefoneBR } from '@/shared/telefone/e164'

// O histórico de envios, paginado e filtrável.
//
// O desenho segue a tela de mensagens agendadas da própria plataforma
// (contato com telefone embaixo, situação com ícone, canal, modelo, datas de
// envio e criação, seleção para cancelar): a equipe já conhece aquela tela, e
// aqui ela acha as mesmas coisas nos mesmos lugares.
//
// O app anterior devolvia a tabela inteira sem limite, e ela cresce um registro
// por paciente por ano, indefinidamente.

interface Item {
  id: string
  pacienteNome: string
  pacienteTelefone: string
  status: string
  agendadoPara: string | null
  criadoEm: string
  modeloNome: string | null
  podeCancelar: boolean
}

interface Pagina {
  itens: Item[]
  total: number
  pagina: number
  porPagina: number
  remetente: string | null
}

type Situacao = '' | 'agendadas' | 'enviadas' | 'canceladas' | 'falhas'
type Ordem = 'envio' | 'criacao'

const SITUACOES: { valor: Situacao; rotulo: string }[] = [
  { valor: '', rotulo: 'Todas as situações' },
  { valor: 'agendadas', rotulo: 'Agendadas' },
  { valor: 'enviadas', rotulo: 'Enviadas, entregues e lidas' },
  { valor: 'canceladas', rotulo: 'Canceladas' },
  { valor: 'falhas', rotulo: 'Com falha' },
]

/** Espera depois da última tecla antes de buscar. */
const ESPERA_DA_BUSCA_MS = 350

// Os rótulos de status vêm de `ui/statusDoEnvio.ts`, o mesmo mapa da Agenda.
// A reconciliação traz o status real da plataforma a cada 15 minutos: é o
// atraso máximo do que esta tela mostra, o preço de não ter webhook.

function formatarData(iso: string | null): string {
  if (!iso) return 'Sem data'
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return '?'
  return (partes[0]![0]! + (partes.length > 1 ? partes.at(-1)![0]! : '')).toUpperCase()
}

export function Historico() {
  const [pagina, setPagina] = useState(1)
  const [busca, setBusca] = useState('')
  const [buscaAplicada, setBuscaAplicada] = useState('')
  const [situacao, setSituacao] = useState<Situacao>('')
  const [ordem, setOrdem] = useState<Ordem>('envio')
  const [crescente, setCrescente] = useState(false)

  const [dados, setDados] = useState<Pagina | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [tentativa, setTentativa] = useState(0)

  const [selecionados, setSelecionados] = useState<Set<string>>(() => new Set())
  const [confirmando, setConfirmando] = useState(false)
  const [cancelando, setCancelando] = useState(false)

  const recarregar = useCallback(() => setTentativa((n) => n + 1), [])

  /** Filtro novo: volta à primeira página e esquece a seleção, que era de outra lista. */
  function aoFiltrar(aplicar: () => void) {
    aplicar()
    setPagina(1)
    setSelecionados(new Set())
    setConfirmando(false)
  }

  // A busca só vai ao servidor quando a pessoa para de digitar.
  useEffect(() => {
    const t = setTimeout(() => {
      if (busca.trim() === buscaAplicada) return
      setBuscaAplicada(busca.trim())
      setPagina(1)
      setSelecionados(new Set())
    }, ESPERA_DA_BUSCA_MS)
    return () => clearTimeout(t)
  }, [busca, buscaAplicada])

  useEffect(() => {
    const abortar = new AbortController()
    const params = new URLSearchParams({
      pagina: String(pagina),
      ordem,
      direcao: crescente ? 'asc' : 'desc',
    })
    if (buscaAplicada) params.set('busca', buscaAplicada)
    if (situacao) params.set('situacao', situacao)

    async function buscar() {
      setCarregando(true)
      setErro(null)
      try {
        const resposta = await fetch(`/api/historico?${params}`, { signal: abortar.signal })
        const corpo = await resposta.json()
        if (!resposta.ok) throw new Error(corpo?.error ?? 'Não foi possível carregar o histórico')
        setDados(corpo as Pagina)
      } catch (e) {
        if (!abortar.signal.aborted) setErro((e as Error).message)
      } finally {
        if (!abortar.signal.aborted) setCarregando(false)
      }
    }
    void buscar()
    return () => abortar.abort()
  }, [pagina, buscaAplicada, situacao, ordem, crescente, tentativa])

  const cancelaveis = dados?.itens.filter((i) => i.podeCancelar) ?? []
  const todosMarcados = cancelaveis.length > 0 && cancelaveis.every((i) => selecionados.has(i.id))

  function alternar(id: string) {
    setConfirmando(false)
    setSelecionados((atual) => {
      const novo = new Set(atual)
      if (novo.has(id)) novo.delete(id)
      else novo.add(id)
      return novo
    })
  }

  function alternarTodos() {
    setConfirmando(false)
    setSelecionados(todosMarcados ? new Set() : new Set(cancelaveis.map((i) => i.id)))
  }

  // Um por vez, como no agendamento: a plataforma tem limite de taxa, e uma
  // falha não impede as outras.
  async function cancelarSelecionados() {
    setCancelando(true)
    setErro(null)
    const falhas: string[] = []
    for (const id of selecionados) {
      try {
        const resposta = await fetch(`/api/agendamentos/${id}/cancelar`, { method: 'POST' })
        if (!resposta.ok) {
          const corpo = await resposta.json().catch(() => null)
          falhas.push(corpo?.error ?? 'Não foi possível cancelar')
        }
      } catch {
        falhas.push('Não foi possível cancelar')
      }
    }
    if (falhas.length > 0) {
      setErro(
        falhas.length === 1
          ? falhas[0]!
          : `${falhas.length} mensagens não foram canceladas. ${falhas[0]}`
      )
    }
    setSelecionados(new Set())
    setConfirmando(false)
    setCancelando(false)
    recarregar()
  }

  const inicio = dados && dados.total > 0 ? (dados.pagina - 1) * dados.porPagina + 1 : 0
  const fim = dados ? Math.min(dados.total, dados.pagina * dados.porPagina) : 0
  const filtrando = !!buscaAplicada || !!situacao

  return (
    // Mesma largura das outras telas: trocar de aba não pode mover a margem.
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      {/* ── Cabeçalho ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-[-0.01em] text-ink">Histórico de envios</h1>
          <p className="mt-0.5 text-sm text-muted">
            {dados ? (
              <>
                <span className="tnum">{dados.total}</span>{' '}
                {dados.total === 1 ? 'envio encontrado' : 'envios encontrados'}
              </>
            ) : (
              'Todas as mensagens de aniversário desta clínica.'
            )}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {confirmando ? (
            <div className="flex items-center gap-2 rounded-full border border-atencao/30 bg-atencao-soft py-1 pr-1 pl-3.5">
              <span className="text-sm text-atencao">
                Cancelar <span className="tnum">{selecionados.size}</span>{' '}
                {selecionados.size === 1 ? 'mensagem' : 'mensagens'}?
              </span>
              <Botao tamanho="sm" onClick={cancelarSelecionados} disabled={cancelando}>
                {cancelando ? 'Cancelando…' : 'Sim, cancelar'}
              </Botao>
              <Botao variante="secundario" tamanho="sm" onClick={() => setConfirmando(false)} disabled={cancelando}>
                Não
              </Botao>
            </div>
          ) : (
            <Botao
              variante="secundario"
              tamanho="sm"
              onClick={() => setConfirmando(true)}
              disabled={selecionados.size === 0}
            >
              <IconeX />
              Cancelar{selecionados.size > 0 && <span className="tnum"> ({selecionados.size})</span>}
            </Botao>
          )}
          <button
            type="button"
            onClick={recarregar}
            aria-label="Atualizar"
            title="Atualizar"
            className="grid h-9 w-9 place-items-center rounded-full border border-line bg-surface text-ink-2 transition-colors hover:bg-sunk hover:text-ink"
          >
            <IconeAtualizar girando={carregando} />
          </button>
        </div>
      </div>

      {/* ── Filtros ───────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-[240px] flex-1 sm:max-w-sm">
          <span className="sr-only">Pesquisar paciente</span>
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Pesquisar paciente ou telefone"
            className={clsx(ESTILO_CONTROLE, 'w-full pr-9 pl-3.5')}
          />
          <IconeLupa />
        </label>

        <label className="relative">
          <span className="sr-only">Situação</span>
          <select
            value={situacao}
            onChange={(e) => aoFiltrar(() => setSituacao(e.target.value as Situacao))}
            className={clsx(ESTILO_CONTROLE, 'pr-8 pl-3.5', situacao && 'border-accent/50 text-accent-ink')}
          >
            {SITUACOES.map((s) => (
              <option key={s.valor} value={s.valor}>
                {s.rotulo}
              </option>
            ))}
          </select>
        </label>

        <div className="flex">
          <label className="relative">
            <span className="sr-only">Ordenar por</span>
            <select
              value={ordem}
              onChange={(e) => aoFiltrar(() => setOrdem(e.target.value as Ordem))}
              className={clsx(ESTILO_CONTROLE, 'rounded-r-none pr-8 pl-3.5')}
            >
              <option value="envio">Data de envio</option>
              <option value="criacao">Data de criação</option>
            </select>
          </label>
          <button
            type="button"
            onClick={() => aoFiltrar(() => setCrescente((c) => !c))}
            aria-label={crescente ? 'Mais antigas primeiro' : 'Mais recentes primeiro'}
            title={crescente ? 'Mais antigas primeiro' : 'Mais recentes primeiro'}
            className={clsx(ESTILO_CONTROLE, '-ml-px grid w-10 place-items-center rounded-l-none text-accent-ink')}
          >
            <IconeSeta paraCima={crescente} />
          </button>
        </div>
      </div>

      {erro && (
        <Aviso tom="erro" acao={{ rotulo: 'Tentar de novo', aoClicar: recarregar }}>
          {erro}
        </Aviso>
      )}

      {!dados && carregando && <EsqueletoDaTabela />}

      {dados && dados.itens.length === 0 && !carregando && (
        filtrando ? (
          <Vazio titulo="Nenhum envio com esses filtros">
            Mude a busca ou a situação para ver outros envios.
          </Vazio>
        ) : (
          <Vazio titulo="Nenhuma mensagem ainda">Quando você agendar o primeiro parabéns, ele aparece aqui.</Vazio>
        )
      )}

      {dados && dados.itens.length > 0 && (
        <div className={clsx('flex flex-col gap-3 transition-opacity', carregando && 'opacity-60')}>
          {/* Tela estreita: cartões. A tabela, rolando de lado, escondia a
              situação fora da tela. */}
          <ul className="flex flex-col gap-2 md:hidden">
            {dados.itens.map((item) => (
              <li key={item.id} className="rounded-[12px] border border-line bg-surface px-4 py-3">
                <div className="flex items-start gap-3">
                  {item.podeCancelar && (
                    <Marcador marcado={selecionados.has(item.id)} aoMudar={() => alternar(item.id)} rotulo={item.pacienteNome} />
                  )}
                  <div className="min-w-0 flex-1">
                    <Contato nome={item.pacienteNome} telefone={item.pacienteTelefone} />
                  </div>
                  <SituacaoDoEnvio status={item.status} />
                </div>
                <div className="mt-2 flex flex-col gap-0.5 pl-12 text-xs text-ink-2">
                  <span className="truncate">{item.modeloNome ?? 'Modelo removido'}</span>
                  <Datas envio={item.agendadoPara} criacao={item.criadoEm} />
                </div>
              </li>
            ))}
          </ul>

          <div className="hidden overflow-hidden rounded-[12px] border border-line bg-surface md:block">
            <table className="w-full table-fixed text-sm">
              <colgroup>
                <col className="w-12" />
                <col className="w-[24%]" />
                <col className="w-[14%]" />
                <col className="w-[15%]" />
                <col />
                <col className="w-[19%]" />
              </colgroup>
              <thead>
                <tr className="border-b border-line bg-sunk/50 text-left text-[13px] text-ink-2">
                  <th className="py-3 pl-4">
                    <Marcador
                      marcado={todosMarcados}
                      aoMudar={alternarTodos}
                      desabilitado={cancelaveis.length === 0}
                      rotulo="todas as mensagens agendadas desta página"
                    />
                  </th>
                  <th className="px-3 py-3 font-medium">Paciente</th>
                  <th className="px-3 py-3 font-medium">Situação</th>
                  <th className="px-3 py-3 font-medium">Canal</th>
                  <th className="px-3 py-3 font-medium">Mensagem</th>
                  <th className="px-3 py-3 font-medium">Datas</th>
                </tr>
              </thead>
              <tbody>
                {dados.itens.map((item) => (
                  <tr
                    key={item.id}
                    className={clsx(
                      'border-b border-line-soft align-middle last:border-b-0',
                      selecionados.has(item.id) ? 'bg-accent-soft/60' : 'hover:bg-sunk/40'
                    )}
                  >
                    <td className="py-3 pl-4">
                      {item.podeCancelar && (
                        <Marcador
                          marcado={selecionados.has(item.id)}
                          aoMudar={() => alternar(item.id)}
                          rotulo={item.pacienteNome}
                        />
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <Contato nome={item.pacienteNome} telefone={item.pacienteTelefone} />
                    </td>
                    <td className="px-3 py-3">
                      <SituacaoDoEnvio status={item.status} />
                    </td>
                    <td className="px-3 py-3">
                      <Canal remetente={dados.remetente} />
                    </td>
                    <td className="px-3 py-3">
                      <span className="flex min-w-0 items-center gap-2 text-ink-2">
                        <IconeMensagem />
                        <span className={clsx('line-clamp-2 leading-snug', !item.modeloNome && 'text-muted italic')}>
                          {item.modeloNome ?? 'Modelo removido'}
                        </span>
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <Datas envio={item.agendadoPara} criacao={item.criadoEm} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <nav className="flex items-center justify-center gap-3 pt-1" aria-label="Paginação">
            <span className="tnum text-sm text-muted">
              {inicio}–{fim} de {dados.total}
            </span>
            <BotaoDePagina
              rotulo="Página anterior"
              desabilitado={dados.pagina <= 1 || carregando}
              aoClicar={() => setPagina((p) => Math.max(1, p - 1))}
            >
              ‹
            </BotaoDePagina>
            <BotaoDePagina
              rotulo="Próxima página"
              desabilitado={fim >= dados.total || carregando}
              aoClicar={() => setPagina((p) => p + 1)}
            >
              ›
            </BotaoDePagina>
          </nav>
        </div>
      )}
    </div>
  )
}

const ESTILO_CONTROLE =
  'h-10 appearance-none rounded-[10px] border border-line bg-surface text-sm text-ink placeholder:text-muted focus:border-accent focus:ring-4 focus:ring-accent/10 focus:outline-none'

function Contato({ nome, telefone }: { nome: string; telefone: string }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent-soft text-[12px] font-semibold text-accent-ink">
        {iniciais(nome)}
      </span>
      <div className="min-w-0">
        <p className="truncate font-medium text-ink" title={nome}>
          {nome}
        </p>
        <p className="tnum truncate text-[13px] text-muted">{formatarTelefoneBR(telefone)}</p>
      </div>
    </div>
  )
}

function Canal({ remetente }: { remetente: string | null }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <IconeWhatsApp />
      <div className="min-w-0">
        <p className="text-ink">WhatsApp</p>
        <p className="tnum truncate text-[13px] text-muted">
          {remetente ? formatarTelefoneBR(remetente) : 'Número da conta'}
        </p>
      </div>
    </div>
  )
}

function Datas({ envio, criacao }: { envio: string | null; criacao: string }) {
  return (
    <div className="tnum flex flex-col gap-0.5 text-[13px] leading-snug">
      <span className="text-ink-2">
        <span className="text-muted">Envio:</span> {formatarData(envio)}
      </span>
      <span className="text-ink-2">
        <span className="text-muted">Criação:</span> {formatarData(criacao)}
      </span>
    </div>
  )
}

function Marcador({
  marcado,
  aoMudar,
  rotulo,
  desabilitado = false,
}: {
  marcado: boolean
  aoMudar: () => void
  rotulo: string
  desabilitado?: boolean
}) {
  return (
    <input
      type="checkbox"
      checked={marcado}
      onChange={aoMudar}
      disabled={desabilitado}
      aria-label={`Selecionar ${rotulo}`}
      className="h-4 w-4 cursor-pointer rounded accent-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-40"
    />
  )
}

function BotaoDePagina({
  rotulo,
  desabilitado,
  aoClicar,
  children,
}: {
  rotulo: string
  desabilitado: boolean
  aoClicar: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={aoClicar}
      disabled={desabilitado}
      aria-label={rotulo}
      className="grid h-8 w-8 place-items-center rounded-full text-lg leading-none text-ink-2 transition-colors hover:bg-sunk hover:text-ink disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  )
}

function EsqueletoDaTabela() {
  return (
    <div aria-label="Carregando histórico" className="flex flex-col gap-px overflow-hidden rounded-[12px] border border-line bg-line-soft">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="flex items-center gap-3 bg-surface px-4 py-4">
          <span className="h-9 w-9 animate-pulse rounded-full bg-sunk" />
          <span className="h-3 w-48 animate-pulse rounded bg-sunk" />
          <span className="ml-auto h-6 w-24 animate-pulse rounded-full bg-sunk" />
        </div>
      ))}
    </div>
  )
}

// ── Ícones ────────────────────────────────────────────────────────────────

function IconeLupa() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-muted"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
    >
      <circle cx="7" cy="7" r="4.6" />
      <path d="M10.4 10.4l3.3 3.3" />
    </svg>
  )
}

function IconeAtualizar({ girando }: { girando: boolean }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      className={clsx('h-4 w-4', girando && 'animate-spin')}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M13.2 6.2A5.4 5.4 0 0 0 3.3 5.1M2.8 9.8a5.4 5.4 0 0 0 9.9 1.1" />
      <path d="M3 2.4v2.9h2.9M13 13.6v-2.9h-2.9" />
    </svg>
  )
}

function IconeSeta({ paraCima }: { paraCima: boolean }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      className={clsx('h-4 w-4 transition-transform', paraCima && 'rotate-180')}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M8 2.8v10.4M3.8 9l4.2 4.2L12.2 9" />
    </svg>
  )
}

function IconeX() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
      <circle cx="8" cy="8" r="6.2" />
      <path d="M5.9 5.9l4.2 4.2M10.1 5.9l-4.2 4.2" />
    </svg>
  )
}

function IconeMensagem() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      className="h-4 w-4 shrink-0 text-accent"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    >
      <path d="M2.5 3.5h11v7.2H7.2L4.4 13v-2.3H2.5z" />
      <path d="M5.3 6.4h5.4M5.3 8.4h3.4" strokeLinecap="round" />
    </svg>
  )
}

function IconeWhatsApp() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="h-[18px] w-[18px] shrink-0">
      <rect width="16" height="16" rx="4" fill="#25d366" />
      <path
        d="M8 3.4a4.6 4.6 0 0 0-3.96 6.93L3.5 12.5l2.24-.53A4.6 4.6 0 1 0 8 3.4Z"
        fill="none"
        stroke="#fff"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
      <path
        d="M6.3 6.1c.1-.25.25-.3.4-.3h.3c.1 0 .2 0 .3.25l.35.85c.05.12 0 .25-.07.35l-.25.3c.3.55.75 1 1.3 1.3l.3-.25c.1-.08.23-.12.35-.07l.85.35c.25.1.25.2.25.3v.3c0 .15-.05.3-.3.4-.35.15-.95.2-1.8-.3a4.4 4.4 0 0 1-1.7-1.7c-.5-.85-.45-1.45-.3-1.8Z"
        fill="#fff"
      />
    </svg>
  )
}
