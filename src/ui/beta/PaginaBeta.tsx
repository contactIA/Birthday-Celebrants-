'use client'

import { Bricolage_Grotesque } from 'next/font/google'
import clsx from 'clsx'
import { useEffect, useRef, useState } from 'react'
import { LIMITES, type SistemaDoPedido } from '@/features/entrar-na-lista/regras'
import { formatarTelefoneBR } from '@/shared/telefone/e164'
import { situacaoDaTurma, type EtapaDaFila, type SituacaoDaTurma } from '@/features/entrar-na-lista/fila'
import { EtapasDaFila } from './Fila'
import { Presente3D } from './Presente3D'
import { PreviaNoCelular } from './PreviaNoCelular'

// A página que aparece para quem abre a aba sem ter a clínica cadastrada — no
// lugar do antigo "painel ainda não liberado", que era uma tela sem saída.
// Aqui ela vira pedido de vaga no beta, que cai na área de setup da equipe.
//
// A conta da plataforma já vem no acesso (a aba informa): o formulário não pede
// nada técnico, só o que uma pessoa da recepção sabe responder.

// Só nos títulos desta página. Hospedada pelo próprio app (next/font): o
// navegador não faz requisição ao Google de dentro do iframe.
const titulo = Bricolage_Grotesque({ subsets: ['latin'], variable: '--fonte-titulo', display: 'swap' })

const SUGESTAO =
  'Olá, {{nome}}! 🎉 Hoje é um dia especial e toda a equipe da {{clinica}} deseja um feliz aniversário, cheio de sorrisos. Um abraço!'

const SISTEMAS: { valor: SistemaDoPedido; rotulo: string }[] = [
  { valor: 'clinicorp', rotulo: 'Clinicorp' },
  { valor: 'eclinica', rotulo: 'e-Clínica' },
  { valor: 'outro', rotulo: 'Outro' },
]

const PASSOS = [
  {
    titulo: 'Abra a lista do mês',
    texto: 'Os aniversariantes chegam do seu Clinicorp ou e-Clínica, organizados por dia.',
  },
  {
    titulo: 'Escolha quem recebe',
    texto: 'Marque um paciente, o dia inteiro ou todos de uma vez.',
  },
  {
    titulo: 'O parabéns sai no dia',
    texto: 'No horário que você escolher, com o nome de cada paciente na mensagem.',
  },
]

interface Pedido {
  nomeClinica: string
  telefone: string
  sistemaProntuario: SistemaDoPedido
  sistemaOutro: string | null
  modeloMensagem: string
  pedidoEm: string
}

export interface Fila {
  etapa: EtapaDaFila
  posicao: number | null
  naFrente: number
}

type Etapa =
  | { tipo: 'carregando' }
  | { tipo: 'formulario' }
  | { tipo: 'na-lista'; pedido: Pedido; fila: Fila | null; agora: boolean }

/** Na prévia não há fila de verdade: mostra o formato com números de exemplo. */
const FILA_DE_EXEMPLO: Fila = { etapa: 'recebido', posicao: 3, naFrente: 2 }
const POSICAO_DE_EXEMPLO = 3

/**
 * `previa`: a página como uma clínica sem cadastro a vê, aberta pela área de
 * setup para a equipe conferir ou mostrar. Não consulta nem grava pedido — o
 * envio só simula o sucesso, com o presente abrindo.
 */
