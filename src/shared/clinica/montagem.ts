import type {
  ClinicaDoCadastroRow,
  ClinicaInsert,
  OrigemDaUnidadeRow,
  ProdutoDoCadastroRow,
  SistemaProntuario,
  UnidadeDoCadastroRow,
  UnidadeInsert,
} from '@/shared/db'
import {
  decifrarCredenciaisDoCadastro,
  decifrarDoCadastro,
  type CredenciaisDoClinicorpNoCadastro,
  type CredenciaisDoEclinicaNoCadastro,
} from './decifrador-do-cadastro'
import {
  BASE_URL_PADRAO,
  type Clinica,
  type ClinicaNoSetup,
  type ClinicaPublica,
  type MotivoForaDoPainel,
  type Unidade,
  type UnidadeForaDoPainel,
  type UnidadeNoSetup,
} from './modelo'
import { ordenarUnidades } from './resolver'

// Montar a clínica deste app a partir das visões do cadastro comum (ADR 0014 do
// CRM, contactIA/CRM-Contact-IA#215). Função pura: as linhas entram por
// parâmetro, e o decifrador também. A leitura do banco e a criação das linhas
// locais moram em `cadastro.ts`.
//
// O ponto delicado é o ID DA UNIDADE. Os modelos, os envios e o cache deste app
// apontam para aniversariantes_unidades.id (chave estrangeira), não para a
// unidade do CRM. A regra está em `idLocalDaUnidade`.

/** O produto deste app no cadastro comum. */
export const PRODUTO = 'aniversariantes'

/** Abre os segredos do cadastro. Erro quando não abre; nunca um texto trocado. */
export interface Decifrador {
  texto(guardado: string): string
  clinicorp(guardado: string): CredenciaisDoClinicorpNoCadastro
  eclinica(guardado: string): CredenciaisDoEclinicaNoCadastro
}

/**
 * O decifrador copiado do CRM (`decifrador-do-cadastro.ts`) com uma chave. A
 * chave é pedida só quando um segredo se abre: sem a CADASTRO_CHAVE_CIFRAGEM, o
 * que não tem segredo (o cabeçalho do painel, a lista do setup) segue de pé.
 */
export function decifradorCom(chave: () => Buffer): Decifrador {
  return {
    texto: (guardado) => decifrarDoCadastro(guardado, chave()),
    clinicorp: (guardado) => decifrarCredenciaisDoCadastro('clinicorp', guardado, chave()),
    eclinica: (guardado) => decifrarCredenciaisDoCadastro('eclinica', guardado, chave()),
  }
}

// ─── Quem entra ─────────────────────────────────────────────────────────────

/** As clínicas com o produto aniversariantes ligado. Só elas entram no app. */
export function clinicasComOProdutoLigado(produtos: ProdutoDoCadastroRow[]): Set<string> {
  return new Set(produtos.filter((p) => p.produto === PRODUTO && p.ligado).map((p) => p.clinica_id))
}

/**
 * O campo do contato que recebe a data de nascimento, da configuração do
 * produto (`{ campoNascimento }`). Fora do formato, nulo: não preencher é o que
 * o app já faz sem o campo.
 */
export function campoNascimentoDaConfiguracao(configuracao: unknown): string | null {
  if (typeof configuracao !== 'object' || configuracao === null || Array.isArray(configuracao)) return null
  const campo = (configuracao as Record<string, unknown>).campoNascimento
  return typeof campo === 'string' && campo.trim() ? campo.trim() : null
}

/** Por que a unidade do cadastro não entra no painel; `null` = entra. */
export function motivoForaDoPainel(u: UnidadeDoCadastroRow): MotivoForaDoPainel | null {
  if (!u.ativa) return 'inativa'
  if (!u.prontuario_sistema || !u.prontuario_credenciais_cifradas) return 'sem_prontuario'
  return null
}

export interface UnidadeNoPainel {
  unidade: UnidadeDoCadastroRow
  /** A principal NESTE app (ver `unidadesDoPainel`). */
  principal: boolean
}

