'use client'

import clsx from 'clsx'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { previaDoModelo } from '@/features/entrar-na-lista/regras'

// O parabéns da clínica chegando no celular do paciente, como uma cena que se
// repete: tela bloqueada às 09:00 com a notificação → a conversa abre → a
// mensagem da clínica → o paciente responde. É o que torna a página concreta:
// a clínica vê o próprio parabéns funcionando antes de ter o app.
//
// Enquanto a pessoa digita no formulário, a cena para na mensagem — é ali que
// ela quer olhar. Volta a rodar alguns segundos depois da última tecla.
//
// Uma conversa genérica de celular, sem marca de aplicativo: a página é white
// label, e a clínica reconhece o formato sem precisarmos nomear ninguém.
//
// Pensada para desktop (o app só roda na plataforma pelo computador): o leve
// giro que acompanha o mouse não existe em tela de toque, e tudo bem.

type Fase = 'bloqueio' | 'digitando' | 'mensagem' | 'resposta'

const DURACAO: Record<Fase, number> = { bloqueio: 2600, digitando: 1500, mensagem: 2600, resposta: 3400 }
/** Depois da última tecla, quanto tempo a cena fica parada na mensagem. */
const PAUSA_AO_EDITAR = 4000

const RESPOSTA = 'Que carinho! Obrigada 🥰'

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return '✦'
  return (partes[0]![0]! + (partes.length > 1 ? partes.at(-1)![0]! : '')).toUpperCase()
}

function assinarMovimentoReduzido(avisar: () => void) {
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
  mq.addEventListener('change', avisar)
  return () => mq.removeEventListener('change', avisar)
}
function useMovimentoReduzido() {
  return useSyncExternalStore(
    assinarMovimentoReduzido,
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    () => false
  )
}

