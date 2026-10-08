import { cadastroUnificadoLigado, VARIAVEL_DO_CADASTRO_UNIFICADO } from '@/shared/cadastro-unificado'
import {
  clienteDoBanco,
  db,
  type ClinicaInsert,
  type ClinicaRow,
  type SistemaProntuario,
  type UnidadeInsert,
  type UnidadeRow,
} from '@/shared/db'
import { contaDaClinicaLocal, contasComOProdutoLigado, lerClinicaDoCadastro, lerClinicasDoCadastro } from './cadastro'
import { chaveDoCadastro } from './decifrador-do-cadastro'
import {
  CadastroNoCrmError,
  ClinicaNaoEncontradaError,
  ClinicaNaoProvisionadaError,
  ClinicaRecusadaError,
  ClinicaSemProntuarioError,
  ClinicaSemUnidadeError,
  UnidadeNaoEncontradaError,
  type Clinica,
  type ClinicaNoSetup,
  type ClinicaPublica,
  type Unidade,
  type UnidadeNoSetup,
} from './modelo'
import {
  clinicaDoCadastro,
  clinicaNoSetupDoCadastro,
  clinicaPublicaDoCadastro,
  decifradorCom,
  type ClinicaResolvida,
  type UnidadeMapeada,
} from './montagem'
import { credenciaisDaUnidade, escolherUnidade, ordenarUnidades } from './resolver'

// O acessor de `aniversariantes_clinicas` (e de `aniversariantes_unidades`).
//
// POR QUE ESTE ARQUIVO EXISTE, num projeto que decidiu NÃO abstrair persistência
// (ADR 0001): `aniversariantes_clinicas` é a única tabela com consumidor externo.
// O Clinic Control lê e ESCREVE nela. Concentrar o acesso aqui é o que impede o
// acoplamento de se espalhar por seis fatias — as outras tabelas seguem sendo
// acessadas de dentro de quem as usa, sem cerimônia.
//
// DUAS FONTES (ADR 0005, contactIA/CRM-Contact-IA#215). Com o CADASTRO_UNIFICADO
// desligado, a clínica vem destas tabelas, como sempre veio. Ligado, vem das
// visões do esquema `cadastro` do CRM (`cadastro.ts` lê, `montagem.ts` monta), e
// a área de setup deste app não escreve mais: a clínica se edita no setup do CRM.
// Quem chama recebe a mesma `Clinica` nas duas posições, já no contexto da
// unidade, e não sabe de qual fonte ela veio.
//
// Contrato: Clinic-Control/docs/reference/schema-aniversariantes.md

// Os tipos e os erros moram em `modelo.ts`, e as fatias continuam importando
// daqui.
export {
  CadastroNoCrmError,
  ClinicaNaoEncontradaError,
  ClinicaNaoProvisionadaError,
  ClinicaRecusadaError,
  ClinicaSemProntuarioError,
  ClinicaSemUnidadeError,
  UnidadeNaoEncontradaError,
  rotuloDaClinica,
  type Clinica,
  type ClinicaNoSetup,
  type ClinicaPublica,
  type MotivoForaDoPainel,
  type Unidade,
  type UnidadeForaDoPainel,
  type UnidadeNoSetup,
} from './modelo'

// ─── A fonte ────────────────────────────────────────────────────────────────

/**
 * A leitura pelo cadastro comum está ligada? Lida a cada chamada, não na carga
 * do módulo: é o que deixa os testes trocarem a posição.
 */
export function cadastroComumLigado(): boolean {
  return cadastroUnificadoLigado(process.env[VARIAVEL_DO_CADASTRO_UNIFICADO])
}

/** O decifrador com a CADASTRO_CHAVE_CIFRAGEM do ambiente, lida só quando um segredo se abre. */
const decifrador = decifradorCom(() => chaveDoCadastro())

const avisar = (texto: string) => console.warn(`[cadastro] ${texto}`)

/**
 * Com a leitura ligada, a área de setup deste app não escreve. As escritas
 * abaixo chamam isto, e as rotas também, logo na entrada: a recusa sai antes de
 * qualquer validação do formulário.
 */