/**
 * As unidades que o painel mostra: as ativas com prontuário (sem prontuário não
 * há de onde ler aniversariantes). Principal primeiro, depois por nome.
 *
 * O app precisa de exatamente uma principal (é a unidade de quem ainda não
 * escolheu). É a principal do cadastro; se ela ficou de fora por não ter
 * prontuário, a primeira em ordem alfabética faz o papel dela aqui.
 */
export function unidadesDoPainel(unidades: UnidadeDoCadastroRow[]): UnidadeNoPainel[] {
  const entram = unidades.filter((u) => motivoForaDoPainel(u) === null)
  const temPrincipal = entram.some((u) => u.principal)
  const ordenadas = ordenarUnidades(entram.map((u) => ({ nome: u.nome, principal: u.principal, unidade: u })))
  return ordenadas.map((u, i) => ({ unidade: u.unidade, principal: temPrincipal ? u.principal : i === 0 }))
}

export function unidadesForaDoPainel(unidades: UnidadeDoCadastroRow[]): UnidadeForaDoPainel[] {
  return ordenarUnidades(unidades)
    .map((u) => ({ nome: u.nome, motivo: motivoForaDoPainel(u) }))
    .filter((u): u is UnidadeForaDoPainel => u.motivo !== null)
}

// ─── O id da unidade ────────────────────────────────────────────────────────

export interface IdLocal {
  /** O id da unidade neste app: o que os modelos, os envios e o cache usam. */
  id: string
  /** De onde veio: o id que a unidade tinha aqui (a importação) ou o do cadastro. */
  de: 'origem' | 'cadastro'
  /** A linha local ainda não existe e precisa ser criada (só quando `de` é 'cadastro'). */
  criar: boolean
}

/**
 * O id local de uma unidade do cadastro.
 *
 *  1. A unidade veio deste app pela importação de partida (#214): vale o id que
 *     ela tinha aqui, o `id_na_origem` de cadastro.unidade_origens com a origem
 *     'aniversariantes'. É o que mantém os modelos, os envios e o cache dela.
 *     Só vale se a linha local existe E é desta clínica: um id de outra clínica
 *     nunca é usado, para dado de uma não aparecer na outra.
 *  2. Senão (a unidade nasceu depois, no setup do CRM, ou a de origem sumiu
 *     daqui): o próprio id da unidade do cadastro, e a linha local é criada com
 *     ele. O id não muda depois: nem trocar a principal nem renomear a unidade
 *     mexe nele.
 *
 * Mais de uma origem para a mesma unidade (a importação juntou duas): a
 * primeira, em ordem de id, que existe nesta clínica.
 *
 * `idsLocais`: os ids das unidades locais DESTA clínica, em minúsculas.
 */
export function idLocalDaUnidade(
  unidadeId: string,
  origens: OrigemDaUnidadeRow[],
  idsLocais: ReadonlySet<string>
): IdLocal {
  const candidatos = origens
    .filter((o) => o.origem === PRODUTO && o.unidade_id.toLowerCase() === unidadeId.toLowerCase())
    .map((o) => o.id_na_origem.trim().toLowerCase())
    .sort()
  const daOrigem = candidatos.find((id) => idsLocais.has(id))
  if (daOrigem) return { id: daOrigem, de: 'origem', criar: false }
  const doCadastro = unidadeId.toLowerCase()
  return { id: doCadastro, de: 'cadastro', criar: !idsLocais.has(doCadastro) }
}

export interface UnidadeMapeada extends UnidadeNoPainel {
  idLocal: IdLocal
}

/**
 * O id local de cada unidade do painel, com os avisos para o log: a origem que
 * aponta para unidade que não é desta clínica, e o id repetido entre duas
 * unidades (que cai no id do cadastro, para nunca juntar o histórico de duas).
 */
