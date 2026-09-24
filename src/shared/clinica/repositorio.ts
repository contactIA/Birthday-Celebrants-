import { db, type ClinicaInsert, type ClinicaRow, type SistemaProntuario } from '@/shared/db'

// O acessor de `aniversariantes_clinicas`.
//
// POR QUE ESTE ARQUIVO EXISTE, num projeto que decidiu NÃO abstrair persistência
// (ADR 0001): esta é a única das quatro tabelas com consumidor externo. O Clinic
// Control lê e ESCREVE nela. Concentrar o acesso aqui é o que impede o
// acoplamento de se espalhar por seis fatias — as outras três tabelas seguem
// sendo acessadas de dentro de quem as usa, sem cerimônia.
//
// Contrato: Clinic-Control/docs/reference/schema-aniversariantes.md

/**
 * A clínica, no vocabulário deste repositório.
 *
 * A tradução de `slug` para `companyId` acontece aqui e só aqui. O nome legado
 * fica confinado ao SQL e ao tipo da linha.
 */
export interface Clinica {
  id: string
  companyId: string
  nome: string
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
    mensageria: { token: string; from: string | null; channelId: string | null }
  }
}

/** O que pode ir para o browser: nada de credencial. */
export interface ClinicaPublica {
  id: string
  companyId: string
  nome: string
}

/**
 * Token válido, clínica não provisionada.
 *
 * NÃO é erro de sistema, e por isso tem tipo próprio. Acontece no caminho
 * normal: a aba da plataforma vale para todas as clínicas, então alguém pode
 * abrir antes de a clínica ser provisionada no Clinic Control. Tratar como 500
 * fazia a tela dizer "erro ao carregar" para quem não tem nada a consertar — a
 * pessoa da clínica não pode se provisionar.
 */
export class ClinicaNaoProvisionadaError extends Error {
  readonly status = 404
  readonly codigo = 'CLINICA_NAO_PROVISIONADA' as const
  constructor(readonly companyId: string) {
    super('Clínica não está provisionada no painel')
    this.name = 'ClinicaNaoProvisionadaError'
  }
}

function paraDominio(row: ClinicaRow): Clinica {
  return {
    id: row.id,
    companyId: row.slug,
    nome: row.nome,
    sistemaProntuario: row.sistema_prontuario,
    timezone: row.timezone,
    credenciais: {
      eclinica: { token: row.eclinica_token, baseUrl: row.eclinica_base_url },
      clinicorp: {
        usuarioApi: row.clinicorp_usuario_api,
        tokenApi: row.clinicorp_token_api,
        subscriberId: row.clinicorp_subscriber_id,
        baseUrl: row.clinicorp_base_url,
      },
      mensageria: {
        token: row.helena_token,
        from: row.helena_from,
        channelId: row.helena_channel_id,
      },
    },
  }
}

/**
 * Todas as clínicas provisionadas, com credenciais.
 *
 * NÃO é o `listClinicas()` que a auditoria apontou como furo. Aquele era uma
 * ROTA HTTP pública que entregava a lista de ids a qualquer um, e era o mapa
 * que tornava o resto explorável. Este é uma função de servidor, chamada
 * apenas pelos jobs de cron — que rodam para todas as clínicas por natureza,
 * autenticados por segredo próprio, e não no escopo de uma.
 *
 * Regra que mantém a distinção: nenhuma rota que responda a um acesso de
 * usuário pode chamar isto. Se precisar, é sinal de que o escopo se perdeu.
 */
export async function listarTodasAsClinicas(): Promise<Clinica[]> {
  const { data, error } = await db().from('aniversariantes_clinicas').select('*')

  if (error) throw new Error(`Erro ao listar clínicas: ${error.message}`)
  return (data ?? []).map(paraDominio)
}

