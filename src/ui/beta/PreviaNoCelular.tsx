'use client'

import clsx from 'clsx'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { previaDoModelo } from '@/features/entrar-na-lista/regras'

// O parabéns da clínica chegando no celular do paciente, como uma cena que se
// repete: tela bloqueada às 09:00 com a notificação, a conversa abre, a
// mensagem da clínica, o paciente responde. É o que torna a página concreta:
// a clínica vê o próprio parabéns funcionando antes de ter o app.
//
// Cada volta é um aniversariante diferente, com a própria resposta: a mesma
// cena idêntica em loop cansa, e trocar o nome mostra o {{nome}} funcionando.
//
// Enquanto a pessoa digita no formulário, a cena para na mensagem, que é onde
// ela quer olhar. Volta a rodar alguns segundos depois da última tecla.
//
// Uma conversa genérica de celular, sem marca de aplicativo: a página é white
// label, e a clínica reconhece o formato sem precisarmos nomear ninguém.
//
// Pensada para desktop (o app só roda na plataforma pelo computador). O leve
// giro que acompanha o mouse não existe em tela de toque, e tudo bem.

type Fase = 'bloqueio' | 'digitando' | 'mensagem' | 'resposta'

const DURACAO: Record<Fase, number> = { bloqueio: 2600, digitando: 1500, mensagem: 2600, resposta: 3400 }
/** Depois da última tecla, quanto tempo a cena fica parada na mensagem. */
const PAUSA_AO_EDITAR = 4000

