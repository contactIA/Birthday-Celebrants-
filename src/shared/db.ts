import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Cliente único do banco, sempre com `service_role`.
//
// Não existe acesso direto do browser às tabelas: RLS é deny-all em todas, e o
// schema `aniversariantes` só concede USAGE a `service_role`. Toda leitura e
// escrita passa por aqui, no servidor.
//
// O SCHEMA É FIXO. No app anterior ele era configurável por env var, e isso
// existia SÓ para viabilizar a janela de corte em que as tabelas saíram de
// `public` (Clinic-Control#71). A janela fechou — confirmado no banco. Sem env
// var, sem default `public`, sem cast de tipos entre os dois nomes.
// Ver docs/adr/0002-banco-compartilhado.md.
const SCHEMA = 'aniversariantes'

export type SistemaProntuario = 'eclinica' | 'clinicorp'
export type DiaEnvio = 'aniversario' | '1_dia_antes' | '3_dias_antes'
export type StatusEnvio =
  | 'scheduled'
  | 'processed'
  | 'sent'
  | 'delivered'
  | 'read'
  | 'canceled'
  | 'failed'

/** Linha de `aniversariantes_clinicas`. A ÚNICA tabela com consumidor externo. */
export interface ClinicaRow {
  id: string
  /**
   * `company_id` da plataforma de mensagens — um UUID, não um slug legível.
   * O nome da coluna é legado e é breaking change renomear: o Clinic Control
   * faz `upsert` com `onConflict: "slug"`. No código use `companyId`.
   */
  slug: string
  nome: string
  eclinica_token: string | null
  eclinica_base_url: string
  helena_token: string
  helena_channel_id: string | null
  helena_from: string | null
  /** Equipe ("department") que agenda pelo remetente. Nulo = a equipe padrão da conta. */
  helena_department_id: string | null
  /** Chave do campo personalizado de data de nascimento no contato. Nulo = não preencher. */
  helena_campo_nascimento: string | null
  timezone: string
  created_at: string
  sistema_prontuario: SistemaProntuario
  clinicorp_usuario_api: string | null
  clinicorp_token_api: string | null
  clinicorp_subscriber_id: string | null
  clinicorp_base_url: string
}

/** `id` e `created_at` vêm do default do banco. */
export type ClinicaInsert = Omit<ClinicaRow, 'id' | 'created_at'>

/**
 * Uma unidade da clínica. A PRINCIPAL (`principal = true`) não carrega
 * credenciais: lê as da linha da clínica, onde o Clinic Control as mantém. Só as
 * adicionais têm credenciais próprias. A resolução mora em
 * `shared/clinica/resolver.ts`.
 */
export interface UnidadeRow {
  id: string
  clinica_id: string
  nome: string
  principal: boolean
  sistema_prontuario: SistemaProntuario | null
  eclinica_token: string | null
  eclinica_base_url: string | null
  clinicorp_usuario_api: string | null
  clinicorp_token_api: string | null
  clinicorp_subscriber_id: string | null
  clinicorp_base_url: string | null
  helena_from: string | null
  helena_channel_id: string | null
  helena_department_id: string | null
  created_at: string
}

/**
 * `id` é opcional: o banco gera, salvo na unidade criada a partir do cadastro
 * comum, que nasce com o id da unidade do CRM (ver shared/clinica/montagem.ts).
 */
export type UnidadeInsert = Omit<UnidadeRow, 'id' | 'created_at' | 'principal'> & {
  id?: string
  principal?: boolean
}

export interface TemplateRow {
  id: string
  clinica_id: string
  unidade_id: string
  helena_template_id: string
  nome: string
  param_mapping: Record<string, string>
  dia_envio: DiaEnvio
  horario_envio: string
  is_default: boolean
  ativo: boolean
  created_at: string
  updated_at: string
}

export interface EnvioRow {
  id: string
  clinica_id: string
  unidade_id: string
  template_id: string | null
  /** Id do paciente em QUALQUER prontuário, apesar do nome legado. */
  paciente_id_eclinica: string
  paciente_nome: string
  paciente_telefone: string
  data_nascimento: string | null
  ano: number
  scheduled_message_id: string | null
  status: StatusEnvio
  scheduled_for: string | null
  created_at: string
}

export interface PacienteCacheRow {
  id: string
  clinica_id: string
  unidade_id: string
  paciente_id: string
  nome: string
  telefone: string | null
  /** "YYYY-MM-DD" */
  datanascimento: string | null
  mes_aniversario: number
  dia_aniversario: number
  /** ACTIVE / INACTIVE / DELETED. `null` = não verificado no sync. */
  situacao: string | null
  synced_at: string
}