/** A clínica do escopo, com credenciais. Nunca devolver isto ao browser. */
export async function buscarClinica(companyId: string): Promise<Clinica> {
  const { data, error } = await db()
    .from('aniversariantes_clinicas')
    .select('*')
    .eq('slug', companyId)
    .maybeSingle()

  if (error) throw new Error(`Erro ao buscar clínica: ${error.message}`)
  if (!data) throw new ClinicaNaoProvisionadaError(companyId)
  return paraDominio(data)
}

/**
 * Só o que o cabeçalho da tela precisa mostrar.
 *
 * SUBSTITUI um `listarClinicas()` que devolvia TODAS as clínicas cadastradas,
 * sem autenticação, numa rota pública. Era o mapa que tornava o resto
 * explorável: pegava-se a lista de ids ali e passava qualquer um deles para as
 * outras rotas. Não existe caso de uso legítimo para enumerar clínicas neste
 * app — cada acesso é escopado a uma.
 */
export async function buscarClinicaPublica(companyId: string): Promise<ClinicaPublica> {
  // O `select` é estreito de propósito: esta consulta serve ao cabeçalho da
  // tela, e não há motivo para trazer credencial nenhuma do banco. O genérico
  // em `maybeSingle` existe porque o parser de tipos do supabase-js não infere
  // projeção parcial a partir de um `Database` escrito à mão — sem ele o
  // resultado vem como `never`.
  const { data, error } = await db()
    .from('aniversariantes_clinicas')
    .select('id, slug, nome')
    .eq('slug', companyId)
    .maybeSingle<Pick<ClinicaRow, 'id' | 'slug' | 'nome'>>()

  if (error) throw new Error(`Erro ao buscar clínica: ${error.message}`)
  if (!data) throw new ClinicaNaoProvisionadaError(companyId)
  return { id: data.id, companyId: data.slug, nome: data.nome }
}

// ─── Área de setup ──────────────────────────────────────────────────────────
//
// As únicas escritas deste app nesta tabela. Quem chama é a área de setup, que
// exige a senha da equipe (ver `acesso/setup.ts`) — NUNCA uma rota do painel,
// que responde a acesso de clínica. A mesma regra de `listarTodasAsClinicas`
// vale aqui: se uma rota escopada a uma clínica precisar disto, o escopo se
// perdeu.

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
  sistemaProntuario: SistemaProntuario
  timezone: string
  criadaEm: string
  eclinica: { tokenConfigurado: boolean; baseUrl: string }
  clinicorp: {
    usuarioApi: string | null
    tokenConfigurado: boolean
    subscriberId: string | null
    baseUrl: string
  }
  mensageria: { tokenConfigurado: boolean; from: string | null; channelId: string | null }
}

function paraSetup(row: ClinicaRow): ClinicaNoSetup {
  return {
    id: row.id,
    companyId: row.slug,
    nome: row.nome,
    sistemaProntuario: row.sistema_prontuario,
    timezone: row.timezone,
    criadaEm: row.created_at,
    eclinica: { tokenConfigurado: !!row.eclinica_token, baseUrl: row.eclinica_base_url },
    clinicorp: {
      usuarioApi: row.clinicorp_usuario_api,
      tokenConfigurado: !!row.clinicorp_token_api,
      subscriberId: row.clinicorp_subscriber_id,
      baseUrl: row.clinicorp_base_url,
    },
    mensageria: {
      tokenConfigurado: !!row.helena_token,
      from: row.helena_from,
      channelId: row.helena_channel_id,
    },
  }
}

