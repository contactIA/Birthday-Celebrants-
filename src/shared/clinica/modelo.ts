import type { SistemaProntuario } from '@/shared/db'

// A clínica no vocabulário deste app: os tipos e os erros que o acessor
// (`repositorio.ts`) entrega às fatias, venham da tabela local ou do cadastro
// comum (`cadastro.ts`). Sem banco aqui: as duas fontes montam o mesmo formato,
// e quem chama não sabe de qual veio. `repositorio.ts` reexporta tudo, então as
// fatias continuam importando de lá.

/** O endereço da API de cada prontuário, quando ninguém diz outro. */
export const BASE_URL_PADRAO: Record<SistemaProntuario, string> = {
  eclinica: 'https://eclinica.app/api/v2',
  clinicorp: 'https://api.clinicorp.com/rest/v1',
}

/** Uma unidade da clínica. Toda clínica tem ao menos a principal. */
export interface Unidade {
  id: string
  nome: string
  principal: boolean
}

/**
 * A clínica, no vocabulário deste repositório, JÁ NO CONTEXTO DE UMA UNIDADE.
 *
 * `id`/`companyId`/`nome` são da clínica; `unidade` diz de qual unidade se
 * fala, e `sistemaProntuario` e as credenciais de prontuário e remetente são as
 * DELA. É o que mantém os provedores e as fatias quase intactos: continuam
 * recebendo "a clínica", que agora vem resolvida por unidade. O que precisa
 * escopar dado por unidade (modelos, envios, cache) filtra por `unidade.id`.
 *
 * `id` e `unidade.id` são SEMPRE os ids deste app (as linhas de
 * aniversariantes_clinicas e aniversariantes_unidades), mesmo com o cadastro
 * comum ligado: são as chaves dos modelos, dos envios e do cache.
 *
 * A tradução de `slug` para `companyId` acontece no acessor e só ali. O nome
 * legado fica confinado ao SQL e ao tipo da linha.
 */
export interface Clinica {
  id: string
  companyId: string
  nome: string
  unidade: Unidade
  sistemaProntuario: SistemaProntuario
  timezone: string
  credenciais: {
    eclinica: { token: string | null; baseUrl: string }
    clinicorp: {
      usuarioApi: string | null
      tokenApi: string | null
      subscriberId: string | null
      baseUrl: string
    }
    mensageria: {
      token: string
      from: string | null
      channelId: string | null
      /** A equipe ("department") que agenda pelo remetente. `null` = a padrão da conta. */
      equipeId: string | null
      /** Chave do campo de nascimento no contato da plataforma. `null` = não preencher. */
      campoNascimento: string | null
    }
  }
}

/** O que pode ir para o browser: nada de credencial. */
export interface ClinicaPublica {
  id: string
  companyId: string
  nome: string
  /** Principal primeiro. Nunca vazia. */
  unidades: Unidade[]
  /** A unidade em vigor nesta requisição. */
  unidadeAtualId: string
}

/**
 * O rótulo de uma unidade nos logs e relatórios dos crons. A principal mantém o
 * company_id puro (o que os logs sempre mostraram); as demais ganham o nome, para
 * duas unidades da mesma clínica não se confundirem.
 */
export function rotuloDaClinica(clinica: Clinica): string {
  return clinica.unidade.principal ? clinica.companyId : `${clinica.companyId} / ${clinica.unidade.nome}`
}

// ─── Área de setup ──────────────────────────────────────────────────────────

/**
 * A clínica como a área de setup a mostra: tudo, MENOS o valor dos segredos.
 *
 * Tokens viram "configurado sim/não". Identificadores que não dão acesso
 * sozinhos (usuário API, subscriber ID, número remetente) aparecem, porque
 * conferi-los é metade do diagnóstico de uma integração quebrada.
 */
export interface ClinicaNoSetup {
  id: string
  companyId: string
  nome: string
  /** O da principal. Nulo só no cadastro comum, quando nenhuma unidade tem prontuário. */
  sistemaProntuario: SistemaProntuario | null
  timezone: string
  criadaEm: string
  /**
   * Os dados vêm do cadastro comum (CADASTRO_UNIFICADO ligado): só leitura aqui,
   * editam-se no setup do CRM.
   */
  cadastroComum: boolean
  /** Principal primeiro. A principal se edita no formulário da clínica. */
  unidades: UnidadeNoSetup[]
  /** Só no cadastro comum: as unidades do cadastro que não entram no painel, e por quê. */
  foraDoPainel: UnidadeForaDoPainel[]
  eclinica: { tokenConfigurado: boolean; baseUrl: string }
  clinicorp: {
    usuarioApi: string | null
    tokenConfigurado: boolean
    subscriberId: string | null
    baseUrl: string
  }
  mensageria: {
    tokenConfigurado: boolean
    from: string | null
    channelId: string | null
    equipeId: string | null
    campoNascimento: string | null
  }
}

