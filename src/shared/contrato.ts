import type {
  ClinicaDoCadastroRow,
  ClinicaRow,
  EnvioRow,
  InteressadoRow,
  OrigemDaUnidadeRow,
  PacienteCacheRow,
  ProdutoDoCadastroRow,
  TemplateRow,
  UnidadeDoCadastroRow,
  UnidadeRow,
} from './db'

// O contrato de schema: as colunas de que o código DEPENDE, por tabela.
//
// POR QUE EXISTE. O ADR 0002 decidiu fazer um teste de contrato — o Clinic
// Control também escreve em `aniversariantes_clinicas`, e uma coluna removida
// ou renomeada do lado de lá só apareceria como erro em produção. O script
// `scripts/verificar-contrato.mjs` compara esta lista com o banco real, e o
// `deploy.sh` o roda antes de cada build: contrato quebrado não sobe.
//
// POR QUE EM TYPESCRIPT, e não num JSON: as verificações abaixo fazem o
// COMPILADOR exigir que cada lista seja exatamente as chaves da linha
// correspondente em `db.ts`. Mudou um tipo de linha e esqueceu daqui (ou o
// contrário), o `tsc` do CI falha. Sem isso, seria uma terceira cópia do
// schema — além da migration e dos tipos — esperando para divergir.
//
// Este arquivo só pode ter `import type`: o script o importa direto pelo Node
// (type stripping), onde um import de valor com alias `@/` quebraria.

export const CONTRATO = {
  aniversariantes_clinicas: [
    'id',
    'slug',
    'nome',
    'eclinica_token',
    'eclinica_base_url',
    'helena_token',
    'helena_channel_id',
    'helena_from',
    'helena_department_id',
    'helena_campo_nascimento',
    'timezone',
    'created_at',
    'sistema_prontuario',
    'clinicorp_usuario_api',
    'clinicorp_token_api',
    'clinicorp_subscriber_id',
    'clinicorp_base_url',
  ],
  aniversariantes_unidades: [
    'id',
    'clinica_id',
    'nome',
    'principal',
    'sistema_prontuario',
    'eclinica_token',
    'eclinica_base_url',
    'clinicorp_usuario_api',
    'clinicorp_token_api',
    'clinicorp_subscriber_id',
    'clinicorp_base_url',
    'helena_from',
    'helena_channel_id',
    'helena_department_id',
    'created_at',
  ],
  aniversariantes_templates: [
    'id',
    'clinica_id',
    'unidade_id',
    'helena_template_id',
    'nome',
    'param_mapping',
    'dia_envio',
    'horario_envio',
    'is_default',
    'ativo',
    'created_at',
    'updated_at',
  ],
  aniversariantes_envios: [
    'id',
    'clinica_id',
    'unidade_id',
    'template_id',
    'paciente_id_eclinica',
    'paciente_nome',
    'paciente_telefone',
    'data_nascimento',
    'ano',
    'scheduled_message_id',
    'status',
    'scheduled_for',
    'created_at',
  ],
  aniversariantes_pacientes_cache: [
    'id',
    'clinica_id',
    'unidade_id',
    'paciente_id',
    'nome',
    'telefone',
    'datanascimento',
    'mes_aniversario',
    'dia_aniversario',
    'situacao',
    'synced_at',
  ],
  aniversariantes_interessados: [
    'id',
    'company_id',
    'nome_clinica',
    'telefone',
    'sistema_prontuario',
    'sistema_outro',
    'modelo_mensagem',
    'quer_midia',
    'consentimento_em',
    'created_at',
    'updated_at',
    'status',
  ],
} as const

// ─── Verificação em tempo de compilação ─────────────────────────────────────
// `Igual<A, B>` só é `true` quando os dois conjuntos de chaves são idênticos —
// falta de um lado OU sobra do outro vira erro de tipo aqui.
type Igual<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
type Colunas<T extends keyof typeof CONTRATO> = (typeof CONTRATO)[T][number]

const clinicas: Igual<Colunas<'aniversariantes_clinicas'>, keyof ClinicaRow> = true
const unidades: Igual<Colunas<'aniversariantes_unidades'>, keyof UnidadeRow> = true
const templates: Igual<Colunas<'aniversariantes_templates'>, keyof TemplateRow> = true
const envios: Igual<Colunas<'aniversariantes_envios'>, keyof EnvioRow> = true
const cache: Igual<Colunas<'aniversariantes_pacientes_cache'>, keyof PacienteCacheRow> = true
const interessados: Igual<Colunas<'aniversariantes_interessados'>, keyof InteressadoRow> = true
export const _contratoConfereComOsTipos = [clinicas, unidades, templates, envios, cache, interessados]

// ─── O cadastro comum (visões do esquema `cadastro`, do CRM) ────────────────
//
// As colunas que este app LÊ das visões, com o CADASTRO_UNIFICADO ligado. O
// dono é o CRM (ADR 0014 de lá, docs/modelo-de-dados.md, "Esquema cadastro
// (contrato)"), e o teste dele falha se uma coluna sumir. Daqui, as mesmas
// listas montam os `select` (shared/clinica/cadastro.ts) e o deploy.sh as
// confere contra o banco antes de subir com a leitura ligada.

export const CONTRATO_DO_CADASTRO = {
  clinicas: ['id', 'company_id', 'nome', 'fuso_horario', 'token_plataforma_cifrado'],
  unidades: [
    'id',
    'clinica_id',
    'company_id',
    'nome',
    'principal',
    'ativa',
    'canal_envio_id',
    'canal_envio_numero',
    'equipe_envio_id',
    'prontuario_sistema',
    'prontuario_credenciais_cifradas',
  ],
  produtos: ['clinica_id', 'company_id', 'produto', 'ligado', 'configuracao'],
  unidade_origens: ['unidade_id', 'clinica_id', 'company_id', 'origem', 'id_na_origem'],
} as const

type ColunasDoCadastro<T extends keyof typeof CONTRATO_DO_CADASTRO> = (typeof CONTRATO_DO_CADASTRO)[T][number]

const visaoClinicas: Igual<ColunasDoCadastro<'clinicas'>, keyof ClinicaDoCadastroRow> = true
const visaoUnidades: Igual<ColunasDoCadastro<'unidades'>, keyof UnidadeDoCadastroRow> = true
const visaoProdutos: Igual<ColunasDoCadastro<'produtos'>, keyof ProdutoDoCadastroRow> = true
const visaoOrigens: Igual<ColunasDoCadastro<'unidade_origens'>, keyof OrigemDaUnidadeRow> = true
export const _cadastroConfereComOsTipos = [visaoClinicas, visaoUnidades, visaoProdutos, visaoOrigens]

/** A lista de colunas de uma visão, no formato do `select` do PostgREST. */
export function colunasDoCadastro(visao: keyof typeof CONTRATO_DO_CADASTRO): string {
  return CONTRATO_DO_CADASTRO[visao].join(',')
}

/**
 * Colunas do contrato que faltam no banco, por tabela (ou visão). Vazio =
 * contrato ok. Sem o segundo argumento, confere as tabelas deste app.
 */
export function colunasFaltando(
  noBanco: Record<string, string[]>,
  contrato: Record<string, readonly string[]> = CONTRATO
): { tabela: string; faltando: string[] }[] {
  return Object.entries(contrato)
    .map(([tabela, esperadas]) => ({
      tabela,
      faltando: esperadas.filter((coluna) => !(noBanco[tabela] ?? []).includes(coluna)),
    }))
    .filter((r) => r.faltando.length > 0)
}