export function exigirCadastroLocal(): void {
  if (cadastroComumLigado()) throw new CadastroNoCrmError()
}

/** As unidades do painel, no formato de `escolherUnidade` (id local). */
function porIdLocal(r: ClinicaResolvida): (UnidadeMapeada & { id: string })[] {
  return r.unidades.map((u) => ({ ...u, id: u.idLocal.id }))
}

/**
 * A clínica resolvida de um id local (o que o setup usa nas rotas). O id que não
 * é da conta resolvida (duas linhas locais da mesma conta) não serve: cada id
 * abre só a própria clínica.
 */
async function resolvidaPorIdLocal(id: string): Promise<ClinicaResolvida> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ClinicaNaoEncontradaError()
  const conta = await contaDaClinicaLocal(clienteDoBanco(), id)
  if (!conta) throw new ClinicaNaoEncontradaError()
  try {
    const resolvida = await lerClinicaDoCadastro(clienteDoBanco(), conta, avisar)
    if (resolvida.idLocal.toLowerCase() !== id.toLowerCase()) throw new ClinicaNaoEncontradaError()
    return resolvida
  } catch (err) {
    // No setup, a clínica sem o produto ligado é "não encontrada": a lista não a
    // mostra, e um link antigo para ela não abre o que ninguém vê.
    if (err instanceof ClinicaNaoProvisionadaError) throw new ClinicaNaoEncontradaError()
    throw err
  }
}

// ─── Leitura local (CADASTRO_UNIFICADO desligado) ───────────────────────────

function paraUnidade(u: UnidadeRow): Unidade {
  return { id: u.id, nome: u.nome, principal: u.principal }
}

function paraDominio(row: ClinicaRow, unidade: UnidadeRow): Clinica {
  const cred = credenciaisDaUnidade(row, unidade)
  return {
    id: row.id,
    companyId: row.slug,
    nome: row.nome,
    unidade: paraUnidade(unidade),
    sistemaProntuario: cred.sistemaProntuario,
    timezone: row.timezone,
    credenciais: {
      eclinica: cred.eclinica,
      clinicorp: cred.clinicorp,
      mensageria: {
        token: row.helena_token,
        from: cred.from,
        channelId: cred.channelId,
        equipeId: cred.equipeId,
        campoNascimento: row.helena_campo_nascimento,
      },
    },
  }
}

async function unidadesDaClinica(clinicaId: string): Promise<UnidadeRow[]> {
  const { data, error } = await db().from('aniversariantes_unidades').select('*').eq('clinica_id', clinicaId)
  if (error) throw new Error(`Erro ao buscar unidades: ${error.message}`)
  return data ?? []
}

function agruparPorClinica(unidades: UnidadeRow[]): Map<string, UnidadeRow[]> {
  const mapa = new Map<string, UnidadeRow[]>()
  for (const u of unidades) mapa.set(u.clinica_id, [...(mapa.get(u.clinica_id) ?? []), u])
  return mapa
}

/**
 * Todas as clínicas provisionadas, com credenciais — UMA ENTRADA POR UNIDADE.
 *
 * Os jobs de cron trabalham por unidade (cada uma tem prontuário e número
 * próprios), então expandir aqui deixa os dois crons quase como estavam.
 *
 * NÃO é o `listClinicas()` que a auditoria apontou como furo. Aquele era uma
 * ROTA HTTP pública que entregava a lista de ids a qualquer um, e era o mapa
 * que tornava o resto explorável. Este é uma função de servidor, chamada
 * apenas pelos jobs de cron — que rodam para todas as clínicas por natureza,
 * autenticados por segredo próprio, e não no escopo de uma.
 *
 * Regra que mantém a distinção: nenhuma rota que responda a um acesso de
 * usuário pode chamar isto. Se precisar, é sinal de que o escopo se perdeu.
 *
 * Com o cadastro comum: as clínicas com o produto ligado, uma entrada por
 * unidade do painel. A clínica ou a unidade cujo segredo não abre fica de fora,
 * com o motivo no log, e as outras seguem.
 */
