'use client'

import { useState, type ComponentProps, type ReactNode } from 'react'
import clsx from 'clsx'
import * as Popover from '@radix-ui/react-popover'
import { Calendario } from '@/ui/calendario'
import {
  EXPEDIENTE_PADRAO,
  dataHoraComSemana,
  dataHoraLegivel,
  diaDoTexto,
  horarioLegivel,
  juntarDataHora,
  lerHorario,
  opcoesDeHorario,
  separarDataHora,
  textoDoDia,
  type Expediente,
} from '@/ui/datas'

// Os campos de data e de horário, no lugar dos seletores do navegador. São os
// do CRM (`src/componentes/campos-de-data.tsx` de lá): o mesmo botão, o mesmo
// calendário e as mesmas grades de horário, para quem passa de um app para o
// outro escolher datas do mesmo jeito. Cada campo troca com quem o usa o mesmo
// texto do <input> que substitui: 'HH:MM' ou 'AAAA-MM-DDTHH:MM', no fuso da clínica.

const GATILHO =
  'flex w-full min-w-0 cursor-pointer items-center gap-2 rounded-[10px] border border-line bg-field px-3 text-left text-sm text-ink transition-[border-color,box-shadow] outline-none hover:border-line-strong focus-visible:border-accent-line focus-visible:ring-[3px] focus-visible:ring-accent/15 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-60 data-[state=open]:border-accent-line data-[state=open]:ring-[3px] data-[state=open]:ring-accent/15'

const PRONTO =
  'h-8 cursor-pointer rounded-lg bg-accent-ink px-3.5 text-[13px] font-medium text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40'

function Icone({ children, className = 'h-4 w-4' }: { children: ReactNode; className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  )
}

const IconeCalendario = () => (
  <Icone>
    <rect x="2.5" y="3.3" width="11" height="10.2" rx="2" />
    <path d="M2.5 6.6h11M5.5 2v2.4M10.5 2v2.4" />
  </Icone>
)

const IconeRelogio = ({ className }: { className?: string }) => (
  <Icone className={className}>
    <circle cx="8" cy="8" r="5.6" />
    <path d="M8 5v3.2l2 1.3" />
  </Icone>
)

function Gatilho({
  icone,
  texto,
  vazio,
  rotulo,
  desativado,
  compacto,
  aoLimpar,
  className,
}: {
  icone: ReactNode
  texto: string
  vazio: string
  rotulo?: string
  desativado?: boolean
  /** Na altura dos controles de 36px (as linhas de configuração dos modelos). */
  compacto?: boolean
  aoLimpar?: () => void
  className?: string
}) {
  return (
    <div className={clsx('relative', className)}>
      <Popover.Trigger asChild>
        <button
          type="button"
          disabled={desativado}
          aria-label={rotulo ? `${rotulo}: ${texto || vazio}` : undefined}
          className={clsx(GATILHO, compacto ? 'h-9' : 'h-10', aoLimpar && texto && 'pr-8')}
        >
          <span className="shrink-0 text-muted">{icone}</span>
          <span className={clsx('tnum min-w-0 flex-1 truncate', !texto && 'text-muted-2')}>{texto || vazio}</span>
        </button>
      </Popover.Trigger>
      {aoLimpar && texto && !desativado ? (
        <button
          type="button"
          onClick={aoLimpar}
          aria-label={rotulo ? `Limpar ${rotulo.toLowerCase()}` : 'Limpar'}
          title="Limpar"
          className="absolute top-1/2 right-2 grid h-6 w-6 -translate-y-1/2 cursor-pointer place-items-center rounded-md text-muted transition-colors hover:bg-sunk hover:text-ink"
        >
          <Icone className="h-3.5 w-3.5">
            <path d="M4 4l8 8M12 4l-8 8" />
          </Icone>
        </button>
      ) : null}
    </div>
  )
}

/** O quadro flutuante dos campos. Sem espaço embaixo (o app roda num iframe), encolhe e rola por dentro. */
function Quadro({ className, ...props }: ComponentProps<typeof Popover.Content>) {
  return (
    <Popover.Portal>
      <Popover.Content
        align="start"
        side="bottom"
        sideOffset={4}
        collisionPadding={8}
        className={clsx(
          'abrir-quadro z-50 max-h-(--radix-popover-content-available-height) overflow-y-auto rounded-xl border border-line bg-surface shadow-md outline-none',
          className
        )}
        {...props}
      />
    </Popover.Portal>
  )
}

const CHIP =
  'tnum h-8 min-w-0 cursor-pointer rounded-lg border text-[13px] transition-[background-color,border-color,color] duration-150 outline-none focus-visible:ring-[3px] focus-visible:ring-accent/25'
