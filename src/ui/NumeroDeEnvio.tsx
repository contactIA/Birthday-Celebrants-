import clsx from 'clsx'
import type { EnvioDoModelo, NumeroDeEnvio as Numero, Recusa } from '@/shared/mensageria/canal-do-modelo'
import { formatarTelefoneBR } from '@/shared/telefone/e164'

// O número por onde a mensagem sai, do MESMO jeito em todas as telas: o ícone,
// o número e o nome do canal. Desde 2026-10-10 a mensagem sai pelo número do
// modelo, e uma conta pode ter o mesmo modelo, com o mesmo nome, em vários
// números (caso da Odontho, cinco). A pessoa reconhece o número pela forma, não
// lendo frase.

export function IconeWhatsApp({ className = 'h-[18px] w-[18px]' }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className={clsx('shrink-0', className)}>
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

/** O nome do canal, quando diz algo além do número (sem nome, a conta repete o número). */
function nomeDoCanal(numero: Numero): string | null {
  const nome = numero.nome.trim()
  return nome && nome !== formatarTelefoneBR(numero.numero) ? nome : null
}

/** "(71) 98127-0357 · Comercial": o rótulo em texto puro, para onde não cabe o ícone (o `<optgroup>`). */
export function rotuloDoNumero(numero: Numero): string {
  const nome = nomeDoCanal(numero)
  return nome ? `${formatarTelefoneBR(numero.numero)} · ${nome}` : formatarTelefoneBR(numero.numero)
}

export function NumeroDeEnvio({
  numero,
  recusado = false,
  className,
}: {
  numero: Numero
  /** A unidade não pode enviar por ele: o número sai na cor de erro. */
  recusado?: boolean
  className?: string
}) {
  const nome = nomeDoCanal(numero)
  return (
    <span className={clsx('inline-flex min-w-0 items-center gap-1.5', className)}>
      <IconeWhatsApp className="h-4 w-4" />
      <span className={clsx('tnum font-semibold whitespace-nowrap', recusado ? 'text-erro' : 'text-ink')}>
        {formatarTelefoneBR(numero.numero)}
      </span>
      {nome && <span className="truncate text-muted">{nome}</span>}
    </span>
  )
}

// ─── Os modelos agrupados por número ────────────────────────────────────────

export interface GrupoDeNumero<T> {
  /** Os dígitos do número; `null` = o modelo não diz o canal, ou o canal saiu da conta. */
  chave: string | null
  numero: Numero | null
  /** O envio do primeiro modelo: o mesmo canal dá o mesmo resultado para todos. */
  envio: EnvioDoModelo
  itens: T[]
}

/**
 * Primeiro o número da unidade, depois os outros que ela pode usar, depois os
 * que não dá para conferir, e por último os que ela não pode usar.
 */
function ordem(envio: EnvioDoModelo): number {
  if (envio.saiPeloRemetente) return 0
  if (envio.permitido === true) return 1
  if (envio.permitido === null) return 2
  return 3
}

/** Agrupa por número, mantendo a ordem de cada grupo como veio. */
export function agruparPorNumero<T extends { envio: EnvioDoModelo }>(itens: T[]): GrupoDeNumero<T>[] {
  const grupos = new Map<string, GrupoDeNumero<T>>()
  for (const item of itens) {
    const chave = item.envio.numero?.numero ?? null
    const grupo = grupos.get(chave ?? '')
    if (grupo) grupo.itens.push(item)
    else grupos.set(chave ?? '', { chave, numero: item.envio.numero, envio: item.envio, itens: [item] })
  }
  return [...grupos.values()].sort((a, b) => ordem(a.envio) - ordem(b.envio))
}

function fraseDaRecusa(recusa: Recusa, envio: EnvioDoModelo): string {
  switch (recusa.tipo) {
    case 'fora-do-remetente':
      return 'não é o número desta clínica'
    case 'de-outra-unidade':
      return `é da unidade ${recusa.unidade}`
    case 'fora-da-conta':
      return envio.numero ? 'desativado na conta' : 'não está mais na conta'
    case 'sem-equipe':
      return 'nenhuma equipe atende'
  }
}

/**
 * O que a pessoa precisa saber do número, em poucas palavras: é o da unidade,
 * por qual equipe agenda, ou por que não serve. A frase inteira de recusa fica
 * no cartão de cada modelo.
 */
export function SituacaoDoNumero({ envio }: { envio: EnvioDoModelo }) {
  if (envio.saiPeloRemetente) {
    return (
      <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent-ink">
        número da unidade
      </span>
    )
  }
  if (envio.recusa) return <span className="text-xs font-medium text-erro">{fraseDaRecusa(envio.recusa, envio)}</span>
  if (envio.porOutroNumero) {
    return (
      <span className="text-xs text-muted">
        {envio.equipe ? `agenda pela equipe ${envio.equipe.nome}` : 'outro número da conta'}
      </span>
    )
  }
  return null
}