export function PaginaBeta({ previa = false }: { previa?: boolean } = {}) {
  const [etapa, setEtapa] = useState<Etapa>(previa ? { tipo: 'formulario' } : { tipo: 'carregando' })
  const [nomeClinica, setNomeClinica] = useState('')
  const [telefone, setTelefone] = useState('')
  const [sistema, setSistema] = useState<SistemaDoPedido | null>(null)
  const [sistemaOutro, setSistemaOutro] = useState('')
  const [modelo, setModelo] = useState('')
  const [consentimento, setConsentimento] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [turma, setTurma] = useState<SituacaoDaTurma>(() => situacaoDaTurma(0))
  const [posicaoAoEntrar, setPosicaoAoEntrar] = useState<number | null>(previa ? POSICAO_DE_EXEMPLO : null)
  const campoModelo = useRef<HTMLTextAreaElement>(null)
  const secaoFormulario = useRef<HTMLElement>(null)

  // Já pediu antes? Abre direto no "você está na lista".
  useEffect(() => {
    if (previa) return
    fetch('/api/interesse')
      .then((r) => r.json())
      .then((corpo) => {
        if (corpo?.turma) setTurma(corpo.turma)
        if (typeof corpo?.posicaoAoEntrar === 'number') setPosicaoAoEntrar(corpo.posicaoAoEntrar)
        setEtapa(corpo?.pedido ? { tipo: 'na-lista', pedido: corpo.pedido, fila: corpo.fila, agora: false } : { tipo: 'formulario' })
      })
      .catch(() => setEtapa({ tipo: 'formulario' }))
  }, [previa])

  function irParaFormulario() {
    secaoFormulario.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  /** Insere `{{nome}}` ou `{{clinica}}` onde está o cursor. */
  function inserir(marcador: string) {
    const campo = campoModelo.current
    const inicio = campo?.selectionStart ?? modelo.length
    const fim = campo?.selectionEnd ?? modelo.length
    const novo = modelo.slice(0, inicio) + marcador + modelo.slice(fim)
    setModelo(novo.slice(0, LIMITES.modelo))
    requestAnimationFrame(() => {
      campo?.focus()
      campo?.setSelectionRange(inicio + marcador.length, inicio + marcador.length)
    })
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setEnviando(true)
    setErro(null)
    if (previa) {
      setEtapa({
        tipo: 'na-lista',
        pedido: {
          nomeClinica,
          telefone,
          sistemaProntuario: sistema!,
          sistemaOutro: sistema === 'outro' ? sistemaOutro.trim() : null,
          modeloMensagem: modelo,
          pedidoEm: new Date().toISOString(),
        },
        fila: FILA_DE_EXEMPLO,
        agora: true,
      })
      window.scrollTo({ top: 0, behavior: 'smooth' })
      setEnviando(false)
      return
    }
    try {
      const resposta = await fetch('/api/interesse', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          nomeClinica,
          telefone,
          sistemaProntuario: sistema,
          sistemaOutro: sistema === 'outro' ? sistemaOutro : undefined,
          modeloMensagem: modelo,
          consentimento,
        }),
      })
      const corpo = await resposta.json().catch(() => null)
      if (!resposta.ok) throw new Error(corpo?.error ?? 'Não foi possível enviar o pedido. Tente de novo.')
      if (corpo.turma) setTurma(corpo.turma)
      setEtapa({ tipo: 'na-lista', pedido: corpo.pedido, fila: corpo.fila, agora: true })
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {
      setErro((err as Error).message)
    }
    setEnviando(false)
  }

  function alterarPedido(p: Pedido) {
    setNomeClinica(p.nomeClinica)
    setTelefone(formatarTelefoneBR(p.telefone))
    setSistema(p.sistemaProntuario)
    setSistemaOutro(p.sistemaOutro ?? '')
    setModelo(p.modeloMensagem)
    setConsentimento(false)
    setEtapa({ tipo: 'formulario' })
    requestAnimationFrame(irParaFormulario)
  }

  const naLista = etapa.tipo === 'na-lista'

  return (
    <div className={clsx(titulo.variable, 'min-h-screen overflow-x-hidden bg-ground')}>
      {previa && (
        <p className="bg-ink px-6 py-2 text-center text-[13px] text-white">
          Prévia: é assim que uma clínica sem cadastro vê a aba do app. Nada do que for enviado aqui é gravado.
        </p>
      )}
      {/* ── Topo ─────────────────────────────────────────────────────── */}
      <section className="relative isolate px-6 pt-10 pb-14 sm:pt-14">
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-[radial-gradient(60%_50%_at_85%_20%,var(--color-accent-soft),transparent_70%),radial-gradient(40%_40%_at_10%_90%,var(--color-vela-soft),transparent_70%)]"
        />
        <Brilhos />

        <div className="mx-auto grid max-w-5xl items-center gap-8 lg:grid-cols-[1.15fr_0.85fr]">
          <div>
            <p
              className="beta-surge inline-flex items-center gap-2 rounded-full border border-vela/40 bg-vela-soft px-3 py-1 text-[12px] font-semibold tracking-wide text-vela-ink uppercase"
              style={{ '--atraso': '0ms' } as React.CSSProperties}
            >
              <span aria-hidden>✦</span> Beta exclusivo · vagas limitadas
            </p>

            {naLista ? (
              <>
                <h1
                  className="beta-surge mt-5 font-titulo text-[clamp(2rem,6vw,3.4rem)] leading-[1.02] font-extrabold tracking-[-0.03em] text-ink"
                  style={{ '--atraso': '80ms' } as React.CSSProperties}
                >
                  {etapa.agora ? 'Pedido recebido!' : 'Sua clínica está na lista.'}
                </h1>
                <p className="beta-surge mt-4 max-w-md text-[15px] leading-relaxed text-ink-2" style={{ '--atraso': '160ms' } as React.CSSProperties}>
                  {/* "Entrou na lista", não "vaga reservada": é pedido, e a liberação
                      depende da equipe — prometer vaga seria mentir. */}
                  A <strong className="font-semibold text-ink">{etapa.pedido.nomeClinica}</strong> entrou na lista do beta.{' '}
                  Vamos falar com você pelo{' '}
                  <strong className="font-semibold whitespace-nowrap text-ink">{formatarTelefoneBR(etapa.pedido.telefone)}</strong>{' '}
                  assim que a vaga for liberada.
                </p>
                {etapa.fila && (
                  <div className="beta-surge mt-7 max-w-md" style={{ '--atraso': '220ms' } as React.CSSProperties}>
                    <EtapasDaFila fila={etapa.fila} turma={turma} />
                  </div>
                )}
                <button
                  onClick={() => alterarPedido(etapa.pedido)}
                  className="beta-surge mt-6 text-sm font-medium text-accent-ink underline decoration-accent/30 underline-offset-4 hover:decoration-accent"
                  style={{ '--atraso': '240ms' } as React.CSSProperties}
                >
                  Alterar os dados do pedido
                </button>
              </>
            ) : (
              <>
                <h1
                  className="beta-surge mt-5 font-titulo text-[clamp(2rem,6vw,3.4rem)] leading-[1.02] font-extrabold tracking-[-0.03em] text-ink"
                  style={{ '--atraso': '80ms' } as React.CSSProperties}
                >
                  Nenhum aniversariante da sua clínica fica sem{' '}
                  <span className="relative whitespace-nowrap text-accent">
                    parabéns
                    <svg aria-hidden viewBox="0 0 200 12" className="absolute -bottom-1 left-0 h-3 w-full" preserveAspectRatio="none">
                      <path d="M2 8 Q 50 2 100 7 T 198 5" fill="none" stroke="var(--color-vela)" strokeWidth="4" strokeLinecap="round" />
                    </svg>
                  </span>
                  .
                </h1>
                <p className="beta-surge mt-5 max-w-md text-[15px] leading-relaxed text-ink-2" style={{ '--atraso': '160ms' } as React.CSSProperties}>
                  Um novo app da plataforma traz do seu prontuário quem faz aniversário no mês e agenda o parabéns pelo
                  WhatsApp da clínica, com o nome de cada paciente. A primeira turma do beta é pequena, e as vagas
                  são liberadas por ordem de pedido.
                </p>
                <button
                  onClick={irParaFormulario}
                  disabled={etapa.tipo === 'carregando'}
                  className="beta-surge mt-7 inline-flex h-12 items-center gap-2 rounded-full bg-accent px-6 text-[15px] font-semibold text-white shadow-[0_12px_30px_-12px_var(--color-accent)] transition hover:-translate-y-0.5 hover:bg-accent-ink"
                  style={{ '--atraso': '240ms' } as React.CSSProperties}
                >
                  Quero participar do beta <span aria-hidden>→</span>
                </button>
                <div className="beta-surge mt-7 max-w-md" style={{ '--atraso': '320ms' } as React.CSSProperties}>
                  <EtapasDaFila fila={null} posicaoAoEntrar={posicaoAoEntrar} turma={turma} />
                </div>
              </>
            )}
          </div>

          {/* Espaço acima em tela estreita: aberto, a tampa salta para cima e
              cobriria o texto que fica logo antes do presente. */}
          <div className={clsx('flex justify-center', naLista && etapa.agora && 'pt-16')}>
            <Presente3D aberto={naLista && etapa.agora} className="scale-90 sm:scale-100 lg:scale-125" />
          </div>
        </div>
      </section>

      {/* ── Como funciona ────────────────────────────────────────────── */}
      <section aria-labelledby="como-funciona" className="border-y border-line bg-surface px-6 py-12">
        <div className="mx-auto max-w-5xl">
          <h2 id="como-funciona" className="font-titulo text-xl font-bold tracking-[-0.02em] text-ink">
            Como vai funcionar
          </h2>
          <ol className="mt-6 grid gap-4 sm:grid-cols-3">
            {PASSOS.map((passo, i) => (
              <li key={passo.titulo} className="rounded-[16px] border border-line-soft bg-ground/60 p-5">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-accent-soft font-titulo text-sm font-bold text-accent-ink">
                  {i + 1}
                </span>
                <h3 className="mt-3 text-[15px] font-semibold text-ink">{passo.titulo}</h3>
                <p className="mt-1 text-sm leading-relaxed text-ink-2">{passo.texto}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── Formulário + prévia ─────────────────────────────────────── */}
      {!naLista && (
        <section ref={secaoFormulario} aria-labelledby="garanta-a-vaga" className="scroll-mt-4 px-6 py-12">
          <div className="mx-auto max-w-5xl">
            <h2 id="garanta-a-vaga" className="font-titulo text-[clamp(1.5rem,4vw,2.1rem)] font-extrabold tracking-[-0.025em] text-ink">
              Garanta a vaga da sua clínica
            </h2>
            <p className="mt-2 max-w-lg text-sm leading-relaxed text-ink-2">
              Escreva como seria o parabéns da sua clínica. A mensagem aparece no celular ao lado enquanto você digita.
            </p>

            <form
              onSubmit={enviar}
              className="mt-8 grid gap-6 [grid-template-areas:'dados'_'mensagem'_'previa'_'enviar'] lg:grid-cols-[1fr_320px] lg:gap-x-12 lg:[grid-template-areas:'dados_previa'_'mensagem_previa'_'enviar_previa']"
            >
              <fieldset className="grid gap-4 [grid-area:dados] sm:grid-cols-2">
                <legend className="sr-only">Dados da clínica</legend>
                <Campo rotulo="Nome da clínica">
                  <input
                    required
                    maxLength={LIMITES.nome}
                    value={nomeClinica}
                    onChange={(e) => setNomeClinica(e.target.value)}
                    placeholder="Clínica Sorriso"
                    className={ESTILO_CAMPO}
                  />
                </Campo>
                <Campo rotulo="Telefone para contato">
                  <input
                    required
                    inputMode="tel"
                    autoComplete="tel"
                    value={telefone}
                    onChange={(e) => setTelefone(e.target.value)}
                    placeholder="(62) 98187-8291"
                    className={ESTILO_CAMPO}
                  />
                </Campo>
                <div className="sm:col-span-2">
                  <p id="sistema-rotulo" className="text-[13px] font-medium text-ink-2">
                    Sistema de prontuário
                  </p>
                  <div role="radiogroup" aria-labelledby="sistema-rotulo" className="mt-1.5 flex flex-wrap gap-2">
                    {SISTEMAS.map((s) => (
                      <button
                        key={s.valor}
                        type="button"
                        role="radio"
                        aria-checked={sistema === s.valor}
                        onClick={() => setSistema(s.valor)}
                        className={clsx(
                          'h-10 rounded-full border px-4 text-sm font-medium transition-colors',
                          sistema === s.valor
                            ? 'border-accent bg-accent text-white'
                            : 'border-line bg-surface text-ink-2 hover:border-accent/40 hover:text-ink'
                        )}
                      >
                        {s.rotulo}
                      </button>
                    ))}
                  </div>
                  {sistema === 'outro' && (
                    <label className="mt-3 flex flex-col gap-1.5">
                      <span className="text-[13px] font-medium text-ink-2">Qual sistema a clínica usa?</span>
                      <input
                        required
                        autoFocus
                        maxLength={LIMITES.sistemaOutro}
                        value={sistemaOutro}
                        onChange={(e) => setSistemaOutro(e.target.value)}
                        placeholder="Nome do sistema de prontuário"
                        className={clsx(ESTILO_CAMPO, 'max-w-sm')}
                      />
                    </label>
                  )}
                  {sistema === 'outro' && (
                    <p className="mt-2 rounded-lg bg-vela-soft px-3 py-2 text-[13px] leading-relaxed text-vela-ink">
                      Nesta primeira fase o app funciona com Clinicorp e e-Clínica. Deixe o pedido mesmo assim: vamos
                      avisar quando chegar ao seu sistema.
                    </p>
                  )}
                </div>
              </fieldset>

              <div className="[grid-area:mensagem]">
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <label htmlFor="modelo" className="text-[13px] font-medium text-ink-2">
                    Mensagem de aniversário
                  </label>
                  {!modelo && (
                    <button type="button" onClick={() => setModelo(SUGESTAO)} className="text-[13px] font-medium text-accent-ink hover:underline">
                      Usar uma sugestão
                    </button>
                  )}
                </div>
                <textarea
                  id="modelo"
                  ref={campoModelo}
                  required
                  rows={5}
                  maxLength={LIMITES.modelo}
                  value={modelo}
                  onChange={(e) => setModelo(e.target.value)}
                  placeholder="Olá, {{nome}}! A equipe da {{clinica}} deseja um feliz aniversário…"
                  className={clsx(ESTILO_CAMPO, 'mt-1.5 h-auto resize-y py-3 leading-relaxed')}
                />
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-muted">
                  <span>Inserir:</span>
                  <button type="button" onClick={() => inserir('{{nome}}')} className={ESTILO_FICHA}>
                    + nome do paciente
                  </button>
                  <button type="button" onClick={() => inserir('{{clinica}}')} className={ESTILO_FICHA}>
                    + nome da clínica
                  </button>
                  <span className="ml-auto tnum">
                    {modelo.length}/{LIMITES.modelo}
                  </span>
                </div>
              </div>

              <div className="[grid-area:previa] lg:sticky lg:top-6 lg:self-start">
                <PreviaNoCelular nomeClinica={nomeClinica} modelo={modelo} />
              </div>

              <div className="[grid-area:enviar]">
                <label className="flex items-start gap-3 text-[13px] leading-relaxed text-ink-2">
                  <input
                    type="checkbox"
                    required
                    checked={consentimento}
                    onChange={(e) => setConsentimento(e.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-accent)]"
                  />
                  Autorizo a equipe a entrar em contato por este telefone sobre o beta do app de aniversariantes.
                </label>

                {erro && (
                  <p role="alert" className="mt-3 text-sm text-erro">
                    {erro}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={enviando || !sistema}
                  className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-accent px-6 text-[15px] font-semibold text-white shadow-[0_12px_30px_-12px_var(--color-accent)] transition hover:bg-accent-ink disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none sm:w-auto"
                >
                  {enviando ? 'Enviando…' : 'Quero minha vaga no beta'}
                </button>
                {!sistema ? (
                  <p className="mt-2 text-[12px] text-muted">Escolha o sistema de prontuário para enviar.</p>
                ) : (
                  <p className="mt-2 text-[12px] text-muted">Os pedidos são atendidos por ordem de chegada.</p>
                )}
              </div>
            </form>
          </div>
        </section>
      )}

      {/* ── Resumo do pedido (na lista) ─────────────────────────────── */}
      {naLista && (
        <section className="px-6 py-12">
          <div className="mx-auto grid max-w-5xl items-start gap-10 lg:grid-cols-[1fr_320px]">
            <div>
              <h2 className="font-titulo text-xl font-bold tracking-[-0.02em] text-ink">O parabéns que você imaginou</h2>
              <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">
                Guardamos a sua mensagem. Quando o app for liberado, ela vira o primeiro modelo da sua clínica.
              </p>
              <dl className="mt-6 grid max-w-md gap-3 text-sm">
                <Linha rotulo="Clínica" valor={etapa.pedido.nomeClinica} />
                <Linha rotulo="Telefone" valor={formatarTelefoneBR(etapa.pedido.telefone)} />
                <Linha
                  rotulo="Prontuário"
                  valor={
                    etapa.pedido.sistemaProntuario === 'outro'
                      ? (etapa.pedido.sistemaOutro ?? 'Outro')
                      : (SISTEMAS.find((s) => s.valor === etapa.pedido.sistemaProntuario)?.rotulo ?? '')
                  }
                />
              </dl>
            </div>
            <PreviaNoCelular nomeClinica={etapa.pedido.nomeClinica} modelo={etapa.pedido.modeloMensagem} />
          </div>
        </section>
      )}

      <footer className="border-t border-line px-6 py-8 text-center text-[12px] text-muted">
        Funciona com Clinicorp e e-Clínica · Beta com vagas limitadas nesta primeira fase
      </footer>
    </div>
  )
}

const ESTILO_CAMPO =
  'h-11 w-full rounded-xl border border-line bg-surface px-3.5 text-[15px] text-ink placeholder:text-muted/80 focus:border-accent focus:ring-4 focus:ring-accent/10 focus:outline-none'

const ESTILO_FICHA =
  'rounded-full border border-accent/25 bg-accent-soft px-2.5 py-1 font-medium text-accent-ink hover:border-accent/50'

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] font-medium text-ink-2">{rotulo}</span>
      {children}
    </label>
  )
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-line-soft pb-3">
      <dt className="text-muted">{rotulo}</dt>
      <dd className="text-right font-medium text-ink">{valor}</dd>
    </div>
  )
}

/** Brilhos discretos no topo — clima de lançamento sem virar enfeite. */
function Brilhos() {
  const pontos = [
    { top: '14%', left: '6%', atraso: '0ms', tam: 'text-lg' },
    { top: '70%', left: '48%', atraso: '900ms', tam: 'text-sm' },
    { top: '20%', left: '58%', atraso: '1600ms', tam: 'text-xs' },
    { top: '82%', left: '88%', atraso: '400ms', tam: 'text-base' },
  ]
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
      {pontos.map((p, i) => (
        <span
          key={i}
          className={clsx('beta-brilho absolute text-vela', p.tam)}
          style={{ top: p.top, left: p.left, '--atraso': p.atraso } as React.CSSProperties}
        >
          ✦
        </span>
      ))}
    </div>
  )
}