const chip = (marcado: boolean) =>
  clsx(CHIP, marcado ? 'border-accent-ink bg-accent-ink font-medium text-white' : 'border-line bg-surface text-ink hover:border-accent-line hover:bg-accent-soft/60')

/** Uma grade de horas ou de minutos: tudo à vista, um clique por escolha. */
function GradeDeHorario({
  rotulo,
  opcoes,
  valor,
  formatar,
  colunas,
  aoEscolher,
}: {
  rotulo: string
  opcoes: number[]
  valor?: number
  formatar: (n: number) => string
  colunas: number
  aoEscolher: (n: number) => void
}) {
  return (
    <div role="group" aria-label={rotulo}>
      <p className="mb-1.5 text-xs text-muted">{rotulo}</p>
      <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${colunas}, minmax(0, 1fr))` }}>
        {opcoes.map((n) => (
          <button key={n} type="button" aria-pressed={n === valor} onClick={() => aoEscolher(n)} className={chip(n === valor)}>
            {formatar(n)}
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * A grade de horas do expediente, a de minutos e o campo para digitar: a metade
 * do horário no seletor de dia e horário do CRM.
 */
function SeletorDeHorario({
  hora,
  minuto,
  aoMudar,
  expediente = EXPEDIENTE_PADRAO,
}: {
  hora?: number
  minuto?: number
  aoMudar: (horario: { hora?: number; minuto?: number }) => void
  expediente?: Expediente
}) {
  const atual = hora === undefined ? '' : horarioLegivel(hora, minuto ?? 0)
  // O horário de quando o quadro abriu: um valor gravado fora do expediente ganha
  // lugar na grade; o que está sendo digitado, não (a grade pularia a cada tecla).
  const [inicial] = useState({ hora, minuto })
  const [digitado, setDigitado] = useState(atual)
  const [visto, setVisto] = useState(atual)
  // O horário mudou por um clique na grade: o campo de digitar mostra o novo.
  if (atual !== visto) {
    setVisto(atual)
    setDigitado(atual)
  }
  const { horas, minutos } = opcoesDeHorario(expediente, inicial)

  const escolher = (novo: { hora?: number; minuto?: number }) => {
    const h = { hora, minuto, ...novo }
    // Escolheu a hora antes do minuto: começa na hora cheia.
    if (novo.hora !== undefined && h.minuto === undefined) h.minuto = 0
    aoMudar(h)
  }
  const digitar = (texto: string) => {
    setDigitado(texto)
    const lido = lerHorario(texto)
    if (!lido) return
    // O campo fica como a pessoa digitou ("9", e não "09:00"), para ela seguir digitando.
    setVisto(horarioLegivel(lido.hora, lido.minuto))
    aoMudar(lido)
  }
  const digitadoInvalido = digitado.trim() !== '' && !lerHorario(digitado)

  return (
    <div className="flex min-w-0 flex-col gap-3.5">
      <GradeDeHorario
        rotulo="Hora"
        opcoes={horas}
        valor={hora}
        formatar={(n) => String(n).padStart(2, '0')}
        colunas={horas.length > 12 ? 7 : 6}
        aoEscolher={(n) => escolher({ hora: n })}
      />
      <GradeDeHorario
        rotulo="Minutos"
        opcoes={minutos}
        valor={hora === undefined ? undefined : minuto}
        formatar={(n) => `:${String(n).padStart(2, '0')}`}
        colunas={Math.min(minutos.length, 6)}
        aoEscolher={(n) => escolher({ minuto: n })}
      />
      <label className="flex items-center gap-2 text-xs text-muted">
        Ou digite
        <input
          inputMode="numeric"
          value={digitado}
          placeholder="14:30"
          aria-label="Horário digitado"
          aria-invalid={digitadoInvalido}
          onChange={(e) => digitar(e.target.value)}
          className="tnum h-8 w-[84px] rounded-lg border border-line bg-field text-center text-[13px] text-ink outline-none placeholder:text-muted-2 focus-visible:border-accent-line focus-visible:ring-[3px] focus-visible:ring-accent/15 aria-invalid:border-erro"
        />
      </label>
    </div>
  )
}

/** Um horário, 'HH:MM': as grades de hora e de minuto num quadro flutuante. */
export function CampoDeHorario({
  valor,
  aoMudar,
  rotulo,
  vazio = 'Escolher horário',
  desativado,
  compacto,
  className,
}: {
  valor: string
  aoMudar: (valor: string) => void
  rotulo?: string
  vazio?: string
  desativado?: boolean
  compacto?: boolean
  className?: string
}) {
  const [aberto, setAberto] = useState(false)
  const lido = lerHorario(valor)
  return (
    <Popover.Root open={aberto} onOpenChange={setAberto}>
      <Gatilho
        icone={<IconeRelogio />}
        texto={lido ? horarioLegivel(lido.hora, lido.minuto) : ''}
        vazio={vazio}
        rotulo={rotulo}
        desativado={desativado}
        compacto={compacto}
        className={className}
      />
      <Quadro className="w-[min(340px,calc(100vw-24px))] p-4">
        <SeletorDeHorario
          hora={lido?.hora}
          minuto={lido?.minuto}
          aoMudar={(h) => h.hora !== undefined && aoMudar(horarioLegivel(h.hora, h.minuto ?? 0))}
        />
        <div className="mt-3 flex justify-end border-t border-line-soft pt-3">
          <button type="button" onClick={() => setAberto(false)} className={PRONTO}>
            Pronto
          </button>
        </div>
      </Quadro>
    </Popover.Root>
  )
}

/**
 * O dia e o horário, lado a lado: o calendário à esquerda e, à direita, as
 * grades de horário. Só vira valor com dia, hora e minuto.
 */
function SeletorDeDataHora({
  valor,
  aoMudar,
  min,
  hoje,
}: {
  valor: string
  aoMudar: (valor: string) => void
  /** O primeiro dia que dá para escolher, 'AAAA-MM-DD'. */
  min?: string
  hoje?: string
}) {
  const [partes, setPartes] = useState(() => separarDataHora(valor))
  const [valorVisto, setValorVisto] = useState(valor)
  // O valor mudou fora daqui (o botão de limpar): o seletor acompanha.
  if (valor !== valorVisto) {
    setValorVisto(valor)
    setPartes(separarDataHora(valor))
  }
  const antes = diaDoTexto(min)
  const atual = juntarDataHora(partes.dia, partes.hora, partes.minuto)

  const mudar = (novas: Partial<typeof partes>) => {
    const p = { ...partes, ...novas }
    setPartes(p)
    const novo = juntarDataHora(p.dia, p.hora, p.minuto)
    setValorVisto(novo)
    aoMudar(novo)
  }

  const faltando = partes.dia && partes.hora === undefined ? 'Falta o horário' : !partes.dia && partes.hora !== undefined ? 'Falta o dia' : null

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-4 sm:flex-row sm:gap-5">
        <Calendario
          mode="single"
          className="shrink-0 self-center sm:self-start"
          selected={diaDoTexto(partes.dia)}
          defaultMonth={diaDoTexto(partes.dia) ?? diaDoTexto(hoje) ?? new Date()}
          onSelect={(d) => d && mudar({ dia: textoDoDia(d) })}
          disabled={antes ? [{ before: antes }] : undefined}
        />
        <div className="min-w-0 flex-1 sm:border-l sm:border-line-soft sm:pl-5">
          <SeletorDeHorario hora={partes.hora} minuto={partes.minuto} aoMudar={mudar} />
        </div>
      </div>
      <p
        className={clsx('tnum flex items-center gap-1.5 border-t border-line-soft pt-2.5 text-[13px]', faltando ? 'text-atencao' : 'text-ink-2')}
        role="status"
      >
        <IconeRelogio className="h-3.5 w-3.5 shrink-0" />
        {faltando ?? (atual ? dataHoraComSemana(atual) : 'Escolha o dia e o horário')}
      </p>
    </div>
  )
}

/** O dia e o horário, 'AAAA-MM-DDTHH:MM': o calendário e as grades num quadro flutuante. */
export function CampoDeDataHora({
  valor,
  aoMudar,
  rotulo,
  vazio = 'Escolher dia e horário',
  min,
  hoje,
  desativado,
  limpavel = false,
  className,
}: {
  valor: string
  aoMudar: (valor: string) => void
  rotulo?: string
  vazio?: string
  min?: string
  /** Hoje no fuso da clínica, 'AAAA-MM-DD': abre o calendário no mês certo. */
  hoje?: string
  desativado?: boolean
  limpavel?: boolean
  className?: string
}) {
  const [aberto, setAberto] = useState(false)
  return (
    <Popover.Root open={aberto} onOpenChange={setAberto}>
      <Gatilho
        icone={<IconeCalendario />}
        texto={dataHoraLegivel(valor)}
        vazio={vazio}
        rotulo={rotulo}
        desativado={desativado}
        aoLimpar={limpavel ? () => aoMudar('') : undefined}
        className={className}
      />
      <Quadro className="w-[min(600px,calc(100vw-24px))] p-4">
        <SeletorDeDataHora valor={valor} aoMudar={aoMudar} min={min} hoje={hoje} />
        <div className="mt-3 flex justify-end">
          <button type="button" disabled={!valor} onClick={() => setAberto(false)} className={PRONTO}>
            Pronto
          </button>
        </div>
      </Quadro>
    </Popover.Root>
  )
}