export async function listarTodasAsClinicas(): Promise<Clinica[]> {
  if (cadastroComumLigado()) {
    const { resolvidas, falhas } = await lerClinicasDoCadastro(clienteDoBanco(), avisar)
    for (const f of falhas) console.error(`[cadastro] ${f.companyId} fora da execução: ${f.erro.message}`)
    return resolvidas.flatMap((r) =>
      r.unidades.flatMap((u) => {
        try {
          return [clinicaDoCadastro(r, u, decifrador)]
        } catch (err) {
          console.error(`[cadastro] ${r.clinica.company_id} / ${u.unidade.nome} fora da execução: ${(err as Error).message}`)
          return []
        }
      })
    )
  }

  const [clinicas, unidades] = await Promise.all([
    db().from('aniversariantes_clinicas').select('*'),
    db().from('aniversariantes_unidades').select('*'),
  ])

  if (clinicas.error) throw new Error(`Erro ao listar clínicas: ${clinicas.error.message}`)
  if (unidades.error) throw new Error(`Erro ao listar unidades: ${unidades.error.message}`)

  const porClinica = agruparPorClinica(unidades.data ?? [])
  return (clinicas.data ?? []).flatMap((c) =>
    ordenarUnidades(porClinica.get(c.id) ?? []).map((u) => paraDominio(c, u))
  )
}

/**
 * A clínica do escopo, com credenciais, no contexto de UMA unidade. Nunca
 * devolver isto ao browser.
 *
 * `unidadeId` vem de um cookie que o cliente controla: sendo de outra clínica
 * ou inválido, vale a principal (ver `escolherUnidade`).
 */
export async function buscarClinica(companyId: string, unidadeId: string | null = null): Promise<Clinica> {
  if (cadastroComumLigado()) {
    const r = await lerClinicaDoCadastro(clienteDoBanco(), companyId, avisar)
    const unidade = escolherUnidade(porIdLocal(r), unidadeId)
    if (!unidade) throw new ClinicaSemProntuarioError(companyId)
    return clinicaDoCadastro(r, unidade, decifrador)
  }

  const { data, error } = await db()
    .from('aniversariantes_clinicas')
    .select('*')
    .eq('slug', companyId)
    .maybeSingle()

  if (error) throw new Error(`Erro ao buscar clínica: ${error.message}`)
  if (!data) throw new ClinicaNaoProvisionadaError(companyId)

  const unidade = escolherUnidade(await unidadesDaClinica(data.id), unidadeId)
  if (!unidade) throw new ClinicaSemUnidadeError(companyId)
  return paraDominio(data, unidade)
}

/**
 * Só o que o cabeçalho da tela precisa mostrar.
 *
 * SUBSTITUI um `listarClinicas()` que devolvia TODAS as clínicas cadastradas,
 * sem autenticação, numa rota pública. Era o mapa que tornava o resto
 * explorável: pegava-se a lista de ids ali e passava qualquer um deles para as
 * outras rotas. Não existe caso de uso legítimo para enumerar clínicas neste
 * app — cada acesso é escopado a uma. As unidades listadas aqui são as DESTA
 * clínica, para o seletor.
 */
export async function buscarClinicaPublica(
  companyId: string,
  unidadeId: string | null = null
): Promise<ClinicaPublica> {
  if (cadastroComumLigado()) {
    // Sem decifrar nada: o cabeçalho não leva segredo.
    const r = await lerClinicaDoCadastro(clienteDoBanco(), companyId, avisar)
    const atual = escolherUnidade(porIdLocal(r), unidadeId)
    if (!atual) throw new ClinicaSemProntuarioError(companyId)
    // A conta como a requisição a trouxe: os links internos da tela a repetem
    // em `?clinica=`, e o proxy a compara com a do escopo.
    return { ...clinicaPublicaDoCadastro(r, atual), companyId }
  }

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

  const unidades = ordenarUnidades(await unidadesDaClinica(data.id))
  const atual = escolherUnidade(unidades, unidadeId)
  if (!atual) throw new ClinicaSemUnidadeError(companyId)
  return {
    id: data.id,
    companyId: data.slug,
    nome: data.nome,
    unidades: unidades.map(paraUnidade),
    unidadeAtualId: atual.id,
  }
}

