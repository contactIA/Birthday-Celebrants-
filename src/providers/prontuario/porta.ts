import type { Clinica } from '@/shared/clinica/repositorio'

// A porta de prontuário.
//
// Duas implementações hoje, e elas são ASSIMÉTRICAS de propósito:
//
//   · e-Clínica  — busca ao vivo na API deles a cada chamada.
//   · Clinicorp  — lê o NOSSO cache, preenchido por um cron diário, porque a
//                  API deles só lista aniversariantes de um dia por vez.
//
// A porta é sobre o MODELO DE LEITURA ("me dê os aniversariantes deste mês"),
// não sobre a origem. Quem chama não sabe — nem deve saber — qual dos dois
// caminhos respondeu.
//
// No app anterior este switch vivia dentro do handler HTTP, junto com as regras
// de exclusão de cada provedor. O efeito: conhecimento específico de fornecedor
// espalhado na rota, e nenhuma forma de testar um provedor sem subir o outro.

/**
 * O contrato que as fatias consomem. Normalizar para cá é o que permite trocar
 * ou somar provedor sem tocar em tela nenhuma.
 */
export interface Aniversariante {
  /** Id do paciente no sistema de origem. */
  id: string
  nome: string
  /**
   * O melhor telefone disponível, já escolhido pelo adapter.
   *
   * O app anterior carregava `telefone` e `celular` até a tela, que fazia
   * `celular || telefone` em três lugares. A escolha é conhecimento do
   * provedor, não da tela.
   */
  telefone: string | null
  /** "MM/DD" — formato interno. */
  aniversario: string
  /** "DD/MM/AAAA", ou string vazia quando o sistema só deu o dia/mês. */
  datanascimento: string
  /**
   * Situação do cadastro, como o sistema de origem a chama. Informativa: cada
   * adapter já excluiu o que não deve receber mensagem.
   */
  situacao: string
}

export interface ProvedorDeProntuario {
  /**
   * Aniversariantes de um mês (1–12), já normalizados e já sem os cadastros
   * que o provedor considera mortos.
   */
  listarDoMes(mes: number): Promise<Aniversariante[]>

  /**
   * Os pacientes destes ids, no sistema de origem.
   *
   * EXISTE POR CAUSA DE UM FURO. O agendamento do app anterior recebia o objeto
   * de paciente INTEIRO vindo do navegador — nome, data de nascimento e
   * telefone — e usava o telefone do corpo como destinatário. O escopo de
   * clínica estava certo, mas dentro dela o chamador escolhia para qual número
   * ia o template aprovado, com o WhatsApp Business da clínica.
   *
   * Recebe uma LISTA, e não um id, de propósito: o agendamento em lote é o caso
   * normal, e para o e-Clínica cada consulta custa a base inteira. Um id por
   * chamada transformaria um lote de 30 em 30 downloads do cadastro.
   *
   * Ids não encontrados simplesmente não voltam — cabe a quem chama decidir o
   * que dizer sobre eles.
   */
  buscarPorIds(ids: string[]): Promise<Aniversariante[]>
}

/**
 * Erro do sistema de prontuário da clínica.
 *
 * Tipo próprio porque a ação de quem lê é diferente de um erro nosso: a
 * integração da clínica é que está fora do ar ou mal configurada.
 */
export class ProntuarioIndisponivelError extends Error {
  readonly status = 502
  readonly codigo = 'PRONTUARIO_INDISPONIVEL' as const
  constructor(mensagem: string) {
    super(mensagem)
    this.name = 'ProntuarioIndisponivelError'
  }
}

/** Credencial faltando ou provedor desconhecido — configuração, não indisponibilidade. */
export class ProntuarioMalConfiguradoError extends Error {
  readonly status = 500
  readonly codigo = 'PRONTUARIO_MAL_CONFIGURADO' as const
  constructor(mensagem: string) {
    super(mensagem)
    this.name = 'ProntuarioMalConfiguradoError'
  }
}

/** Tempo máximo esperando o sistema da clínica responder. */
export const TIMEOUT_MS = 20_000

export type FabricaDeProvedor = (clinica: Clinica) => ProvedorDeProntuario