export function mapearUnidades(
  painel: UnidadeNoPainel[],
  origens: OrigemDaUnidadeRow[],
  idsLocais: ReadonlySet<string>
): { unidades: UnidadeMapeada[]; avisos: string[] } {
  const avisos: string[] = []
  const usados = new Set<string>()
  const unidades = painel.map((u): UnidadeMapeada => {
    let idLocal = idLocalDaUnidade(u.unidade.id, origens, idsLocais)
    if (usados.has(idLocal.id)) {
      avisos.push(`a unidade ${u.unidade.id} repete o id local ${idLocal.id}; vale o id do cadastro`)
      const doCadastro = u.unidade.id.toLowerCase()
      idLocal = { id: doCadastro, de: 'cadastro', criar: !idsLocais.has(doCadastro) }
    }
    const ignoradas = origens.filter(
      (o) =>
        o.origem === PRODUTO &&
        o.unidade_id.toLowerCase() === u.unidade.id.toLowerCase() &&
        !idsLocais.has(o.id_na_origem.trim().toLowerCase())
    )
    for (const o of ignoradas) {
      avisos.push(`a origem ${o.id_na_origem} da unidade ${u.unidade.id} não é uma unidade desta clínica aqui; ignorada`)
    }
    usados.add(idLocal.id)
    return { ...u, idLocal }
  })
  return { unidades, avisos }
}

// ─── As linhas locais (âncoras) ─────────────────────────────────────────────
//
// Os modelos, os envios e o cache têm chave estrangeira para
// aniversariantes_clinicas e aniversariantes_unidades. Clínica ou unidade que
// nasceu no cadastro comum ganha aqui uma linha só para ancorar essas chaves.
//
// As colunas de credencial dessas linhas ficam sem uso enquanto a leitura do
// cadastro estiver ligada. Onde o banco exige valor (o token da plataforma e a
// credencial do sistema escolhido, pelas check constraints), vai texto vazio:
// segredo nenhum é copiado para fora do cadastro.

/** O banco aceita nome de unidade de 1 a 120 caracteres (e o gatilho da principal copia o da clínica). */
function nomeDaAncora(nome: string, reserva: string): string {
  return (nome.trim() || reserva).slice(0, 120)
}

/** A linha de aniversariantes_clinicas de uma clínica que só existe no cadastro. */
export function ancoraDaClinica(c: ClinicaDoCadastroRow): ClinicaInsert {
  return {
    slug: c.company_id.toLowerCase(),
    nome: nomeDaAncora(c.nome, c.company_id),
    timezone: c.fuso_horario,
    helena_token: '',
    helena_from: null,
    helena_channel_id: null,
    helena_department_id: null,
    helena_campo_nascimento: null,
    sistema_prontuario: 'eclinica',
    eclinica_token: '',
    eclinica_base_url: BASE_URL_PADRAO.eclinica,
    clinicorp_usuario_api: null,
    clinicorp_token_api: null,
    clinicorp_subscriber_id: null,
    clinicorp_base_url: BASE_URL_PADRAO.clinicorp,
  }
}

/**
 * A linha de aniversariantes_unidades de uma unidade do cadastro, com o id local
 * (`idLocalDaUnidade`). Nunca é a principal daqui: a principal local é a da
 * linha da clínica (índice único), e com a leitura ligada quem diz qual é a
 * principal é o cadastro.
 */
export function ancoraDaUnidade(u: UnidadeMapeada, clinicaIdLocal: string): UnidadeInsert & { id: string } {
  const sistema: SistemaProntuario = u.unidade.prontuario_sistema ?? 'eclinica'
  const vazioSe = (s: SistemaProntuario) => (sistema === s ? '' : null)
  return {
    id: u.idLocal.id,
    clinica_id: clinicaIdLocal,
    nome: nomeDaAncora(u.unidade.nome, 'Unidade'),
    principal: false,
    sistema_prontuario: sistema,
    eclinica_token: vazioSe('eclinica'),
    eclinica_base_url: null,
    clinicorp_usuario_api: vazioSe('clinicorp'),
    clinicorp_token_api: vazioSe('clinicorp'),
    clinicorp_subscriber_id: vazioSe('clinicorp'),
    clinicorp_base_url: null,
    helena_from: null,
    helena_channel_id: null,
    helena_department_id: null,
  }
}

