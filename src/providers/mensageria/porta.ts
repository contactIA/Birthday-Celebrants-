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
  /**
   * O canal (número) do modelo. Na plataforma cada modelo é de um canal só, e
   * agendar por outro remetente é recusado. `null` = a listagem não disse.
   */
  canalId: string | null
}

export interface ListagemDeModelos {
  modelos: ModeloDeMensagem[]
  /** Os canais da conta, para quem precisa dizer o número de cada modelo. */
  canais: CanalDaConta[]
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
/**
 * O paciente como contato na plataforma, gravado ANTES de agendar.
 *
 * Por quê: variáveis do modelo que a própria plataforma preenche (o nome do
 * contato) saem com o número de telefone quando o número não é um contato
 * salvo. Criar ou completar o contato primeiro faz a mensagem sair com o nome.
 */
export interface ContatoDoPaciente {
  /** E.164. */
  telefone: string
  nome: string
  /** "DD/MM/AAAA", ou `null` quando o prontuário não tem. */
  dataNascimento: string | null
}

/** O que aconteceu com o contato: novo, completado (nome ou nascimento vazios) ou deixado como estava. */
export type ContatoSalvo = 'criado' | 'completado' | 'mantido'

/** Um campo personalizado de data do contato, para a escolha no setup. */
export interface CampoDeData {
  /** A chave usada na API (ex.: "data-de-nascimento"). */
  chave: string
  nome: string
}

export interface MensagemNaPlataforma {
  id: string
  status: StatusEnvio
}

/** Um canal de WhatsApp da conta. */
export interface CanalDaConta {
  /** Id do canal na plataforma. */
  id: string
  /** Dígitos com país ("556231930175") — o formato do remetente. */
  numero: string
  /** Como a conta chama o canal; o número formatado quando não tem nome. */
  nome: string
  ativo: boolean
}

/**
 * Uma equipe da conta (a API a chama de "department").
 *
 * Todo agendamento pertence a uma equipe, e a equipe só agenda pelos canais que
 * atende. Sem equipe no pedido, vale a padrão.
 */
export interface EquipeDaConta {
  id: string
  nome: string
  padrao: boolean
  /** Os canais que a equipe atende: todos os da conta, ou só os listados (ids). */
  canais: 'todos' | string[]
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

  /**
   * Os canais de WhatsApp da conta, ativos ou não. Alimenta a escolha do canal
   * na área de setup e o teste de conexão, que confere o remetente antes de
   * alguém tentar agendar.
   */
  listarCanais(): Promise<CanalDaConta[]>

  /** As equipes da conta, cada uma com os canais que atende. */
  listarEquipes(): Promise<EquipeDaConta[]>

  /**
   * Cria o contato do paciente, ou completa o que estiver vazio num contato
   * existente. Nunca sobrescreve um nome que a equipe já deu: só troca nome
   * vazio ou que é o próprio número. A data de nascimento vai no campo
   * escolhido no setup, e só se o campo estiver vazio.
   */
  salvarContato(contato: ContatoDoPaciente): Promise<ContatoSalvo>

  /** Os campos personalizados de data do contato, para escolher o de nascimento. */
  listarCamposDeData(): Promise<CampoDeData[]>
}

/**
 * O número remetente cadastrado não é um canal desta conta na plataforma.
 *
 * Tipo próprio porque a mensagem genérica ("respondeu 500") não dava pista
 * nenhuma — e o conserto é de configuração, não de insistir: corrigir o número
 * remetente na área de setup. Nasceu de um caso real: remetente sem o dígito
 * certo, e todo agendamento da clínica falhando com 500.
 */
export class RemetenteNaoEncontradoError extends Error {
  readonly status = 502
  readonly codigo = 'REMETENTE_NAO_ENCONTRADO' as const
  constructor() {
    super(
      'O número remetente desta clínica não corresponde a nenhum canal da conta na plataforma de ' +
        'mensagens. Peça a quem administra a conta para conferir o número remetente.'
    )
    this.name = 'RemetenteNaoEncontradoError'
  }
}

/**
 * A equipe que agenda não atende o número remetente.
 *
 * Tipo próprio pelo mesmo motivo do remetente: a plataforma devolve isto como
 * "não encontrado" (ENTITY_NOT_FOUND), e tratar todo "não encontrado" como
 * recurso desativado mandou a equipe procurar o problema no lugar errado. O
 * conserto é de configuração: escolher, no setup, uma equipe que atenda o
 * canal — ou associar o canal à equipe na plataforma.
 */
export class CanalForaDaEquipeError extends Error {
  readonly status = 502
  readonly codigo = 'CANAL_FORA_DA_EQUIPE' as const
  constructor() {
    super(
      'O número remetente desta clínica não está associado à equipe que agenda as mensagens na plataforma de ' +
        'mensagens. Peça a quem administra a conta para conferir o canal e a equipe no cadastro da clínica.'
    )
    this.name = 'CanalForaDaEquipeError'
  }
}

/**
 * O modelo não está associado ao canal do remetente.
 *
 * A plataforma devolve isto como "não encontrado" (ENTITY_NOT_FOUND), e a frase
 * genérica ("modelo, canal ou equipe") deixou um lote inteiro falhar sem pista
 * de onde olhar (no app de lembretes). O conserto é de configuração: cada
 * modelo é de um número só, então é usar um modelo do número da clínica (ou
 * criá-lo nesse número). Quem confere antes de agendar passa a frase com os
 * números.
 */
export class ModeloForaDoCanalError extends Error {
  readonly status = 409
  readonly codigo = 'MODELO_FORA_DO_CANAL' as const
  constructor(
    mensagem = 'O modelo de mensagem não está associado ao número remetente desta clínica. ' +
      'Confira em Modelos por qual número cada modelo sai.'
  ) {
    super(mensagem)
    this.name = 'ModeloForaDoCanalError'
  }
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
