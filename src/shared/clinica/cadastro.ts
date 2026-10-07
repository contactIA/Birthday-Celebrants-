import type {
  ClienteDoBanco,
  ClinicaDoCadastroRow,
  ClinicaRow,
  OrigemDaUnidadeRow,
  ProdutoDoCadastroRow,
  UnidadeDoCadastroRow,
  UnidadeRow,
} from '@/shared/db'
import { colunasDoCadastro } from '@/shared/contrato'
import { ClinicaNaoProvisionadaError } from './modelo'
import {
  PRODUTO,
  ancoraDaClinica,
  ancoraDaUnidade,
  campoNascimentoDaConfiguracao,
  clinicasComOProdutoLigado,
  mapearUnidades,
  unidadesDoPainel,
  unidadesForaDoPainel,
  type ClinicaResolvida,
  type UnidadeMapeada,
} from './montagem'

// A leitura da clínica pelo cadastro comum dos produtos (ADR 0014 do CRM,
// contactIA/CRM-Contact-IA#215), usada pelo acessor (`repositorio.ts`) quando o
// CADASTRO_UNIFICADO está ligado.
//
//   · Lê as visões do esquema `cadastro` pelo supabase-js, com a service role,
//     como o app já lê o banco. Só as colunas do contrato (`shared/contrato.ts`).
//   · Garante as linhas locais (âncoras) que as chaves estrangeiras dos modelos,
//     dos envios e do cache exigem: cria a clínica e as unidades que faltam,
//     com o id local da regra de `montagem.ts`.
//   · Não decifra nada: devolve a clínica resolvida, e quem precisa de segredo
//     (o painel, os crons) monta a `Clinica` com o decifrador.
//
// O cliente entra por parâmetro: os testes passam um falso no lugar.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Para onde vão os avisos que não impedem a leitura (origem ignorada, id repetido). */
export type Avisar = (texto: string) => void

interface Visoes {
  clinicas: ClinicaDoCadastroRow[]
  produtos: ProdutoDoCadastroRow[]
  unidades: UnidadeDoCadastroRow[]
  origens: OrigemDaUnidadeRow[]
}

type ClinicaLocal = Pick<ClinicaRow, 'id' | 'slug' | 'created_at'>
type UnidadeLocal = Pick<UnidadeRow, 'id' | 'clinica_id'>

function exigir<T>(oQue: string, r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(`cadastro: erro ao ler ${oQue}: ${r.error.message}`)
  return r.data ?? ([] as T)
}

/**
 * As quatro visões, de uma conta (`companyId`) ou de todas (`null`). Produtos e
 * origens já vêm filtrados pelo produto deste app.
 */
async function lerVisoes(cliente: ClienteDoBanco, companyId: string | null): Promise<Visoes> {
  const cadastro = cliente.schema('cadastro')
  let clinicas = cadastro.from('clinicas').select(colunasDoCadastro('clinicas'))
  let produtos = cadastro.from('produtos').select(colunasDoCadastro('produtos')).eq('produto', PRODUTO)
  let unidades = cadastro.from('unidades').select(colunasDoCadastro('unidades'))
  let origens = cadastro.from('unidade_origens').select(colunasDoCadastro('unidade_origens')).eq('origem', PRODUTO)
  if (companyId) {
    clinicas = clinicas.eq('company_id', companyId)
    produtos = produtos.eq('company_id', companyId)
    unidades = unidades.eq('company_id', companyId)
    origens = origens.eq('company_id', companyId)
  }
  // O parser de tipos do supabase-js não infere a projeção de uma lista de
  // colunas montada em tempo de execução: o tipo da linha vem do contrato.
  const [c, p, u, o] = await Promise.all([
    clinicas.overrideTypes<ClinicaDoCadastroRow[], { merge: false }>(),
    produtos.overrideTypes<ProdutoDoCadastroRow[], { merge: false }>(),
    unidades.overrideTypes<UnidadeDoCadastroRow[], { merge: false }>(),
    origens.overrideTypes<OrigemDaUnidadeRow[], { merge: false }>(),
  ])
  return {
    clinicas: exigir('cadastro.clinicas', c),
    produtos: exigir('cadastro.produtos', p),
    unidades: exigir('cadastro.unidades', u),
    origens: exigir('cadastro.unidade_origens', o),
  }
}

/**
 * As clínicas locais, de uma conta ou de todas. Pela conta sem diferença de
 * maiúsculas: o `slug` é texto, e uma clínica antiga gravada com outra caixa
 * não pode virar uma segunda linha.
 */