/** Uma unidade como a área de setup a mostra: sem o valor dos segredos. */
export interface UnidadeNoSetup {
  id: string
  nome: string
  principal: boolean
  sistemaProntuario: SistemaProntuario
  eclinica: { tokenConfigurado: boolean; baseUrl: string }
  clinicorp: {
    usuarioApi: string | null
    tokenConfigurado: boolean
    subscriberId: string | null
    baseUrl: string
  }
  mensageria: { from: string | null; channelId: string | null; equipeId: string | null }
  /**
   * Só no cadastro comum: as credenciais existem mas não abriram com a
   * CADASTRO_CHAVE_CIFRAGEM deste servidor (chave errada ou ausente).
   */
  credenciaisIlegiveis?: boolean
}

/** Por que uma unidade do cadastro comum não aparece no painel. */
export type MotivoForaDoPainel = 'inativa' | 'sem_prontuario'

export interface UnidadeForaDoPainel {
  nome: string
  motivo: MotivoForaDoPainel
}

// ─── Erros ──────────────────────────────────────────────────────────────────

/**
 * Token válido, clínica não provisionada.
 *
 * NÃO é erro de sistema, e por isso tem tipo próprio. Acontece no caminho
 * normal: a aba da plataforma vale para todas as clínicas, então alguém pode
 * abrir antes de a clínica ser provisionada no Clinic Control. Tratar como 500
 * fazia a tela dizer "erro ao carregar" para quem não tem nada a consertar — a
 * pessoa da clínica não pode se provisionar.
 *
 * Com o cadastro comum ligado, é a clínica que não está no cadastro ou que não
 * tem o produto aniversariantes ligado.
 */
export class ClinicaNaoProvisionadaError extends Error {
  readonly status = 404
  readonly codigo = 'CLINICA_NAO_PROVISIONADA' as const
  constructor(readonly companyId: string) {
    super('Clínica não está provisionada no painel')
    this.name = 'ClinicaNaoProvisionadaError'
  }
}

/** Toda clínica tem principal (trigger + backfill); sem ela o banco está inconsistente. */
export class ClinicaSemUnidadeError extends Error {
  readonly status = 500
  readonly codigo = 'CLINICA_SEM_UNIDADE' as const
  constructor(readonly companyId: string) {
    super('Clínica sem unidade principal')
    this.name = 'ClinicaSemUnidadeError'
  }
}

/**
 * Só no cadastro comum: o produto está ligado, mas nenhuma unidade ativa tem o
 * prontuário configurado. Sem prontuário não há de onde ler os aniversariantes.
 */
export class ClinicaSemProntuarioError extends Error {
  readonly status = 409
  readonly codigo = 'CLINICA_SEM_PRONTUARIO' as const
  constructor(readonly companyId: string) {
    super('O painel desta clínica ainda não tem uma unidade com o prontuário configurado')
    this.name = 'ClinicaSemProntuarioError'
  }
}

export class UnidadeNaoEncontradaError extends Error {
  readonly status = 404
  readonly codigo = 'UNIDADE_NAO_ENCONTRADA' as const
  constructor() {
    super('Unidade não encontrada')
    this.name = 'UnidadeNaoEncontradaError'
  }
}

export class ClinicaNaoEncontradaError extends Error {
  readonly status = 404
  readonly codigo = 'CLINICA_NAO_ENCONTRADA' as const
  constructor() {
    super('Clínica não encontrada')
    this.name = 'ClinicaNaoEncontradaError'
  }
}

/** Recusa do banco traduzida para frase — 409 para duplicata, 400 para o resto. */
export class ClinicaRecusadaError extends Error {
  readonly codigo = 'CLINICA_RECUSADA' as const
  constructor(
    mensagem: string,
    readonly status: 400 | 409
  ) {
    super(mensagem)
    this.name = 'ClinicaRecusadaError'
  }
}

/**
 * Com o cadastro comum ligado, a área de setup deste app não escreve: a clínica,
 * as unidades, o prontuário e o remetente se editam no setup do CRM.
 */
export class CadastroNoCrmError extends Error {
  readonly status = 409
  readonly codigo = 'CADASTRO_NO_CRM' as const
  constructor() {
    super('Com o cadastro comum ligado, a clínica e as unidades se editam no setup do CRM')
    this.name = 'CadastroNoCrmError'
  }
}