// ─── Área de setup ──────────────────────────────────────────────────────────
//
// As únicas escritas deste app nestas tabelas. Quem chama é a área de setup, que
// exige a senha da equipe (ver `acesso/setup.ts`) — NUNCA uma rota do painel,
// que responde a acesso de clínica. A mesma regra de `listarTodasAsClinicas`
// vale aqui: se uma rota escopada a uma clínica precisar disto, o escopo se
// perdeu.
//
// Com o cadastro comum ligado, a área de setup só lê: as escritas abaixo
// recusam com `CadastroNoCrmError`, e a tela mostra os campos para leitura.

function unidadeParaSetup(clinica: ClinicaRow, unidade: UnidadeRow): UnidadeNoSetup {
  const cred = credenciaisDaUnidade(clinica, unidade)
  return {
    id: unidade.id,
    nome: unidade.nome,
    principal: unidade.principal,
    sistemaProntuario: cred.sistemaProntuario,
    eclinica: { tokenConfigurado: !!cred.eclinica.token, baseUrl: cred.eclinica.baseUrl },
    clinicorp: {
      usuarioApi: cred.clinicorp.usuarioApi,
      tokenConfigurado: !!cred.clinicorp.tokenApi,
      subscriberId: cred.clinicorp.subscriberId,
      baseUrl: cred.clinicorp.baseUrl,
    },
    mensageria: { from: cred.from, channelId: cred.channelId, equipeId: cred.equipeId },
  }
}

function paraSetup(row: ClinicaRow, unidades: UnidadeRow[]): ClinicaNoSetup {
  return {
    id: row.id,
    companyId: row.slug,
    nome: row.nome,
    sistemaProntuario: row.sistema_prontuario,
    timezone: row.timezone,
    criadaEm: row.created_at,
    cadastroComum: false,
    unidades: ordenarUnidades(unidades).map((u) => unidadeParaSetup(row, u)),
    foraDoPainel: [],
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
      equipeId: row.helena_department_id,
      campoNascimento: row.helena_campo_nascimento,
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
    helena_department_id: mensageria.equipeId,
    helena_campo_nascimento: mensageria.campoNascimento,
  }
}

/**
 * Traduz a recusa do Postgres.
 *
 * A regra de "credenciais completas para o sistema escolhido" NÃO é repetida em
 * TypeScript: ela vive na check constraint, e uma cópia aqui divergiria dela na
 * primeira mudança (ADR 0002). O banco recusa; aqui só se dá nome à recusa.
 * Vale para a clínica e para as unidades adicionais (mesma regra, mesmo nome
 * de constraint terminando em `credenciais_check`).
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
  return new Error(`Erro ao gravar: ${error.message}`)
}

export async function listarClinicasNoSetup(): Promise<ClinicaNoSetup[]> {
  if (cadastroComumLigado()) {
    const { resolvidas, falhas } = await lerClinicasDoCadastro(clienteDoBanco(), avisar)
    for (const f of falhas) console.error(`[cadastro] ${f.companyId} fora da lista do setup: ${f.erro.message}`)
    return resolvidas
      .map((r) => clinicaNoSetupDoCadastro(r, decifrador))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  }

  const [clinicas, unidades] = await Promise.all([
    db().from('aniversariantes_clinicas').select('*').order('nome'),
    db().from('aniversariantes_unidades').select('*'),
  ])
  if (clinicas.error) throw new Error(`Erro ao listar clínicas: ${clinicas.error.message}`)
  if (unidades.error) throw new Error(`Erro ao listar unidades: ${unidades.error.message}`)
  const porClinica = agruparPorClinica(unidades.data ?? [])
  return (clinicas.data ?? []).map((c) => paraSetup(c, porClinica.get(c.id) ?? []))
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

/**
 * Com credenciais — para mesclar edições e testar conexão. Nunca devolver ao
 * browser. Sem `unidadeId`, a principal: é o que o formulário da clínica edita.
 *
 * Diferente de `buscarClinica`, um `unidadeId` que não é desta clínica é ERRO
 * aqui: quem chama é o setup, que escolhe a unidade de propósito, e cair em
 * silêncio na principal faria "sincronizar a filial" sincronizar a matriz.
 */