async function lerClinicasLocais(cliente: ClienteDoBanco, companyId: string | null): Promise<ClinicaLocal[]> {
  let consulta = cliente.schema('aniversariantes').from('aniversariantes_clinicas').select('id, slug, created_at')
  // UUID não tem `%` nem `_`: o ilike aqui é igualdade sem caixa, nunca padrão.
  if (companyId) consulta = consulta.ilike('slug', companyId)
  return exigir('aniversariantes_clinicas', await consulta.overrideTypes<ClinicaLocal[], { merge: false }>())
}

async function lerUnidadesLocais(cliente: ClienteDoBanco, clinicaIds: string[] | null): Promise<UnidadeLocal[]> {
  if (clinicaIds?.length === 0) return []
  let consulta = cliente.schema('aniversariantes').from('aniversariantes_unidades').select('id, clinica_id')
  if (clinicaIds) consulta = consulta.in('clinica_id', clinicaIds)
  return exigir('aniversariantes_unidades', await consulta.overrideTypes<UnidadeLocal[], { merge: false }>())
}

/** A clínica local da conta: a que existe, ou uma âncora criada agora. */
async function garantirClinicaLocal(
  cliente: ClienteDoBanco,
  clinica: ClinicaDoCadastroRow,
  locais: ClinicaLocal[]
): Promise<{ local: ClinicaLocal; criada: boolean }> {
  const conta = clinica.company_id.toLowerCase()
  const daConta = locais.filter((l) => l.slug.toLowerCase() === conta)
  // Duas linhas com caixas diferentes: a gravada em minúsculas, que é a forma
  // que o setup sempre gravou.
  const achada = daConta.find((l) => l.slug === conta) ?? daConta[0]
  if (achada) return { local: achada, criada: false }

  const { data, error } = await cliente
    .schema('aniversariantes')
    .from('aniversariantes_clinicas')
    .insert(ancoraDaClinica(clinica))
    .select('id, slug, created_at')
    .single<ClinicaLocal>()
  if (data && !error) return { local: data, criada: true }

  // 23505: outra requisição criou a mesma clínica no mesmo instante.
  if (error?.code === '23505') {
    const [relida] = await lerClinicasLocais(cliente, conta)
    if (relida) return { local: relida, criada: false }
  }
  throw new Error(`cadastro: não foi possível criar a clínica local da conta ${conta}: ${error?.message ?? 'sem resposta'}`)
}

/** Cria as unidades locais que faltam, com o id da regra. Uma por vez: são poucas. */
async function garantirUnidadesLocais(
  cliente: ClienteDoBanco,
  clinicaIdLocal: string,
  unidades: UnidadeMapeada[]
): Promise<void> {
  const tabela = () => cliente.schema('aniversariantes').from('aniversariantes_unidades')
  for (const u of unidades.filter((x) => x.idLocal.criar)) {
    const { error } = await tabela().insert(ancoraDaUnidade(u, clinicaIdLocal))
    if (!error) continue
    if (error.code !== '23505') {
      throw new Error(`cadastro: não foi possível criar a unidade local ${u.idLocal.id}: ${error.message}`)
    }
    // O id já existe. Serve se for desta clínica (outra requisição a criou
    // agora); de outra clínica, nunca: o histórico de uma apareceria na outra.
    const { data, error: erroAoReler } = await tabela()
      .select('id, clinica_id')
      .eq('id', u.idLocal.id)
      .maybeSingle<UnidadeLocal>()
    if (erroAoReler) throw new Error(`cadastro: erro ao conferir a unidade local ${u.idLocal.id}: ${erroAoReler.message}`)
    if (data?.clinica_id !== clinicaIdLocal) {
      throw new Error(`cadastro: a unidade ${u.idLocal.id} já existe noutra clínica deste app`)
    }
  }
}

/** Uma clínica que não pôde ser resolvida, e por quê (para o log). */
export interface FalhaDoCadastro {
  companyId: string
  erro: Error
}

/**
 * Casa cada clínica do cadastro, com o produto ligado, com as linhas locais, e
 * cria o que faltar. Uma clínica que falha não derruba as outras: vai para
 * `falhas`.
 */