export function PreviaNoCelular({ nomeClinica, modelo }: { nomeClinica: string; modelo: string }) {
  const texto = previaDoModelo(modelo, nomeClinica).trim()
  const nome = nomeClinica.trim() || 'Sua clínica'
  const reduzido = useMovimentoReduzido()

  const [fase, setFase] = useState<Fase>('bloqueio')
  // Cada volta remonta as bolhas para a animação de entrada tocar de novo.
  const [volta, setVolta] = useState(0)
  // Guardado para comparar no render — o padrão do React para "o valor mudou".
  const [modeloVisto, setModeloVisto] = useState(modelo)
  const [edicoes, setEdicoes] = useState(0)
  const [editando, setEditando] = useState(false)

  if (modelo !== modeloVisto) {
    setModeloVisto(modelo)
    setFase('mensagem')
    setEdicoes((n) => n + 1)
    setEditando(true)
  }

  useEffect(() => {
    if (reduzido) return
    // Sem texto ainda, o paciente não tem o que responder: a volta termina na
    // bolha de "digitando".
    const proxima: Fase =
      fase === 'bloqueio' ? 'digitando' : fase === 'digitando' ? 'mensagem' : fase === 'mensagem' && texto ? 'resposta' : 'bloqueio'
    const espera = editando && fase === 'mensagem' ? PAUSA_AO_EDITAR : DURACAO[fase]
    const t = setTimeout(() => {
      setEditando(false)
      if (proxima === 'bloqueio') setVolta((v) => v + 1)
      setFase(proxima)
    }, espera)
    return () => clearTimeout(t)
  }, [fase, edicoes, editando, texto, reduzido])

  // Com movimento reduzido, a cena fica parada no que importa: a mensagem.
  const faseVisivel: Fase = reduzido ? (texto ? 'resposta' : 'mensagem') : fase
  const noChat = faseVisivel !== 'bloqueio'

  // Giro leve acompanhando o mouse — direto no estilo, sem re-render.
  const moldura = useRef<HTMLDivElement>(null)
  function girar(e: React.PointerEvent<HTMLDivElement>) {
    if (reduzido || e.pointerType !== 'mouse' || !moldura.current) return
    const r = e.currentTarget.getBoundingClientRect()
    const x = (e.clientX - r.left) / r.width - 0.5
    const y = (e.clientY - r.top) / r.height - 0.5
    moldura.current.style.setProperty('--gy', `${x * 10}deg`)
    moldura.current.style.setProperty('--gx', `${-y * 8}deg`)
  }
  function soltar() {
    moldura.current?.style.setProperty('--gy', '0deg')
    moldura.current?.style.setProperty('--gx', '0deg')
  }

  return (
    <div onPointerMove={girar} onPointerLeave={soltar} className="mx-auto w-full max-w-[300px] [perspective:1000px]">
      <figure
        ref={moldura}
        aria-label="Prévia da mensagem no celular do paciente"
        className="celular-gira rounded-[36px] bg-ink p-2.5 shadow-[0_30px_60px_-20px_rgb(83_37_196/0.45)]"
      >
        <div className="relative h-[440px] overflow-hidden rounded-[28px]">
          {/* ── Tela bloqueada ─────────────────────────────────────────── */}
          <div
            aria-hidden={noChat}
            className={clsx(
              'absolute inset-0 flex flex-col items-center bg-[radial-gradient(120%_80%_at_20%_0%,var(--color-accent),#1d1440_70%)] px-4 pt-14 text-white transition-opacity duration-500',
              noChat ? 'pointer-events-none opacity-0' : 'opacity-100'
            )}
          >
            <p className="text-[12px] font-medium text-white/70">Hoje é um dia especial</p>
            <p className="tnum mt-1 font-titulo text-[64px] leading-none font-bold tracking-[-0.04em]">09:00</p>
            <div
              key={`notificacao-${volta}`}
              className={clsx(
                'mt-10 w-full rounded-2xl bg-white/85 p-3 text-ink shadow-lg backdrop-blur',
                !reduzido && 'celular-notifica'
              )}
            >
              <div className="flex items-center gap-2">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-accent text-[10px] font-bold text-white">
                  {iniciais(nomeClinica)}
                </span>
                <p className="min-w-0 flex-1 truncate text-[12px] font-semibold">{nome}</p>
                <p className="text-[11px] text-muted">agora</p>
              </div>
              <p className="mt-1.5 line-clamp-2 text-[12px] leading-snug text-ink-2">{texto || 'Nova mensagem'}</p>
            </div>
          </div>

          {/* ── Conversa ───────────────────────────────────────────────── */}
          <div
            aria-hidden={!noChat}
            className={clsx(
              'absolute inset-0 flex flex-col bg-[#efeae2] transition-opacity duration-500',
              noChat ? 'opacity-100' : 'pointer-events-none opacity-0'
            )}
          >
            <div className="flex items-center gap-2.5 bg-accent px-4 pt-5 pb-3 text-white">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/20 text-[13px] font-semibold">
                {iniciais(nomeClinica)}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{nome}</p>
                <p className="text-[11px] text-white/75">{faseVisivel === 'digitando' ? 'digitando…' : 'conta comercial'}</p>
              </div>
            </div>

            <div key={`conversa-${volta}`} className="flex flex-1 flex-col justify-end gap-2 overflow-hidden px-3 py-4">
              <span className="mx-auto rounded-md bg-white/80 px-2 py-0.5 text-[10px] font-medium text-ink-2 uppercase">hoje</span>
              {faseVisivel === 'digitando' || !texto ? (
                <Digitando />
              ) : (
                <div className={clsx('max-w-[88%] self-start rounded-2xl rounded-tl-sm bg-white px-3 py-2 shadow-sm', !reduzido && 'celular-bolha')}>
                  <p className="text-[13px] leading-snug break-words whitespace-pre-wrap text-ink">{texto}</p>
                  <p className="mt-1 text-right text-[10px] text-muted">09:00</p>
                </div>
              )}
              {faseVisivel === 'resposta' && texto && (
                <div className={clsx('max-w-[80%] self-end rounded-2xl rounded-tr-sm bg-accent-soft px-3 py-2 shadow-sm', !reduzido && 'celular-bolha')}>
                  <p className="text-[13px] leading-snug text-ink">{RESPOSTA}</p>
                  <p className="mt-1 text-right text-[10px] text-muted">09:02 ✓✓</p>
                </div>
              )}
            </div>
          </div>
        </div>
        <figcaption className="sr-only">{texto ? `Mensagem: ${texto}` : 'Escreva a mensagem para ver a prévia'}</figcaption>
      </figure>
    </div>
  )
}

function Digitando() {
  return (
    <div className="beta-digitando flex w-14 items-center justify-center gap-1 self-start rounded-2xl rounded-tl-sm bg-white px-3 py-3 shadow-sm">
      <span className="h-1.5 w-1.5 rounded-full bg-muted" />
      <span className="h-1.5 w-1.5 rounded-full bg-muted" />
      <span className="h-1.5 w-1.5 rounded-full bg-muted" />
    </div>
  )
}