export async function buscarClinicaPorId(id: string, unidadeId: string | null = null): Promise<Clinica> {
  if (cadastroComumLigado()) {
    const r = await resolvidaPorIdLocal(id)
    const unidades = porIdLocal(r)
    const unidade = unidadeId
      ? unidades.find((u) => u.id === unidadeId.toLowerCase())
      : unidades.find((u) => u.principal)
    if (!unidade) throw unidadeId ? new UnidadeNaoEncontradaError() : new ClinicaSemProntuarioError(r.clinica.company_id)
    return clinicaDoCadastro(r, unidade, decifrador)
  }

  const linha = await linhaPorId(id)
  const unidades = await unidadesDaClinica(linha.id)
  const unidade = unidadeId ? unidades.find((u) => u.id === unidadeId) : unidades.find((u) => u.principal)
  if (!unidade) throw unidadeId ? new UnidadeNaoEncontradaError() : new ClinicaSemUnidadeError(linha.slug)
  return paraDominio(linha, unidade)
}

export async function buscarClinicaNoSetup(id: string): Promise<ClinicaNoSetup> {
  if (cadastroComumLigado()) return clinicaNoSetupDoCadastro(await resolvidaPorIdLocal(id), decifrador)
  const linha = await linhaPorId(id)
  return paraSetup(linha, await unidadesDaClinica(linha.id))
}

export async function criarClinica(clinica: Clinica): Promise<ClinicaNoSetup> {
  exigirCadastroLocal()
  const { data, error } = await db()
    .from('aniversariantes_clinicas')
    .insert(paraLinha(clinica))
    .select('*')
    .single()
  if (error) throw traduzirRecusa(error)
  // A unidade principal nasce por trigger, na mesma transação do insert.
  return paraSetup(data, await unidadesDaClinica(data.id))
}

/**
 * Grava a clínica inteira por cima da linha `id`.
 *
 * `slug` fica FORA do update: o company_id é a chave que os links assinados e a
 * plataforma usam para achar a clínica — trocá-lo órfã todo link já emitido.
 * Clínica com company_id errado se corrige cadastrando de novo.
 */
export async function atualizarClinica(id: string, clinica: Clinica): Promise<ClinicaNoSetup> {
  exigirCadastroLocal()
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
  return paraSetup(data, await unidadesDaClinica(data.id))
}

// ─── Unidades adicionais ────────────────────────────────────────────────────
//
// A principal não tem CRUD próprio: ela é a clínica (credenciais na linha dela)
// e só o NOME se edita, aqui. Criar e apagar são só das adicionais.

/** O que a área de setup grava numa unidade. */
export interface DadosDaUnidade {
  nome: string
  sistemaProntuario: SistemaProntuario
  eclinica: { token: string | null; baseUrl: string }
  clinicorp: {
    usuarioApi: string | null
    tokenApi: string | null
    subscriberId: string | null
    baseUrl: string
  }
  from: string | null
  channelId: string | null
  equipeId: string | null
}

function unidadeParaLinha(dados: DadosDaUnidade): Omit<UnidadeInsert, 'clinica_id'> {
  return {
    nome: dados.nome,
    sistema_prontuario: dados.sistemaProntuario,
    eclinica_token: dados.eclinica.token,
    eclinica_base_url: dados.eclinica.baseUrl,
    clinicorp_usuario_api: dados.clinicorp.usuarioApi,
    clinicorp_token_api: dados.clinicorp.tokenApi,
    clinicorp_subscriber_id: dados.clinicorp.subscriberId,
    clinicorp_base_url: dados.clinicorp.baseUrl,
    helena_from: dados.from,
    helena_channel_id: dados.channelId,
    helena_department_id: dados.equipeId,
  }
}