// Os tipos de escrita são declarados por extenso em vez de derivados das linhas
// com `Omit<Row, 'id' | ...>`. Derivar exigiria repetir, a cada tabela, quais
// colunas o banco preenche sozinho — e o `Omit` não distingue "o banco gera"
// (id, created_at) de "tem default mas pode ser informado" (status,
// param_mapping). Escrever à mão deixa isso explícito no opcional.

/** Colunas que o banco preenche sozinho ficam de fora ou opcionais. */
export interface TemplateInsert {
  clinica_id: string
  unidade_id: string
  helena_template_id: string
  nome: string
  param_mapping?: Record<string, string>
  dia_envio?: DiaEnvio
  horario_envio?: string
  is_default?: boolean
  ativo?: boolean
  updated_at?: string
}

export interface EnvioInsert {
  clinica_id: string
  unidade_id: string
  template_id: string | null
  paciente_id_eclinica: string
  paciente_nome: string
  paciente_telefone: string
  data_nascimento: string | null
  ano: number
  scheduled_message_id: string | null
  status?: StatusEnvio
  scheduled_for: string | null
}

/** Pedido de vaga no beta, feito na página de quem ainda não tem o app. */
export interface InteressadoRow {
  id: string
  company_id: string
  nome_clinica: string
  telefone: string
  sistema_prontuario: 'clinicorp' | 'eclinica' | 'outro'
  /** Nome do prontuário quando `sistema_prontuario` é 'outro'; nulo nos demais. */
  sistema_outro: string | null
  modelo_mensagem: string
  /** A clínica quer enviar o parabéns com foto/vídeo, não só texto. */
  quer_midia: boolean
  consentimento_em: string
  created_at: string
  updated_at: string
  /** Etapa na fila. "Vaga liberada" não é status: é a clínica estar cadastrada. */
  status: 'recebido' | 'em_analise'
}

export type InteressadoInsert = Omit<InteressadoRow, 'id' | 'created_at' | 'status'> & {
  status?: InteressadoRow['status']
}

export interface PacienteCacheInsert {
  clinica_id: string
  unidade_id: string
  paciente_id: string
  nome: string
  telefone: string | null
  datanascimento: string | null
  mes_aniversario: number
  dia_aniversario: number
  situacao: string | null
  /** Carimbo da execução do sync. Informado explicitamente para a limpeza
   *  poder distinguir o que foi renovado do que ficou para trás. */
  synced_at?: string
}

// ─── O cadastro comum dos produtos (visões do CRM, só leitura) ─────────────
//
// Com o CADASTRO_UNIFICADO ligado, a clínica vem das visões do esquema
// `cadastro`, que o CRM mantém para os quatro produtos (ADR 0014 do CRM,
// contactIA/CRM-Contact-IA#215). Os tipos abaixo têm SÓ as colunas que este app
// lê: o contrato (`src/shared/contrato.ts`) é o que o código usa, não a visão
// inteira. Os segredos vêm cifrados e se abrem em `shared/clinica`.

/** `cadastro.clinicas`: a clínica, pela conta na plataforma (`company_id`). */
export interface ClinicaDoCadastroRow {
  id: string
  company_id: string
  nome: string
  fuso_horario: string
  /** O token da plataforma, cifrado com a CADASTRO_CHAVE_CIFRAGEM. Nulo = sem token. */
  token_plataforma_cifrado: string | null
}

/** `cadastro.unidades`: a unidade, com o canal e a equipe que enviam e o prontuário. */
export interface UnidadeDoCadastroRow {
  id: string
  clinica_id: string
  company_id: string
  nome: string
  /** Uma por clínica, sempre ativa. */
  principal: boolean
  ativa: boolean
  /** O id do canal que envia, na plataforma. */
  canal_envio_id: string | null
  /** O número desse canal, só dígitos com o país: é o `from`. */
  canal_envio_numero: string | null
  equipe_envio_id: string | null
  /** Nulo = a unidade não tem prontuário no cadastro. */
  prontuario_sistema: SistemaProntuario | null
  /** O JSON das credenciais, cifrado (ver `decifrador-do-cadastro.ts`). */
  prontuario_credenciais_cifradas: string | null
}

export type ProdutoDoCadastro = 'crm' | 'aniversariantes' | 'lembretes' | 'botao'

/** `cadastro.produtos`: sempre quatro linhas por clínica, uma por produto. */
export interface ProdutoDoCadastroRow {
  clinica_id: string
  company_id: string
  produto: ProdutoDoCadastro
  ligado: boolean
  /** A configuração do produto (jsonb). Nos Aniversariantes, `{ campoNascimento }`. */
  configuracao: unknown
}

/** `cadastro.unidade_origens`: o id que a unidade tinha em cada app, gravado pela importação. */
export interface OrigemDaUnidadeRow {
  unidade_id: string
  clinica_id: string
  company_id: string
  origem: 'aniversariantes' | 'lembretes' | 'botao'
  id_na_origem: string
}