function paraLinha(clinica: Clinica): ClinicaInsert {
  const { eclinica, clinicorp, mensageria } = clinica.credenciais
  return {
    slug: clinica.companyId,
    nome: clinica.nome,
    timezone: clinica.timezone,
    sistema_prontuario: clinica.sistemaProntuario,
    eclinica_token: eclinica.token,
    eclinica_base_url: eclinica.baseUrl,
    clinicorp_usuario_api: clinicorp.usuarioApi,
    clinicorp_token_api: clinicorp.tokenApi,
    clinicorp_subscriber_id: clinicorp.subscriberId,
    clinicorp_base_url: clinicorp.baseUrl,
    helena_token: mensageria.token,
    helena_from: mensageria.from,
    helena_channel_id: mensageria.channelId,
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
 * Traduz a recusa do Postgres.
 *
 * A regra de "credenciais completas para o sistema escolhido" NÃO é repetida em
 * TypeScript: ela vive na check constraint, e uma cópia aqui divergiria dela na
 * primeira mudança (ADR 0002). O banco recusa; aqui só se dá nome à recusa.
 */
function traduzirRecusa(error: { code?: string; message: string }): Error {
  if (error.code === '23505') {
    return new ClinicaRecusadaError('Já existe uma clínica com este company_id', 409)
  }
  if (error.code === '23514' && error.message.includes('credenciais')) {
    return new ClinicaRecusadaError(
      'Credenciais do prontuário incompletas para o sistema escolhido. ' +
        'e-Clínica exige o token; Clinicorp exige usuário API, token API e subscriber ID.',
      400
    )
  }
  if (error.code === '23514') {
    return new ClinicaRecusadaError('Valor fora do permitido em algum campo', 400)
  }
  return new Error(`Erro ao gravar clínica: ${error.message}`)
}

export async function listarClinicasNoSetup(): Promise<ClinicaNoSetup[]> {
  const { data, error } = await db().from('aniversariantes_clinicas').select('*').order('nome')
  if (error) throw new Error(`Erro ao listar clínicas: ${error.message}`)
  return (data ?? []).map(paraSetup)
}

async function linhaPorId(id: string): Promise<ClinicaRow> {
  // Id que não é UUID nem chega ao banco: o Postgres responderia erro de tipo,
  // que viraria 500 em vez de 404.
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ClinicaNaoEncontradaError()
  const { data, error } = await db().from('aniversariantes_clinicas').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(`Erro ao buscar clínica: ${error.message}`)
  if (!data) throw new ClinicaNaoEncontradaError()
  return data
}

/** Com credenciais — para mesclar edições e testar conexão. Nunca devolver ao browser. */
export async function buscarClinicaPorId(id: string): Promise<Clinica> {
  return paraDominio(await linhaPorId(id))
}

export async function buscarClinicaNoSetup(id: string): Promise<ClinicaNoSetup> {
  return paraSetup(await linhaPorId(id))
}

export async function criarClinica(clinica: Clinica): Promise<ClinicaNoSetup> {
  const { data, error } = await db()
    .from('aniversariantes_clinicas')
    .insert(paraLinha(clinica))
    .select('*')
    .single()
  if (error) throw traduzirRecusa(error)
  return paraSetup(data)
}

/**
 * Grava a clínica inteira por cima da linha `id`.
 *
 * `slug` fica FORA do update: o company_id é a chave que os links assinados e a
 * plataforma usam para achar a clínica — trocá-lo órfã todo link já emitido.
 * Clínica com company_id errado se corrige cadastrando de novo.
 */
export async function atualizarClinica(id: string, clinica: Clinica): Promise<ClinicaNoSetup> {
  const campos: Partial<ClinicaInsert> = paraLinha(clinica)
  delete campos.slug
  const { data, error } = await db()
    .from('aniversariantes_clinicas')
    .update(campos)
    .eq('id', id)
    .select('*')
    .maybeSingle()
  if (error) throw traduzirRecusa(error)
  if (!data) throw new ClinicaNaoEncontradaError()
  return paraSetup(data)
}

/**
 * Os company_ids já cadastrados — para a fila de interessados saber quem já
 * virou clínica. Só o identificador; nenhuma credencial sai daqui.
 */
export async function companyIdsCadastrados(): Promise<Set<string>> {
  const { data, error } = await db()
    .from('aniversariantes_clinicas')
    .select('slug')
    .returns<Pick<ClinicaRow, 'slug'>[]>()

  if (error) throw new Error(`Erro ao listar clínicas: ${error.message}`)
  return new Set((data ?? []).map((c) => c.slug.toLowerCase()))
}
