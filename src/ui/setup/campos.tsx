import clsx from 'clsx'

// Campos do formulário de clínica. Só existem aqui: o painel da clínica não
// tem formulário de texto livre, e promover isto a primitivo seria prematuro.

const ESTILO_BASE =
  'h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink placeholder:text-muted ' +
  'focus:border-accent focus:outline-none disabled:bg-sunk disabled:text-ink-2'

// `read-only:` só nos inputs: para o navegador todo <select> casa com
// `:read-only`, e os campos de escolha ficariam todos cinza.
const ESTILO_DO_INPUT = `${ESTILO_BASE} read-only:bg-sunk read-only:text-ink-2`

export function Secao({
  titulo,
  descricao,
  children,
}: {
  titulo: string
  descricao?: string
  children: React.ReactNode
}) {
  return (
    <section className="overflow-hidden rounded-[12px] border border-line bg-surface">
      <header className="border-b border-line-soft px-5 py-3.5">
        <h2 className="text-[15px] font-semibold text-ink">{titulo}</h2>
        {descricao && <p className="mt-0.5 text-[13px] leading-relaxed text-muted">{descricao}</p>}
      </header>
      <div className="flex flex-col gap-4 px-5 py-5">{children}</div>
    </section>
  )
}

export function Campo({
  rotulo,
  dica,
  mono,
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  rotulo: string
  dica?: React.ReactNode
  /** Fonte monoespaçada no VALOR — para UUID e identificadores. */
  mono?: boolean
}) {
  return (
    <label className={clsx('flex flex-col gap-1.5', className)}>
      <span className="text-[13px] font-medium text-ink-2">{rotulo}</span>
      <input
        {...props}
        className={clsx(ESTILO_DO_INPUT, mono && 'font-mono')}
      />
      {dica && <span className="text-xs leading-relaxed text-muted">{dica}</span>}
    </label>
  )
}

/**
 * Campo de segredo — só de escrita.
 *
 * A tela nunca recebe o valor salvo, então não há o que mostrar: o campo diz
 * se EXISTE um valor e, em branco, mantém o atual. Mostrar "••••" fingindo ser
 * o valor induziria a achar que apagar os pontos apaga o token.
 */
export function CampoSecreto({
  rotulo,
  configurado,
  obrigatorio,
  valor,
  aoMudar,
}: {
  rotulo: string
  /** `null` = cadastro novo, não há valor salvo para manter. */
  configurado: boolean | null
  obrigatorio?: boolean
  valor: string
  aoMudar: (v: string) => void
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex items-center gap-2 text-[13px] font-medium text-ink-2">
        {rotulo}
        {configurado === true && (
          <span className="rounded-full bg-ok-soft px-2 py-0.5 text-[11px] font-medium text-ok">configurado</span>
        )}
        {configurado === false && (
          <span className="rounded-full bg-sunk px-2 py-0.5 text-[11px] font-medium text-ink-2">não configurado</span>
        )}
      </span>
      <input
        type="password"
        // `new-password` impede o navegador de preencher com a senha do setup.
        autoComplete="new-password"
        spellCheck={false}
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        placeholder={configurado ? 'Deixe em branco para manter o atual' : obrigatorio ? 'Obrigatório' : ''}
        className={ESTILO_DO_INPUT}
      />
    </label>
  )
}

export function Escolha<T extends string>({
  rotulo,
  valor,
  opcoes,
  aoMudar,
}: {
  rotulo: string
  valor: T
  opcoes: { valor: T; rotulo: string }[]
  aoMudar: (v: T) => void
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] font-medium text-ink-2">{rotulo}</span>
      <select value={valor} onChange={(e) => aoMudar(e.target.value as T)} className={ESTILO_BASE}>
        {opcoes.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.rotulo}
          </option>
        ))}
      </select>
    </label>
  )
}
