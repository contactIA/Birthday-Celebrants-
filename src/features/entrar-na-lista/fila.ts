// A fila de espera e a "primeira turma" da página de beta.
//
// REGRA DE OURO DESTE ARQUIVO: nenhum número mostrado à clínica é inventado.
// A página roda dentro da plataforma que a clínica já paga — urgência falsa
// ("restam 2 vagas" sem ser verdade) funciona uma vez e depois custa a
// confiança no produto inteiro.
//
//   · O TAMANHO da primeira turma é decisão de produto (`VAGAS_DA_TURMA`) — um
//     plano, e dizê-lo é honesto.
//   · QUANTAS clínicas já pediram vem da tabela. Só aparece a partir de
//     `MINIMO_PARA_MOSTRAR`: "1 de 10" desanima em vez de apressar, e esconder
//     um número real pequeno não engana ninguém.
//   · A POSIÇÃO na fila é contada de verdade.

/** Tamanho da primeira turma do beta (decidido com o Gabriel, 2026-09-24). */
export const VAGAS_DA_TURMA = 10

/** Abaixo disto, a contagem de pedidos não aparece. */
export const MINIMO_PARA_MOSTRAR = 3

export interface PedidoNaFila {
  companyId: string
  /** ISO — a ordem da fila é a ordem de chegada. */
  pedidoEm: string
}

export type EtapaDaFila = 'recebido' | 'em_analise' | 'liberada'

export interface PosicaoNaFila {
  /** 1 = próxima a ser atendida. `null` quando a vaga já foi liberada. */
  posicao: number | null
  /** Pedidos ainda esperando (não cadastrados), incluindo o desta clínica. */
  naFrente: number
}

/**
 * A posição desta conta entre os pedidos ainda NÃO cadastrados, por ordem de
 * chegada. Quem já virou clínica sai da fila — é o que faz a posição andar.
 */
export function posicaoNaFila(
  pedidos: PedidoNaFila[],
  cadastradas: Set<string>,
  companyId: string
): PosicaoNaFila {
  const alvo = companyId.toLowerCase()
  if (cadastradas.has(alvo)) return { posicao: null, naFrente: 0 }

  const esperando = pedidos
    .filter((p) => !cadastradas.has(p.companyId.toLowerCase()))
    .sort((a, b) => a.pedidoEm.localeCompare(b.pedidoEm))

  const indice = esperando.findIndex((p) => p.companyId.toLowerCase() === alvo)
  if (indice === -1) return { posicao: null, naFrente: esperando.length }
  return { posicao: indice + 1, naFrente: indice }
}

export type SituacaoDaTurma =
  /** Poucos pedidos ainda: mostra só "primeira turma: 10 clínicas". */
  | { tipo: 'aberta'; vagas: number }
  /** Contagem real, a partir do mínimo. */
  | { tipo: 'enchendo'; vagas: number; pedidos: number }
  /** Passou do tamanho da turma: a próxima fila. */
  | { tipo: 'completa'; vagas: number; pedidos: number }

export function situacaoDaTurma(totalDePedidos: number): SituacaoDaTurma {
  if (totalDePedidos >= VAGAS_DA_TURMA) {
    return { tipo: 'completa', vagas: VAGAS_DA_TURMA, pedidos: totalDePedidos }
  }
  if (totalDePedidos >= MINIMO_PARA_MOSTRAR) {
    return { tipo: 'enchendo', vagas: VAGAS_DA_TURMA, pedidos: totalDePedidos }
  }
  return { tipo: 'aberta', vagas: VAGAS_DA_TURMA }
}

/** A etapa que a clínica vê: "liberada" vem do cadastro, não do status salvo. */
export function etapaDoPedido(status: 'recebido' | 'em_analise', cadastrada: boolean): EtapaDaFila {
  return cadastrada ? 'liberada' : status
}

export const STATUS_DO_PEDIDO = ['recebido', 'em_analise'] as const
export type StatusDoPedido = (typeof STATUS_DO_PEDIDO)[number]

/** Lê o status vindo do setup. `null` = inválido. */
export function lerStatus(corpo: unknown): StatusDoPedido | null {
  const status = (corpo as { status?: unknown } | null)?.status
  return STATUS_DO_PEDIDO.find((s) => s === status) ?? null
}