// `Relationships` é exigido pelo parser de `select()` do supabase-js: sem ele o
// cliente não infere o shape de uma projeção parcial e a devolve como `never`.
// Vazio porque não usamos joins embutidos.
interface Tabela<Row, Insert> {
  Row: Row
  Insert: Insert
  Update: Partial<Insert>
  Relationships: []
}

/** Visão só de leitura: sem `Insert`/`Update`, o cliente não oferece escrita. */
interface Visao<Row> {
  Row: Row
  Relationships: []
}

// `type`, NÃO `interface`. Interfaces não recebem index signature implícita em
// TypeScript, então uma `interface Database` não satisfaz o
// `Record<string, GenericSchema>` que o supabase-js exige — e a inferência de
// `insert`/`upsert` colapsa silenciosamente para `never[]`. É por isso que o
// codegen do Supabase emite `export type Database = {...}`.
export type Database = {
  aniversariantes: {
    Tables: {
      // Lida pelo painel e pelos crons; escrita só pela área de setup, sempre
      // via `shared/clinica/repositorio.ts`. Nada neste app a apaga.
      aniversariantes_clinicas: Tabela<ClinicaRow, ClinicaInsert>
      // Cada clínica tem uma principal (criada por trigger) e pode ter outras.
      aniversariantes_unidades: Tabela<UnidadeRow, UnidadeInsert>
      aniversariantes_templates: Tabela<TemplateRow, TemplateInsert>
      aniversariantes_envios: Tabela<EnvioRow, EnvioInsert>
      aniversariantes_pacientes_cache: Tabela<PacienteCacheRow, PacienteCacheInsert>
      aniversariantes_interessados: Tabela<InteressadoRow, InteressadoInsert>
    }
    // `{ [_ in never]: never }` — a forma que o codegen do Supabase emite para
    // seções vazias. Preferida a `Record<string, never>`, cujo `keyof` é
    // `string` e faz o cliente acreditar que existe view/função com qualquer
    // nome.
    Views: { [_ in never]: never }
    Functions: { [_ in never]: never }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
  // O cadastro comum, do CRM. Só o service_role lê, e só lê; este app só o
  // consulta com o CADASTRO_UNIFICADO ligado (ver shared/clinica/cadastro.ts).
  cadastro: {
    Tables: { [_ in never]: never }
    Views: {
      clinicas: Visao<ClinicaDoCadastroRow>
      unidades: Visao<UnidadeDoCadastroRow>
      produtos: Visao<ProdutoDoCadastroRow>
      unidade_origens: Visao<OrigemDaUnidadeRow>
    }
    Functions: { [_ in never]: never }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}

export type ClienteDoBanco = SupabaseClient<Database>

let cliente: SupabaseClient<Database> | null = null

function conectar(): SupabaseClient<Database> {
  if (cliente) return cliente

  // `SUPABASE_URL`, SEM o prefixo `NEXT_PUBLIC_`. O prefixo faz o Next congelar
  // o valor no `next build` — inclusive no código de servidor. No deploy por
  // Docker o build roda sem os valores reais, e a URL congelada seria vazia.
  // Nada no browser fala com o Supabase, então não há motivo para o prefixo.
  const url = process.env.SUPABASE_URL
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY
  // Falha alto e cedo: sem service role não há leitura nenhuma, e um erro claro
  // aqui é melhor que um PGRST na primeira query.
  if (!url) throw new Error('SUPABASE_URL não configurada')
  if (!chave) throw new Error('SUPABASE_SERVICE_ROLE_KEY não configurada')

  cliente = createClient<Database>(url, chave, {
    auth: { autoRefreshToken: false, persistSession: false },
    db: { schema: SCHEMA },
  })
  return cliente
}

/**
 * O ponto de entrada para qualquer consulta.
 *
 * `.schema(SCHEMA)` a cada chamada, e não o genérico de schema no
 * `createClient`: com um `Database` escrito à mão, o genérico não propaga o
 * tipo de escrita e `insert`/`upsert` recebem `never[]` — o erro não diz a
 * causa e some assim que se usa `.schema()`, que infere por chamada. É o
 * caminho que a própria doc do supabase-js indica para schema não-`public`.
 *
 * Em runtime o header de schema é o mesmo que a opção `db.schema` já define; a
 * chamada é sobre tipagem, não sobre comportamento.
 */
export function db() {
  return conectar().schema(SCHEMA)
}

/**
 * O cliente inteiro, para quem lê de mais de um esquema: a leitura do cadastro
 * comum (`shared/clinica/cadastro.ts`) consulta o `cadastro` e grava as linhas
 * locais no `aniversariantes`. Ela recebe o cliente por parâmetro, e os testes
 * passam um falso no lugar.
 */
export function clienteDoBanco(): ClienteDoBanco {
  return conectar()
}
