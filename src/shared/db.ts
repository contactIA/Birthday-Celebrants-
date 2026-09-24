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

export interface TemplateRow {
  id: string
  clinica_id: string
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
  modelo_mensagem: string
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

// `Relationships` é exigido pelo parser de `select()` do supabase-js: sem ele o
// cliente não infere o shape de uma projeção parcial e a devolve como `never`.
// Vazio porque não usamos joins embutidos.
interface Tabela<Row, Insert> {
  Row: Row
  Insert: Insert
  Update: Partial<Insert>
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
}

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
