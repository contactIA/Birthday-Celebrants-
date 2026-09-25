import clsx from 'clsx'

// Peças das listas no formato da tela de mensagens agendadas da plataforma
// (Agenda e Histórico): o mesmo avatar, a mesma busca, o mesmo botão de
// atualizar. Um lugar só, para as duas telas não divergirem aos poucos.

export const ESTILO_CONTROLE =
  'h-10 appearance-none rounded-[10px] border border-line bg-surface text-sm text-ink placeholder:text-muted focus:border-accent focus:ring-4 focus:ring-accent/10 focus:outline-none'

export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return '?'
  return (partes[0]![0]! + (partes.length > 1 ? partes.at(-1)![0]! : '')).toUpperCase()
}

/** Avatar com as iniciais, nome e uma linha embaixo (o telefone, em geral). */
export function Contato({ nome, detalhe }: { nome: string; detalhe: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent-soft text-[12px] font-semibold text-accent-ink">
        {iniciais(nome)}
      </span>
      <div className="min-w-0">
        <p className="truncate font-medium text-ink" title={nome}>
          {nome}
        </p>
        <p className="tnum truncate text-[13px] text-muted">{detalhe}</p>
      </div>
    </div>
  )
}

export function CampoDeBusca({
  valor,
  aoMudar,
  placeholder,
  className,
}: {
  valor: string
  aoMudar: (v: string) => void
  placeholder: string
  className?: string
}) {
  return (
    <label className={clsx('relative', className)}>
      <span className="sr-only">{placeholder}</span>
      <input
        type="search"
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        placeholder={placeholder}
        className={clsx(ESTILO_CONTROLE, 'w-full pr-9 pl-3.5')}
      />
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
    </label>
  )
}

export function BotaoAtualizar({ aoClicar, girando }: { aoClicar: () => void; girando: boolean }) {
  return (
    <button
      type="button"
      onClick={aoClicar}
      aria-label="Atualizar"
      title="Atualizar"
      className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-line bg-surface text-ink-2 transition-colors hover:bg-sunk hover:text-ink"
    >
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
    </button>
  )
}

export function Marcador({
  marcado,
  aoMudar,
  rotulo,
  desabilitado = false,
}: {
  marcado: boolean
  aoMudar: () => void
  /** Completa "Selecionar …" no nome acessível. */
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
      className="h-4 w-4 cursor-pointer rounded accent-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-30"
    />
  )
}