// ─── A clínica montada ──────────────────────────────────────────────────────

/** A clínica do cadastro já casada com as linhas locais deste app. */
export interface ClinicaResolvida {
  clinica: ClinicaDoCadastroRow
  /** aniversariantes_clinicas.id: a chave dos modelos, dos envios e do cache. */
  idLocal: string
  /** aniversariantes_clinicas.created_at. */
  criadaEm: string
  campoNascimento: string | null
  /** Principal primeiro. Pode ser vazia: nenhuma unidade ativa com prontuário. */
  unidades: UnidadeMapeada[]
  foraDoPainel: UnidadeForaDoPainel[]
}

/** Abre um segredo; o erro diz o que falhou, nunca o valor. */
function abrir<T>(oQue: string, fn: () => T): T {
  try {
    return fn()
  } catch (err) {
    // O JSON.parse cita um pedaço do texto na mensagem: com credencial dentro,
    // não pode ir para o log.
    const motivo = err instanceof SyntaxError ? 'o conteúdo não é um JSON' : (err as Error).message
    throw new Error(`cadastro: não foi possível abrir ${oQue} (${motivo})`)
  }
}

function paraUnidade(u: UnidadeMapeada): Unidade {
  return { id: u.idLocal.id, nome: u.unidade.nome, principal: u.principal }
}

/** As credenciais do prontuário no formato da `Clinica`, com o padrão no sistema que a unidade não usa. */
function prontuarioDaUnidade(
  u: UnidadeDoCadastroRow,
  decifrador: Decifrador
): Pick<Clinica, 'sistemaProntuario'> & Pick<Clinica['credenciais'], 'eclinica' | 'clinicorp'> {
  const sistema = u.prontuario_sistema as SistemaProntuario
  const guardado = u.prontuario_credenciais_cifradas as string
  const oQue = `as credenciais do prontuário da unidade ${u.id}`
  const vazio = {
    eclinica: { token: null, baseUrl: BASE_URL_PADRAO.eclinica },
    clinicorp: { usuarioApi: null, tokenApi: null, subscriberId: null, baseUrl: BASE_URL_PADRAO.clinicorp },
  }
  if (sistema === 'eclinica') {
    const c = abrir(oQue, () => decifrador.eclinica(guardado))
    return { ...vazio, sistemaProntuario: 'eclinica', eclinica: { token: c.token, baseUrl: c.baseUrl } }
  }
  const c = abrir(oQue, () => decifrador.clinicorp(guardado))
  return {
    ...vazio,
    sistemaProntuario: 'clinicorp',
    clinicorp: { usuarioApi: c.usuario, tokenApi: c.token, subscriberId: c.subscriberId, baseUrl: c.baseUrl },
  }
}

/**
 * A `Clinica` de hoje, no contexto de uma unidade, montada do cadastro:
 *  · da clínica: o nome, o fuso e o token da plataforma (decifrado);
 *  · da configuração do produto: o campo da data de nascimento;
 *  · da unidade: o prontuário (decifrado), o `from` (o número do canal de
 *    envio), o id do canal e a equipe.
 * Os ids são os locais (ver `idLocalDaUnidade`).
 *
 * Sem token no cadastro, o token fica vazio: o painel lista os aniversariantes,
 * e agendar falha na plataforma, como falharia com o token errado.
 */
export function clinicaDoCadastro(r: ClinicaResolvida, u: UnidadeMapeada, decifrador: Decifrador): Clinica {
  const prontuario = prontuarioDaUnidade(u.unidade, decifrador)
  const guardado = r.clinica.token_plataforma_cifrado
  const token = guardado
    ? abrir(`o token da plataforma da clínica ${r.clinica.company_id}`, () => decifrador.texto(guardado))
    : ''
  return {
    id: r.idLocal,
    companyId: r.clinica.company_id.toLowerCase(),
    nome: r.clinica.nome,
    unidade: paraUnidade(u),
    sistemaProntuario: prontuario.sistemaProntuario,
    timezone: r.clinica.fuso_horario,
    credenciais: {
      eclinica: prontuario.eclinica,
      clinicorp: prontuario.clinicorp,
      mensageria: {
        token,
        from: u.unidade.canal_envio_numero,
        channelId: u.unidade.canal_envio_id,
        equipeId: u.unidade.equipe_envio_id,
        campoNascimento: r.campoNascimento,
      },
    },
  }
}

