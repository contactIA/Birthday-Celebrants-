import type { StatusEnvio } from '@/shared/db'
import type { MensagemNaPlataforma } from '@/providers/mensageria'

// Traz de volta o status real de cada mensagem já agendada.
//
// POR QUE EXISTE: até aqui o status local só saía de `scheduled` no
// cancelamento. `sent`, `delivered`, `read` e `failed` existiam na coluna, na
// tela e no enum — e eram inalcançáveis. O histórico mostrava "Agendada" para
// sempre, inclusive para mensagens que falharam. Quem opera não tinha como
// saber se o parabéns realmente saiu.
//
// EM LOTE, NÃO UMA POR UMA. A listagem da plataforma aceita filtro por data de
// agendamento, então reconciliar cem envios custa uma ou duas chamadas. Uma
// consulta por mensagem multiplicaria isso por cem, todo dia.
//
// ATÉ O STATUS FINAL. `sent` ainda vira `delivered`, `read` ou `failed`, e
// `delivered` ainda vira `read`: até 2026-10-21 a linha que chegava a `sent`
// saía da consulta e ficava assim para sempre, mesmo quando a mensagem falhava
// depois. As duas seguem sendo consultadas por alguns dias (ver
// DIAS_ACOMPANHANDO_A_ENTREGA), a mesma regra do app de lembretes.
//
// COM O MOTIVO. A falha vem com a frase da plataforma, e ela é guardada junto
// com o status: sem ela, 161 falhas da Oral Foz não diziam nada aqui.
//
// COM O HORÁRIO E A CONVERSA (2026-10-21), para a ficha do envio. A plataforma
// não guarda quando cada passo aconteceu, só quando a mensagem mudou pela
// última vez: esse horário vai para a coluna do status encontrado. Passo pulado
// entre duas execuções fica sem horário. A conversa (`sessionId`) alimenta o
// "Abrir conversa". A mesma regra do app de lembretes.

/** A coluna do horário de cada passo da linha do tempo. */
export const COLUNA_DO_PASSO = {
  sent: 'enviado_em',
  delivered: 'entregue_em',
  read: 'lido_em',
  failed: 'falhou_em',
  canceled: 'cancelado_em',
} as const satisfies Partial<Record<StatusEnvio, string>>

export type ColunaDoPasso = (typeof COLUNA_DO_PASSO)[keyof typeof COLUNA_DO_PASSO]

/** O que gravar quando o status muda. */
export interface MudancaDeStatus {
  status: StatusEnvio
  /** Só em `failed`; nos outros status é `null`. */
  motivoDaFalha: string | null
  /** `null` = a plataforma não disse; a conversa já gravada fica. */
  conversaId: string | null
  /** A coluna do passo e o horário dele. `null` = status sem passo (`processed`). */
  passo: { coluna: ColunaDoPasso; quando: string } | null
}

/**
 * A mudança a gravar para uma mensagem cujo status mudou. O horário é o da
 * plataforma; sem ele, o da execução, que erra por no máximo 15 minutos.
 */
export function mudancaDoStatus(mensagem: MensagemNaPlataforma, agora: Date): MudancaDeStatus {
  const { status } = mensagem
  const coluna = status in COLUNA_DO_PASSO ? COLUNA_DO_PASSO[status as keyof typeof COLUNA_DO_PASSO] : null
  return {
    status,
    motivoDaFalha: status === 'failed' ? mensagem.motivoDaFalha : null,
    conversaId: mensagem.conversaId,
    passo: coluna ? { coluna, quando: mensagem.atualizadaEm ?? agora.toISOString() } : null,
  }
}

/**
 * Por quantos dias, depois do horário de envio, uma mensagem `sent` ou
 * `delivered` continua sendo consultada.
 *
 * A entrega ou a falha costuma chegar em minutos. O prazo é o freio: sem ele,
 * uma `sent` que a plataforma nunca resolve manteria a janela de consulta aberta
 * desde aquele dia, e a cada 15 minutos a listagem cresceria. Três dias, como
 * no app de lembretes.
 */
export const DIAS_ACOMPANHANDO_A_ENTREGA = 3