const ANIVERSARIANTES = [
  { nome: 'Marina', resposta: 'Que carinho! Obrigada 🥰', hora: '09:02' },
  { nome: 'João', resposta: 'Valeu demais, pessoal! 😄🎉', hora: '09:05' },
  { nome: 'Dona Lúcia', resposta: 'Muito obrigada, que lembrança boa! 💜', hora: '09:11' },
  { nome: 'Rafael', resposta: 'Obrigado! Aproveito e já quero marcar minha limpeza 😁', hora: '09:03' },
]

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
  const reduzido = useMovimentoReduzido()
  const [fase, setFase] = useState<Fase>('bloqueio')
  // Cada volta remonta as bolhas para a animação de entrada tocar de novo, e
  // troca o aniversariante.
  const [volta, setVolta] = useState(0)
  const paciente = ANIVERSARIANTES[volta % ANIVERSARIANTES.length]!
  const texto = previaDoModelo(modelo, nomeClinica, paciente.nome).trim()
  const nome = nomeClinica.trim() || 'Sua clínica'
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
    <div onPointerMove={girar} onPointerLeave={soltar} className="mx-auto w-full max-w-[300px] [perspective:1100px]">
      <figure
        ref={moldura}
        aria-label="Prévia da mensagem no celular do paciente"
        className="celular-gira relative rounded-[46px] bg-[#16121f] p-[9px] shadow-[0_40px_70px_-24px_rgb(83_37_196/0.5),inset_0_0_0_1.5px_rgb(255_255_255/0.08)]"
      >
        {/* Botões laterais: detalhe pequeno que faz o aparelho parecer aparelho. */}
        <span aria-hidden className="absolute top-[110px] -left-[3px] h-9 w-[3px] rounded-l bg-[#2a2436]" />
        <span aria-hidden className="absolute top-[160px] -left-[3px] h-14 w-[3px] rounded-l bg-[#2a2436]" />
        <span aria-hidden className="absolute top-[140px] -right-[3px] h-20 w-[3px] rounded-r bg-[#2a2436]" />

        <div className="relative aspect-[9/19.2] overflow-hidden rounded-[38px]">
          {/* Barra de status e a ilha da câmera, por cima das duas telas. */}
          <div
            aria-hidden
            className="absolute inset-x-0 top-0 z-20 flex h-11 items-center justify-between px-7 text-[12px] font-semibold text-white"
          >
            <span className="tnum">09:00</span>
            <span className="absolute top-2.5 left-1/2 h-[26px] w-[92px] -translate-x-1/2 rounded-full bg-black" />
            <span className="flex items-center gap-1.5">
              <Sinal />
              <Bateria />
            </span>
          </div>

          {/* ── Tela bloqueada ─────────────────────────────────────────── */}
          <div
            aria-hidden={noChat}
            className={clsx(
              'absolute inset-0 flex flex-col items-center bg-[radial-gradient(120%_70%_at_20%_0%,var(--color-accent),#1d1440_72%)] px-4 pt-20 text-white transition-opacity duration-500',
              noChat ? 'pointer-events-none opacity-0' : 'opacity-100'
            )}
          >
            <p className="text-[13px] font-medium text-white/75">Hoje é um dia especial</p>
            <p className="tnum mt-1 font-titulo text-[72px] leading-none font-bold tracking-[-0.04em]">09:00</p>
            <div
              key={`notificacao-${volta}`}
              className={clsx(
                'mt-12 w-full rounded-[20px] bg-white/85 p-3 text-ink shadow-lg backdrop-blur',
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
              <p className="mt-1.5 line-clamp-3 text-[12px] leading-snug text-ink-2">{texto || 'Nova mensagem'}</p>
            </div>
            <span aria-hidden className="mt-auto mb-2.5 h-[5px] w-28 rounded-full bg-white/70" />
          </div>

          {/* ── Conversa ───────────────────────────────────────────────── */}
          <div
            aria-hidden={!noChat}
            className={clsx(
              'absolute inset-0 flex flex-col bg-[#efeae2] transition-opacity duration-500',
              noChat ? 'opacity-100' : 'pointer-events-none opacity-0'
            )}
          >
            <div className="flex items-center gap-2.5 bg-accent px-3 pt-12 pb-3 text-white">
              <span aria-hidden className="text-lg leading-none text-white/80">‹</span>
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/20 text-[13px] font-semibold">
                {iniciais(nomeClinica)}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{nome}</p>
                <p className="text-[11px] text-white/75">{faseVisivel === 'digitando' ? 'digitando…' : 'conta comercial'}</p>
              </div>
            </div>

            <div key={`conversa-${volta}`} className="flex flex-1 flex-col justify-end gap-2 overflow-hidden px-3 py-4">
              {/* Conversa antiga, apagada: o paciente já conhece a clínica por ali. */}
              <div aria-hidden className="flex flex-col gap-2 opacity-60">
                <span className="mx-auto rounded-md bg-white/80 px-2 py-0.5 text-[10px] font-medium text-ink-2 uppercase">12 de março</span>
                <div className="max-w-[80%] self-start rounded-2xl rounded-tl-sm bg-white px-3 py-2 shadow-sm">
                  <p className="text-[12px] leading-snug text-ink">Lembrete: sua consulta é amanhã às 14h. Até lá! 😊</p>
                </div>
                <div className="max-w-[70%] self-end rounded-2xl rounded-tr-sm bg-accent-soft px-3 py-2 shadow-sm">
                  <p className="text-[12px] leading-snug text-ink">Confirmado! 👍</p>
                </div>
              </div>
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
                  <p className="text-[13px] leading-snug text-ink">{paciente.resposta}</p>
                  <p className="mt-1 text-right text-[10px] text-muted">{paciente.hora} ✓✓</p>
                </div>
              )}
            </div>

            {/* Campo de digitar, só figurativo. */}
            <div aria-hidden className="flex items-center gap-2 px-2.5 pt-1 pb-5">
              <span className="flex h-9 flex-1 items-center rounded-full bg-white px-4 text-[12px] text-muted">Mensagem</span>
              <span className="grid h-9 w-9 place-items-center rounded-full bg-accent text-[13px] text-white">➤</span>
            </div>
            <span aria-hidden className="absolute bottom-1.5 left-1/2 h-[5px] w-28 -translate-x-1/2 rounded-full bg-ink/70" />
          </div>
        </div>
        <figcaption className="sr-only">{texto ? `Mensagem: ${texto}` : 'Escreva a mensagem para ver a prévia'}</figcaption>
      </figure>
    </div>
  )
}

function Sinal() {
  return (
    <svg width="17" height="11" viewBox="0 0 17 11" fill="currentColor">
      <rect x="0" y="7" width="3" height="4" rx="1" />
      <rect x="4.5" y="5" width="3" height="6" rx="1" />
      <rect x="9" y="2.5" width="3" height="8.5" rx="1" />
      <rect x="13.5" y="0" width="3" height="11" rx="1" />
    </svg>
  )
}

function Bateria() {
  return (
    <svg width="25" height="12" viewBox="0 0 25 12" fill="none">
      <rect x="0.5" y="0.5" width="21" height="11" rx="3.5" stroke="currentColor" opacity="0.5" />
      <rect x="2" y="2" width="16" height="8" rx="2" fill="currentColor" />
      <rect x="23" y="4" width="1.5" height="4" rx="0.75" fill="currentColor" opacity="0.5" />
    </svg>
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