/** O cabeçalho do painel: sem segredo nenhum, e sem decifrar nada. */
export function clinicaPublicaDoCadastro(r: ClinicaResolvida, atual: UnidadeMapeada): ClinicaPublica {
  return {
    id: r.idLocal,
    companyId: r.clinica.company_id.toLowerCase(),
    nome: r.clinica.nome,
    unidades: r.unidades.map(paraUnidade),
    unidadeAtualId: atual.idLocal.id,
  }
}

/**
 * Uma unidade como o setup a mostra. Abre as credenciais só para mostrar o que
 * não é segredo (o usuário da API e o subscriber id); se não abrirem (chave
 * errada ou ausente), a tela diz isso em vez de cair inteira.
 */
function unidadeNoSetup(u: UnidadeMapeada, decifrador: Decifrador): UnidadeNoSetup {
  const base = {
    id: u.idLocal.id,
    nome: u.unidade.nome,
    principal: u.principal,
    mensageria: { from: u.unidade.canal_envio_numero, channelId: u.unidade.canal_envio_id, equipeId: u.unidade.equipe_envio_id },
  }
  try {
    const p = prontuarioDaUnidade(u.unidade, decifrador)
    return {
      ...base,
      sistemaProntuario: p.sistemaProntuario,
      eclinica: { tokenConfigurado: !!p.eclinica.token, baseUrl: p.eclinica.baseUrl },
      clinicorp: {
        usuarioApi: p.clinicorp.usuarioApi,
        tokenConfigurado: !!p.clinicorp.tokenApi,
        subscriberId: p.clinicorp.subscriberId,
        baseUrl: p.clinicorp.baseUrl,
      },
    }
  } catch {
    const sistema = u.unidade.prontuario_sistema as SistemaProntuario
    return {
      ...base,
      sistemaProntuario: sistema,
      eclinica: { tokenConfigurado: sistema === 'eclinica', baseUrl: BASE_URL_PADRAO.eclinica },
      clinicorp: { usuarioApi: null, tokenConfigurado: sistema === 'clinicorp', subscriberId: null, baseUrl: BASE_URL_PADRAO.clinicorp },
      credenciaisIlegiveis: true,
    }
  }
}

/**
 * A clínica do cadastro como o setup deste app a mostra, só para leitura. Os
 * campos da clínica (prontuário e remetente) são os da principal, como na
 * tabela local; sem unidade no painel, ficam vazios.
 */
export function clinicaNoSetupDoCadastro(r: ClinicaResolvida, decifrador: Decifrador): ClinicaNoSetup {
  const unidades = r.unidades.map((u) => unidadeNoSetup(u, decifrador))
  const principal = unidades.find((u) => u.principal)
  return {
    id: r.idLocal,
    companyId: r.clinica.company_id.toLowerCase(),
    nome: r.clinica.nome,
    sistemaProntuario: principal?.sistemaProntuario ?? null,
    timezone: r.clinica.fuso_horario,
    criadaEm: r.criadaEm,
    cadastroComum: true,
    unidades,
    foraDoPainel: r.foraDoPainel,
    eclinica: principal?.eclinica ?? { tokenConfigurado: false, baseUrl: BASE_URL_PADRAO.eclinica },
    clinicorp: principal?.clinicorp ?? {
      usuarioApi: null,
      tokenConfigurado: false,
      subscriberId: null,
      baseUrl: BASE_URL_PADRAO.clinicorp,
    },
    mensageria: {
      tokenConfigurado: !!r.clinica.token_plataforma_cifrado,
      from: principal?.mensageria.from ?? null,
      channelId: principal?.mensageria.channelId ?? null,
      equipeId: principal?.mensageria.equipeId ?? null,
      campoNascimento: r.campoNascimento,
    },
  }
}