/** Desde quando (ISO) as `sent` e `delivered` ainda são consultadas. */
export function inicioDoAcompanhamentoDaEntrega(agora: Date): string {
  return new Date(agora.getTime() - DIAS_ACOMPANHANDO_A_ENTREGA * 24 * 60 * 60 * 1000).toISOString()
}

export interface EnvioPendente {
  id: string
  /** Id na plataforma. Sem ele não há o que reconciliar. */
  mensagemId: string
  /** ISO. Usado para montar a janela de consulta. */
  agendadoPara: string
  statusAtual: StatusEnvio
}

export interface RelatorioDeReconciliacao {
  companyId: string
  /** Envios que estavam aguardando resposta da plataforma. */
  pendentes: number
  /** Quantos mudaram de status de fato. */
  atualizados: number
  /**
   * Pendentes que a plataforma não devolveu na janela.
   *
   * Não é erro por si: pode ser mensagem apagada por lá. Mas um número alto e
   * persistente indica que a janela ou o casamento de ids está errado — e sem
   * contar, isso seria invisível.
   */
  naoEncontrados: number
  erro: string | null
}

export interface DependenciasDaReconciliacao {
  buscarPendentes: () => Promise<EnvioPendente[]>
  listarNaPlataforma: (janela: { de: string; ate: string }) => Promise<MensagemNaPlataforma[]>
  /** `motivoDaFalha` só vem em `failed`; nos outros status é `null`. */
  atualizarStatus: (envioId: string, mudanca: MudancaDeStatus) => Promise<void>
}

/**
 * Margem no início da janela.
 *
 * A plataforma pode registrar o agendamento com deslocamento de fuso ou
 * arredondamento em relação ao que pedimos. Um dia de folga evita perder a
 * mensagem exatamente na borda do intervalo.
 */
const MARGEM_MS = 24 * 60 * 60 * 1000

export async function reconciliarStatus(
  companyId: string,
  agora: Date,
  deps: DependenciasDaReconciliacao
): Promise<RelatorioDeReconciliacao> {
  const vazio = { companyId, pendentes: 0, atualizados: 0, naoEncontrados: 0, erro: null }

  let pendentes: EnvioPendente[]
  try {
    pendentes = await deps.buscarPendentes()
  } catch (err) {
    return { ...vazio, erro: `buscar pendentes: ${(err as Error).message}` }
  }

  // Nenhum pendente, nenhuma chamada externa. A clínica que não agendou nada
  // este mês não deve custar requisição nenhuma.
  if (pendentes.length === 0) return vazio

  const maisAntigo = pendentes.reduce(
    (menor, envio) => Math.min(menor, new Date(envio.agendadoPara).getTime()),
    Number.POSITIVE_INFINITY
  )

  const janela = {
    de: new Date(maisAntigo - MARGEM_MS).toISOString(),
    ate: new Date(agora.getTime() + MARGEM_MS).toISOString(),
  }

  let naPlataforma: MensagemNaPlataforma[]
  try {
    naPlataforma = await deps.listarNaPlataforma(janela)
  } catch (err) {
    return { ...vazio, pendentes: pendentes.length, erro: `listar: ${(err as Error).message}` }
  }

  const porId = new Map(naPlataforma.map((m) => [m.id, m]))

  let atualizados = 0
  let naoEncontrados = 0
  const falhas: string[] = []

  for (const envio of pendentes) {
    const mensagem = porId.get(envio.mensagemId)
    if (!mensagem) {
      naoEncontrados++
      continue
    }
    // Só escreve o que mudou: um `update` por envio a cada execução diária
    // encheria o banco de escrita sem informação nova.
    if (mensagem.status === envio.statusAtual) continue

    try {
      await deps.atualizarStatus(envio.id, mudancaDoStatus(mensagem, agora))
      atualizados++
    } catch (err) {
      falhas.push(`${envio.id}: ${(err as Error).message}`)
    }
  }

  return {
    companyId,
    pendentes: pendentes.length,
    atualizados,
    naoEncontrados,
    erro: falhas.length > 0 ? `atualizar: ${falhas.join('; ')}` : null,
  }
}
