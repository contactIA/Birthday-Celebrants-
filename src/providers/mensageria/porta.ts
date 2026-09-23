import type { StatusEnvio } from '@/shared/db'

// A porta de mensageria.
//
// Uma implementação hoje. A porta existe mesmo assim porque a fatia de
// agendamento precisa ser testável sem rede — e porque o vocabulário do
// fornecedor não deve vazar para dentro das fatias.
//
// MARCA: a plataforma de mensagens é WHITE LABEL. A clínica a conhece pela
// marca do host, não pelo nome de quem está por trás. Nenhuma string que possa
// chegar à tela — inclusive mensagem de erro — pode citar o fornecedor. Use
// linguagem neutra ("plataforma de mensagens", "modelos aprovados"); trocar por
// outro nome fixo só erra de novo quando o white label variar por cliente.

/** Um modelo aprovado, no vocabulário deste repositório. */
export interface ModeloDeMensagem {
  /** Id do modelo na plataforma. */
  id: string
  nome: string
  /** O corpo com `{{1}}`, `{{2}}`... */
  conteudo: string
}

export interface ListagemDeModelos {
  modelos: ModeloDeMensagem[]
  /**
   * `false` = o filtro por tipo "mensagem agendada" voltou vazio nesta conta e
   * caímos para "só aprovados". A tela precisa avisar que não deu para garantir
   * que os modelos listados servem para agendamento.
   */
  filtradoPorTipo: boolean
}

export interface AgendamentoSolicitado {
  /** Destinatário em E.164. */
  para: string
  modeloId: string
  /** ISO 8601 UTC. */
  quando: string
  parametros: Record<string, string>
}

export interface AgendamentoCriado {
  /**
   * Id da mensagem na plataforma, ou `null` quando a resposta de sucesso veio
   * sem corpo. Sem ele não há como cancelar depois.
   */
  id: string | null
}

/**
 * Uma mensagem agendada, como a plataforma a reporta.
 *
 * O `status` usa o MESMO conjunto de valores da nossa coluna — `SCHEDULED`,
 * `PROCESSED`, `SENT`, `DELIVERED`, `READ`, `CANCELED`, `FAILED` — porque a
 * coluna foi modelada a partir do enum deles. O adapter só normaliza a caixa.
 */
export interface MensagemNaPlataforma {
  id: string
  status: StatusEnvio
}

export interface ProvedorDeMensageria {
  listarModelos(): Promise<ListagemDeModelos>
  agendar(pedido: AgendamentoSolicitado): Promise<AgendamentoCriado>
  cancelar(id: string): Promise<void>
  /**
   * As mensagens agendadas para o intervalo, com o status atual.
   *
   * Em LOTE, e não uma consulta por mensagem: a listagem aceita filtro por data
   * de agendamento, então reconciliar cem envios custa uma ou duas chamadas em
   * vez de cem. Devolve tudo o que a conta tem no intervalo, inclusive
   * mensagens que não criamos — quem chama casa pelos ids que conhece.
   */
  listarAgendadas(janela: { de: string; ate: string }): Promise<MensagemNaPlataforma[]>
}

/** A plataforma recusou ou não respondeu. */
export class MensageriaIndisponivelError extends Error {
  readonly status = 502
  readonly codigo = 'MENSAGERIA_INDISPONIVEL' as const
  constructor(mensagem: string) {
    super(mensagem)
    this.name = 'MensageriaIndisponivelError'
  }
}

/**
 * A mensagem já não está agendada na plataforma — foi enviada ou cancelada
 * diretamente por lá.
 *
 * Tipo próprio porque NÃO é falha do ponto de vista de quem pediu o
 * cancelamento: o resultado que a pessoa queria (não enviar) já é verdade. Quem
 * chama sincroniza o status local em vez de mostrar erro.
 */
export class MensagemNaoEstaAgendadaError extends Error {
  readonly status = 409
  readonly codigo = 'MENSAGEM_NAO_ESTA_AGENDADA' as const
  constructor() {
    super('A mensagem já não estava agendada na plataforma')
    this.name = 'MensagemNaoEstaAgendadaError'
  }
}

/** O recurso de mensagens agendadas não está habilitado na conta da clínica. */
export class RecursoNaoHabilitadoError extends Error {
  readonly status = 502
  readonly codigo = 'RECURSO_NAO_HABILITADO' as const
  constructor() {
    super(
      'O recurso de mensagens agendadas não está habilitado na conta desta clínica. ' +
        'Peça a quem administra a conta para ativá-lo.'
    )
    this.name = 'RecursoNaoHabilitadoError'
  }
}

export const TIMEOUT_MS = 20_000