async function resolver(
  cliente: ClienteDoBanco,
  visoes: Visoes,
  clinicasLocais: ClinicaLocal[],
  unidadesLocais: UnidadeLocal[],
  avisar: Avisar
): Promise<{ resolvidas: ClinicaResolvida[]; falhas: FalhaDoCadastro[] }> {
  const ligadas = clinicasComOProdutoLigado(visoes.produtos)
  const resolvidas: ClinicaResolvida[] = []
  const falhas: FalhaDoCadastro[] = []

  for (const clinica of visoes.clinicas.filter((c) => ligadas.has(c.id))) {
    try {
      const { local, criada } = await garantirClinicaLocal(cliente, clinica, clinicasLocais)
      // A clínica recém-criada só tem a principal que o gatilho fez, com id
      // novo: nenhuma origem aponta para ela, então não entra no conjunto.
      const idsLocais = new Set(
        criada ? [] : unidadesLocais.filter((u) => u.clinica_id === local.id).map((u) => u.id.toLowerCase())
      )
      const doCadastro = visoes.unidades.filter((u) => u.clinica_id === clinica.id)
      const origens = visoes.origens.filter((o) => o.clinica_id === clinica.id)
      const { unidades, avisos } = mapearUnidades(unidadesDoPainel(doCadastro), origens, idsLocais)
      for (const aviso of avisos) avisar(`${clinica.company_id}: ${aviso}`)
      await garantirUnidadesLocais(cliente, local.id, unidades)

      const produto = visoes.produtos.find((p) => p.clinica_id === clinica.id)
      resolvidas.push({
        clinica,
        idLocal: local.id,
        criadaEm: local.created_at,
        campoNascimento: campoNascimentoDaConfiguracao(produto?.configuracao),
        unidades,
        foraDoPainel: unidadesForaDoPainel(doCadastro),
      })
    } catch (err) {
      falhas.push({ companyId: clinica.company_id, erro: err instanceof Error ? err : new Error(String(err)) })
    }
  }
  return { resolvidas, falhas }
}

/**
 * A clínica da conta, resolvida. Fora do cadastro, ou sem o produto
 * aniversariantes ligado: `ClinicaNaoProvisionadaError`, como hoje para a
 * clínica que não está na tabela.
 */
export async function lerClinicaDoCadastro(
  cliente: ClienteDoBanco,
  companyId: string,
  avisar: Avisar
): Promise<ClinicaResolvida> {
  // Um id que não é UUID nem chega ao banco: a visão compara como uuid, e o
  // erro de tipo viraria 500 em vez de "não provisionada".
  if (!UUID.test(companyId)) throw new ClinicaNaoProvisionadaError(companyId)

  const [visoes, clinicasLocais] = await Promise.all([
    lerVisoes(cliente, companyId),
    lerClinicasLocais(cliente, companyId),
  ])
  const unidadesLocais = await lerUnidadesLocais(
    cliente,
    clinicasLocais.map((c) => c.id)
  )
  const { resolvidas, falhas } = await resolver(cliente, visoes, clinicasLocais, unidadesLocais, avisar)
  if (falhas[0]) throw falhas[0].erro
  const [resolvida] = resolvidas
  if (!resolvida) throw new ClinicaNaoProvisionadaError(companyId)
  return resolvida
}

/**
 * Todas as clínicas com o produto ligado, resolvidas. Para os crons e a lista do
 * setup: quem falha vai para `falhas`, e as outras seguem.
 */
export async function lerClinicasDoCadastro(
  cliente: ClienteDoBanco,
  avisar: Avisar
): Promise<{ resolvidas: ClinicaResolvida[]; falhas: FalhaDoCadastro[] }> {
  const [visoes, clinicasLocais, unidadesLocais] = await Promise.all([
    lerVisoes(cliente, null),
    lerClinicasLocais(cliente, null),
    lerUnidadesLocais(cliente, null),
  ])
  return resolver(cliente, visoes, clinicasLocais, unidadesLocais, avisar)
}

/**
 * As contas com o produto ligado, em minúsculas. Só o identificador: para a
 * fila de interessados saber quem já tem o painel, sem criar linha nenhuma.
 */
export async function contasComOProdutoLigado(cliente: ClienteDoBanco): Promise<Set<string>> {
  const resposta = await cliente
    .schema('cadastro')
    .from('produtos')
    .select('company_id')
    .eq('produto', PRODUTO)
    .eq('ligado', true)
    .overrideTypes<Pick<ProdutoDoCadastroRow, 'company_id'>[], { merge: false }>()
  return new Set(exigir('cadastro.produtos', resposta).map((p) => p.company_id.toLowerCase()))
}

/**
 * A conta (o `slug`) de uma clínica local, pelo id dela. É a porta de entrada
 * do setup, que navega pelos ids locais. `null` = não existe.
 */
export async function contaDaClinicaLocal(cliente: ClienteDoBanco, idLocal: string): Promise<string | null> {
  const { data, error } = await cliente
    .schema('aniversariantes')
    .from('aniversariantes_clinicas')
    .select('slug')
    .eq('id', idLocal)
    .maybeSingle<Pick<ClinicaRow, 'slug'>>()
  if (error) throw new Error(`cadastro: erro ao ler aniversariantes_clinicas: ${error.message}`)
  return data?.slug ?? null
}