async function unidadePorId(clinicaId: string, unidadeId: string): Promise<UnidadeRow> {
  if (!/^[0-9a-f-]{36}$/i.test(unidadeId)) throw new UnidadeNaoEncontradaError()
  const { data, error } = await db()
    .from('aniversariantes_unidades')
    .select('*')
    .eq('id', unidadeId)
    .eq('clinica_id', clinicaId)
    .maybeSingle()
  if (error) throw new Error(`Erro ao buscar unidade: ${error.message}`)
  if (!data) throw new UnidadeNaoEncontradaError()
  return data
}

export async function criarUnidade(clinicaId: string, dados: DadosDaUnidade): Promise<ClinicaNoSetup> {
  exigirCadastroLocal()
  const linha = await linhaPorId(clinicaId)
  const { error } = await db()
    .from('aniversariantes_unidades')
    .insert({ clinica_id: linha.id, principal: false, ...unidadeParaLinha(dados) })
  if (error) throw traduzirRecusa(error)
  return paraSetup(linha, await unidadesDaClinica(linha.id))
}

export async function atualizarUnidade(
  clinicaId: string,
  unidadeId: string,
  dados: DadosDaUnidade
): Promise<ClinicaNoSetup> {
  exigirCadastroLocal()
  const linha = await linhaPorId(clinicaId)
  const atual = await unidadePorId(linha.id, unidadeId)

  // A principal só troca de nome: as credenciais dela são as da clínica.
  const campos: Partial<UnidadeInsert> = atual.principal ? { nome: dados.nome } : unidadeParaLinha(dados)
  const { error } = await db().from('aniversariantes_unidades').update(campos).eq('id', atual.id)
  if (error) throw traduzirRecusa(error)
  return paraSetup(linha, await unidadesDaClinica(linha.id))
}

/**
 * Apaga uma unidade adicional SEM envios. Apagar leva junto modelos, cache e —
 * pelo cascade — envios; o histórico de parabéns não some por um clique.
 */
export async function removerUnidade(clinicaId: string, unidadeId: string): Promise<ClinicaNoSetup> {
  exigirCadastroLocal()
  const linha = await linhaPorId(clinicaId)
  const atual = await unidadePorId(linha.id, unidadeId)
  if (atual.principal) throw new ClinicaRecusadaError('A unidade principal não pode ser removida', 400)

  const { count, error: erroContagem } = await db()
    .from('aniversariantes_envios')
    .select('id', { count: 'exact', head: true })
    .eq('unidade_id', atual.id)
  if (erroContagem) throw new Error(`Erro ao conferir os envios da unidade: ${erroContagem.message}`)
  if ((count ?? 0) > 0) {
    throw new ClinicaRecusadaError(
      `A unidade tem ${count} envio(s) no histórico e não pode ser removida. Renomeie-a se não for mais usada.`,
      409
    )
  }

  const { error } = await db().from('aniversariantes_unidades').delete().eq('id', atual.id)
  if (error) throw new Error(`Erro ao remover unidade: ${error.message}`)
  return paraSetup(linha, await unidadesDaClinica(linha.id))
}

/**
 * Os company_ids já cadastrados — para a fila de interessados saber quem já
 * virou clínica. Só o identificador; nenhuma credencial sai daqui. Com o
 * cadastro comum, as contas com o produto ligado.
 */
export async function companyIdsCadastrados(): Promise<Set<string>> {
  if (cadastroComumLigado()) return contasComOProdutoLigado(clienteDoBanco())

  const { data, error } = await db()
    .from('aniversariantes_clinicas')
    .select('slug')
    .returns<Pick<ClinicaRow, 'slug'>[]>()

  if (error) throw new Error(`Erro ao listar clínicas: ${error.message}`)
  return new Set((data ?? []).map((c) => c.slug.toLowerCase()))
}
