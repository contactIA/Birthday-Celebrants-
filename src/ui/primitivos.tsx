import clsx from 'clsx'

// Primitivos da interface. Poucos e pequenos de propósito: o painel tem três
// telas, e uma biblioteca de componentes aqui seria mais código para manter que
// para reusar. O desenho é o do CRM: o botão principal é o degradê da marca, o
// secundário é branco com borda clara, e todos têm o canto de 10px.

export function Botao({
  variante = 'primario',
  tamanho = 'md',
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: 'primario' | 'secundario' | 'discreto'
  tamanho?: 'sm' | 'md'
}) {
  return (
    <button
      {...props}
      className={clsx(
        'inline-flex cursor-pointer items-center justify-center gap-2 font-medium whitespace-nowrap transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-45',
        tamanho === 'sm' ? 'h-8 rounded-lg px-3 text-[13px]' : 'h-10 rounded-[10px] px-4 text-sm',
        variante === 'primario' && 'botao-marca',
        variante === 'secundario' &&
          'border border-line bg-surface text-ink-2 hover:border-line-strong hover:bg-[#f9fafb] disabled:hover:bg-surface',
        variante === 'discreto' &&
          'bg-accent-soft text-accent-ink hover:bg-[#eddff8] disabled:hover:bg-accent-soft',
        className
      )}
    />
  )
}

/**
 * Etiqueta de estado.
 *
 * O tom NÃO vem do acento da marca: "agendado" significa agendado mesmo se o
 * white label mudar de cor. E cada estado tem forma além de cor — ponto cheio,
 * ponto vazado, texto — para não depender só de matiz.
 */
export function Estado({
  tom,
  children,
}: {
  tom: 'ok' | 'atencao' | 'parado' | 'erro' | 'neutro' | 'info'
  children: React.ReactNode
}) {
  const estilos = {
    ok: 'bg-ok-soft text-ok',
    atencao: 'bg-atencao-soft text-atencao',
    parado: 'bg-parado-soft text-parado',
    erro: 'bg-erro-soft text-erro',
    neutro: 'bg-sunk text-ink-2',
    info: 'bg-info-soft text-info',
  }[tom]

  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
        estilos
      )}
    >
      {children}
    </span>
  )
}

export function Aviso({
  tom = 'atencao',
  titulo,
  children,
  acao,
}: {
  tom?: 'atencao' | 'erro' | 'neutro'
  titulo?: string
  children: React.ReactNode
  acao?: { rotulo: string; aoClicar: () => void }
}) {
  const estilos = {
    atencao: 'border-atencao/25 bg-atencao-soft text-atencao',
    erro: 'border-erro/25 bg-erro-soft text-erro',
    neutro: 'border-line bg-surface text-ink-2',
  }[tom]

  return (
    <div className={clsx('flex items-start gap-3 rounded-[12px] border px-4 py-3 text-sm', estilos)}>
      <div className="min-w-0 flex-1">
        {titulo && <p className="mb-0.5 font-semibold">{titulo}</p>}
        <div className="leading-relaxed">{children}</div>
      </div>
      {acao && (
        <button
          onClick={acao.aoClicar}
          className="shrink-0 rounded-lg border border-current/25 px-3 py-1 text-xs font-medium hover:bg-black/5"
        >
          {acao.rotulo}
        </button>
      )}
    </div>
  )
}

/** Tela vazia. É convite para agir, não recado de que não há nada. */
export function Vazio({
  titulo,
  children,
  acao,
}: {
  titulo: string
  children?: React.ReactNode
  acao?: { rotulo: string; aoClicar: () => void }
}) {
  return (
    <div className="entrar flex flex-col items-center gap-2 rounded-[14px] border border-dashed border-line bg-surface px-6 py-14 text-center">
      <p className="text-[15px] font-semibold text-ink">{titulo}</p>
      {children && <p className="max-w-sm text-sm leading-relaxed text-muted">{children}</p>}
      {acao && (
        <Botao variante="secundario" tamanho="sm" onClick={acao.aoClicar} className="mt-3">
          {acao.rotulo}
        </Botao>
      )}
    </div>
  )
}

export function Carregando({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-2 text-sm text-muted">
      <span
        aria-hidden
        className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-line border-t-accent"
      />
      {children}
    </p>
  )
}

/** Esqueleto de linha, para a lista não pular de vazia para cheia. */
export function EsqueletoDeLinha() {
  return (
    <div className="flex items-center gap-4 border-b border-line-soft px-4 py-3.5 last:border-b-0">
      <div className="h-4 w-4 animate-pulse rounded bg-sunk" />
      <div className="h-4 w-44 animate-pulse rounded bg-sunk" />
      <div className="h-4 w-28 animate-pulse rounded bg-sunk" />
      <div className="ml-auto h-8 w-24 animate-pulse rounded-lg bg-sunk" />
    </div>
  )
}
