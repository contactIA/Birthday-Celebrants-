'use client'

import clsx from 'clsx'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { FichaDoEnvio as Ficha, OutroEnvioDoPaciente } from '@/features/historico/dados'
import type { PassoDaLinhaDoTempo } from '@/features/historico/ficha'
import { formatarTelefoneBR } from '@/shared/telefone/e164'
import { Aviso, Botao } from '@/ui/primitivos'
import { SituacaoDoEnvio } from '@/ui/SituacaoDoEnvio'
import { estadoDoEnvio } from '@/ui/statusDoEnvio'
import { pedacosDaPrevia } from '@/ui/modelos/previa'

// A ficha de um envio: a gaveta que abre ao clicar numa linha do Histórico.
//
// O desenho segue a ficha do card no CRM (gaveta à direita, título grande, as
// ações logo abaixo): a equipe passa de um app para o outro e acha as coisas no
// mesmo lugar. O que ela mostra a mais que a linha da tabela: por que falhou e o
// que fazer, a linha do tempo, a mensagem como saiu, os parabéns de outros anos
// e o caminho para a conversa. A mesma ficha do app de lembretes.

/** Quanto a gaveta leva para sair: o componente só desmonta depois. */
const SAIDA_MS = 220

export function FichaDoEnvio({
  envioId,
  aoFechar,
  aoMudar,
  aoAbrirOutro,
}: {
  /** `null` = fechada. */
  envioId: string | null
  aoFechar: () => void
  /** Algo mudou no envio (cancelado): a tabela recarrega. */
  aoMudar: () => void
  aoAbrirOutro: (id: string) => void
}) {
  // Montada enquanto há um id, e por mais um instante depois, para sair animada.
  const [mostrado, setMostrado] = useState<string | null>(envioId)
  if (envioId && envioId !== mostrado) setMostrado(envioId)
  // A entrada roda um quadro depois de montar, senão não há transição.
  const [entrou, setEntrou] = useState(false)
  const aberta = envioId !== null && entrou

  useEffect(() => {
    if (envioId) {
      const quadro = requestAnimationFrame(() => setEntrou(true))
      return () => cancelAnimationFrame(quadro)
    }
    const t = setTimeout(() => {
      setMostrado(null)
      setEntrou(false)
    }, SAIDA_MS)
    return () => clearTimeout(t)
  }, [envioId])

  useEffect(() => {
    if (!envioId) return
    const aoTeclar = (e: KeyboardEvent) => e.key === 'Escape' && aoFechar()
    window.addEventListener('keydown', aoTeclar)
    // A página atrás não rola junto com a gaveta.
    const antes = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', aoTeclar)
      document.body.style.overflow = antes
    }
  }, [envioId, aoFechar])

  if (!mostrado) return null

  return (
    <div className="fixed inset-0 z-50">
      <div
        aria-hidden
        onClick={aoFechar}
        className={clsx(
          'absolute inset-0 bg-[rgb(16_24_40/0.22)] backdrop-blur-[1.5px] transition-opacity duration-200',
          aberta ? 'opacity-100' : 'opacity-0'
        )}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-da-ficha"
        className={clsx(
          'absolute inset-y-0 right-0 flex w-full flex-col bg-surface shadow-[-24px_0_48px_-16px_rgb(16_24_40/0.22)] sm:max-w-[540px]',
          'transition-transform duration-300 ease-[cubic-bezier(0.2,0.7,0.2,1)]',
          aberta ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        <ConteudoDaFicha key={mostrado} envioId={mostrado} aoFechar={aoFechar} aoMudar={aoMudar} aoAbrirOutro={aoAbrirOutro} />
      </aside>
    </div>
  )
}

function ConteudoDaFicha({
  envioId,
  aoFechar,
  aoMudar,
  aoAbrirOutro,
}: {
  envioId: string
  aoFechar: () => void
  aoMudar: () => void
  aoAbrirOutro: (id: string) => void
}) {
  const [ficha, setFicha] = useState<Ficha | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [tentativa, setTentativa] = useState(0)
  const fechar = useRef<HTMLButtonElement>(null)

  useEffect(() => fechar.current?.focus(), [])

  useEffect(() => {
    const abortar = new AbortController()
    async function buscar() {
      setErro(null)
      try {
        const resposta = await fetch(`/api/historico/${envioId}`, { signal: abortar.signal })
        const corpo = await resposta.json()
        if (!resposta.ok) throw new Error(corpo?.error ?? 'Não foi possível abrir este envio')
        setFicha(corpo as Ficha)
      } catch (e) {
        if (!abortar.signal.aborted) setErro((e as Error).message)
      }
    }
    void buscar()
    return () => abortar.abort()
  }, [envioId, tentativa])

  const recarregar = useCallback(() => setTentativa((n) => n + 1), [])

  return (
    <>
      <header className="flex flex-col gap-4 border-b border-line-soft px-6 pt-5 pb-5 sm:px-7">
        <div className="flex items-center justify-between gap-3">
          <p className="flex min-w-0 flex-wrap items-center gap-2 font-mono text-[11.5px] tracking-[0.08em] text-muted uppercase">
            <span>Parabéns de aniversário</span>
            {ficha && (
              <>
                <span className="text-line-strong">/</span>
                <span className="flex items-center gap-1.5">
                  <span aria-hidden className={clsx('h-[7px] w-[7px] rounded-full', PONTO_DO_TOM[estadoDoEnvio(ficha.status).tom])} />
                  {estadoDoEnvio(ficha.status).rotulo}
                </span>
              </>
            )}
          </p>
          <button
            ref={fechar}
            type="button"
            onClick={aoFechar}
            className="grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-lg text-muted transition-colors hover:bg-sunk hover:text-ink"
          >
            <IconeX />
            <span className="sr-only">Fechar</span>
          </button>
        </div>

        {ficha ? (
          <Cabecalho ficha={ficha} aoMudar={() => (recarregar(), aoMudar())} />
        ) : erro ? null : (
          <div className="flex flex-col gap-2.5" aria-label="Carregando">
            <span className="h-7 w-2/3 animate-pulse rounded-md bg-sunk" />
            <span className="h-4 w-1/2 animate-pulse rounded bg-sunk" />
          </div>
        )}
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-7 overflow-y-auto px-6 py-6 sm:px-7">
        {erro && (
          <Aviso tom="erro" acao={{ rotulo: 'Tentar de novo', aoClicar: recarregar }}>
            {erro}
          </Aviso>
        )}
        {ficha && <Corpo ficha={ficha} aoAbrirOutro={aoAbrirOutro} />}
      </div>
    </>
  )
}

const PONTO_DO_TOM: Record<string, string> = {
  ok: 'bg-ok',
  atencao: 'bg-atencao',
  parado: 'bg-parado',
  erro: 'bg-erro',
  neutro: 'bg-muted-2',
  info: 'bg-info',
}

// ── Cabeçalho: quem, quando, e as ações ────────────────────────────────────

function Cabecalho({ ficha, aoMudar }: { ficha: Ficha; aoMudar: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <h2 id="titulo-da-ficha" className="text-[24px] leading-tight font-semibold tracking-[-0.025em] text-ink">
          {ficha.pacienteNome}
        </h2>
        <p className="tnum flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-2">
          <span>{formatarTelefoneBR(ficha.pacienteTelefone)}</span>
          {ficha.dataNascimento && (
            <>
              <span aria-hidden className="text-line-strong">·</span>
              <span>{aniversario(ficha.dataNascimento, ficha.ano)}</span>
            </>
          )}
        </p>
      </div>
      <Acoes ficha={ficha} aoMudar={aoMudar} />
    </div>
  )
}

function Acoes({ ficha, aoMudar }: { ficha: Ficha; aoMudar: () => void }) {
  const [abrindo, setAbrindo] = useState(false)
  const [confirmando, setConfirmando] = useState(false)
  const [cancelando, setCancelando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  async function abrirConversa() {
    const origem = origemDaPlataforma()
    if (!origem) {
      setErro('Abra o app pela plataforma de mensagens para ir à conversa.')
      return
    }
    // A guia nova abre já no clique, vazia: depois da espera pelo id, o
    // navegador trataria a abertura como pop-up e bloquearia.
    const guia = window.open('', '_blank')
    if (guia) guia.opener = null
    setAbrindo(true)
    setErro(null)
    try {
      const resposta = await fetch(`/api/historico/${ficha.id}/conversa`)
      const corpo = await resposta.json()
      if (!resposta.ok) throw new Error(corpo?.error ?? 'Não foi possível achar a conversa')
      const destino = `${origem}/chat2/sessions/${encodeURIComponent(corpo.conversaId)}`
      if (guia) guia.location.href = destino
      else window.open(destino, '_blank', 'noopener')
    } catch (e) {
      guia?.close()
      setErro((e as Error).message)
    } finally {
      setAbrindo(false)
    }
  }

  async function cancelar() {
    setCancelando(true)
    setErro(null)
    try {
      const resposta = await fetch(`/api/agendamentos/${ficha.id}/cancelar`, { method: 'POST' })
      const corpo = await resposta.json().catch(() => null)
      if (!resposta.ok) throw new Error(corpo?.error ?? 'Não foi possível cancelar')
      if (corpo?.aviso) setAviso(`${corpo.aviso}.`)
      setConfirmando(false)
      aoMudar()
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setCancelando(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Botao onClick={abrirConversa} disabled={abrindo}>
          <IconeConversa />
          {abrindo ? 'Abrindo…' : 'Abrir conversa'}
        </Botao>
        {ficha.podeCancelar &&
          (confirmando ? (
            <div className="flex items-center gap-2 rounded-full border border-atencao/30 bg-atencao-soft py-1 pr-1 pl-3.5">
              <span className="text-sm text-atencao">Cancelar esta mensagem?</span>
              <Botao tamanho="sm" onClick={cancelar} disabled={cancelando}>
                {cancelando ? 'Cancelando…' : 'Sim, cancelar'}
              </Botao>
              <Botao variante="secundario" tamanho="sm" onClick={() => setConfirmando(false)} disabled={cancelando}>
                Não
              </Botao>
            </div>
          ) : (
            <Botao variante="secundario" onClick={() => setConfirmando(true)}>
              Cancelar mensagem
            </Botao>
          ))}
      </div>
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      {aviso && <Aviso tom="atencao">{aviso}</Aviso>}
    </div>
  )
}

/**
 * A origem da plataforma que abriu o app no iframe: a clínica pode usar outro
 * endereço (white label), então ele não é fixo. Fora do iframe, `null`.
 */
function origemDaPlataforma(): string | null {
  const ancestral = window.location.ancestorOrigins?.[0]
  if (ancestral) return ancestral
  if (window.top !== window && document.referrer) {
    try {
      return new URL(document.referrer).origin
    } catch {
      return null
    }
  }
  return null
}

// ── Corpo ──────────────────────────────────────────────────────────────────

function Corpo({ ficha, aoAbrirOutro }: { ficha: Ficha; aoAbrirOutro: (id: string) => void }) {
  return (
    <>
      {ficha.status === 'failed' && <PorQueFalhou ficha={ficha} />}

      <Secao titulo="Linha do tempo">
        <LinhaDoTempo passos={ficha.linhaDoTempo} />
      </Secao>

      <Secao titulo="Mensagem">
        <Mensagem ficha={ficha} />
      </Secao>

      <Secao titulo="Detalhes">
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm">
          <Detalhe rotulo="Modelo">{ficha.modeloNome ?? <span className="text-muted italic">Modelo removido</span>}</Detalhe>
          <Detalhe rotulo="Canal">
            <span className="tnum">WhatsApp · {ficha.remetente ? formatarTelefoneBR(ficha.remetente) : 'Número da conta'}</span>
          </Detalhe>
          <Detalhe rotulo="Agendado em">
            <span className="tnum">{formatarDataHora(ficha.criadoEm)}</span>
          </Detalhe>
        </dl>
      </Secao>

      {ficha.outros.length > 0 && (
        <Secao titulo="Parabéns de outros anos">
          <ul className="flex flex-col divide-y divide-line-soft overflow-hidden rounded-[12px] border border-line-soft">
            {ficha.outros.map((o) => (
              <OutroEnvio key={o.id} outro={o} aoAbrir={() => aoAbrirOutro(o.id)} />
            ))}
          </ul>
        </Secao>
      )}
    </>
  )
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-[13px] font-semibold tracking-[-0.005em] text-ink">{titulo}</h3>
      {children}
    </section>
  )
}

function Detalhe({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-muted">{rotulo}</dt>
      <dd className="min-w-0 text-ink">{children}</dd>
    </>
  )
}

function PorQueFalhou({ ficha }: { ficha: Ficha }) {
  return (
    <div className="flex flex-col gap-3 rounded-[12px] border border-erro/25 bg-erro-soft px-4 py-3.5">
      <div className="flex flex-col gap-1">
        <p className="text-[13px] font-semibold text-erro">Por que não foi enviado</p>
        <p className="text-sm leading-relaxed text-ink">
          {ficha.motivoDaFalha ?? (
            <span className="text-ink-2">
              A plataforma de mensagens não informou o motivo desta falha. As falhas de antes de 21/10/2026 ficaram sem ele.
            </span>
          )}
        </p>
      </div>
      {ficha.oQueFazer && (
        <div className="flex flex-col gap-1 border-t border-erro/15 pt-3">
          <p className="text-[13px] font-semibold text-ink">O que fazer</p>
          <p className="text-sm leading-relaxed text-ink-2">{ficha.oQueFazer}</p>
        </div>
      )}
    </div>
  )
}

const ESTILO_DO_PASSO: Record<PassoDaLinhaDoTempo['estado'], { ponto: string; texto: string }> = {
  feito: { ponto: 'border-ok bg-ok', texto: 'text-ink' },
  pendente: { ponto: 'border-line-strong bg-surface', texto: 'text-muted' },
  falhou: { ponto: 'border-erro bg-erro', texto: 'text-erro' },
  cancelado: { ponto: 'border-parado bg-parado', texto: 'text-ink-2' },
}

function LinhaDoTempo({ passos }: { passos: PassoDaLinhaDoTempo[] }) {
  return (
    <ol className="flex flex-col">
      {passos.map((p, i) => {
        const estilo = ESTILO_DO_PASSO[p.estado]
        const ultimo = i === passos.length - 1
        return (
          <li key={p.chave} className="relative flex gap-3 pb-4 last:pb-0">
            {!ultimo && (
              <span
                aria-hidden
                className={clsx(
                  'absolute top-4 bottom-0 left-[5px] w-px',
                  passos[i + 1]!.estado === 'feito' ? 'bg-ok/40' : 'bg-line'
                )}
              />
            )}
            <span aria-hidden className={clsx('relative mt-1 h-[11px] w-[11px] shrink-0 rounded-full border-2', estilo.ponto)} />
            <div className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
              <span className={clsx('text-sm font-medium', estilo.texto)}>
                {p.rotulo}
                {p.detalhe && p.estado !== 'pendente' && (
                  <span className="mt-0.5 block text-[13px] font-normal text-muted">{p.detalhe}</span>
                )}
              </span>
              <span className="tnum text-[13px] text-muted">
                {p.quando ? `${p.detalhe && p.estado === 'pendente' ? `${p.detalhe}: ` : ''}${formatarDataHora(p.quando)}` : p.estado === 'feito' ? 'Sem horário' : ''}
              </span>
            </div>
          </li>
        )
      })}
    </ol>
  )
}

function Mensagem({ ficha }: { ficha: Ficha }) {
  if (!ficha.texto) {
    return (
      <p className="rounded-[12px] bg-sunk px-4 py-3 text-sm leading-relaxed text-ink-2">
        A mensagem deste envio não foi guardada: ele é de antes de 21/10/2026, quando o app passou a guardar o texto.
        {ficha.modeloNome && <> O modelo usado foi <span className="font-medium text-ink">{ficha.modeloNome}</span>.</>}
      </p>
    )
  }
  const pedacos = pedacosDaPrevia([{ texto: ficha.texto }])
  const horario = ficha.agendadoPara
    ? new Date(ficha.agendadoPara).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : ''
  return (
    <div className="flex flex-col gap-2.5 rounded-[12px] bg-[#efeae2] px-3 py-4 sm:px-4">
      <div className="max-w-[94%] self-start rounded-[10px] rounded-tl-[3px] bg-white px-2.5 pt-1.5 pb-1 text-[13.5px] leading-[1.45] text-[#111b21] shadow-[0_1px_0.5px_rgb(11_20_26/0.13)]">
        {ficha.arquivoNome && (
          <div className="mb-1.5 -mx-1 flex h-11 items-center gap-2 rounded-[7px] bg-sunk-2 px-3 text-xs text-ink-2">
            <IconeClipe />
            <span className="truncate">{ficha.arquivoNome}</span>
          </div>
        )}
        <p className="break-words whitespace-pre-wrap">
          {pedacos.map((p, i) => (
            <span
              key={i}
              className={clsx(p.negrito && 'font-semibold', p.italico && 'italic', p.riscado && 'line-through')}
            >
              {p.texto}
            </span>
          ))}
          <span className="tnum float-right mt-1.5 ml-3 text-[10.5px] leading-none text-[#667781]">{horario}</span>
        </p>
      </div>
    </div>
  )
}

function OutroEnvio({ outro, aoAbrir }: { outro: OutroEnvioDoPaciente; aoAbrir: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={aoAbrir}
        className="flex w-full cursor-pointer items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-sunk/60"
      >
        <span className="flex min-w-0 flex-col">
          <span className="tnum text-sm font-medium text-ink">{outro.ano}</span>
          <span className="tnum text-[13px] text-muted">
            {outro.agendadoPara ? `Envio: ${formatarDataHora(outro.agendadoPara)}` : 'Sem data de envio'}
          </span>
        </span>
        <SituacaoDoEnvio status={outro.status} />
      </button>
    </li>
  )
}

/** "Aniversário 20/10 · 35 anos": a idade que faz neste aniversário. */
function aniversario(dataNascimento: string, ano: number): string {
  const [nascimento, mes, dia] = dataNascimento.split('-')
  if (!mes || !dia) return ''
  const idade = ano - Number(nascimento)
  return `Aniversário ${dia}/${mes}${idade > 0 && idade < 130 ? ` · ${idade} anos` : ''}`
}

function formatarDataHora(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

// ── Ícones ────────────────────────────────────────────────────────────────

function IconeX() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  )
}

function IconeConversa() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
      <path d="M2.5 3.5h11v7.2H7.2L4.4 13v-2.3H2.5z" />
    </svg>
  )
}

function IconeClipe() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.5 4.5L5.6 9.4a1.6 1.6 0 0 0 2.3 2.3l5-5a3 3 0 0 0-4.3-4.3L3.7 7.3a4.4 4.4 0 0 0 6.2 6.2l3.6-3.6" />
    </svg>
  )
}
