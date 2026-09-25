import type { ClinicaRow, EnvioRow, InteressadoRow, PacienteCacheRow, TemplateRow } from './db'

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
    'helena_campo_nascimento',
    'timezone',
    'created_at',
    'sistema_prontuario',
    'clinicorp_usuario_api',
    'clinicorp_token_api',
    'clinicorp_subscriber_id',
    'clinicorp_base_url',
  ],
  aniversariantes_templates: [
    'id',
    'clinica_id',
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
const templates: Igual<Colunas<'aniversariantes_templates'>, keyof TemplateRow> = true
const envios: Igual<Colunas<'aniversariantes_envios'>, keyof EnvioRow> = true
const cache: Igual<Colunas<'aniversariantes_pacientes_cache'>, keyof PacienteCacheRow> = true
const interessados: Igual<Colunas<'aniversariantes_interessados'>, keyof InteressadoRow> = true
export const _contratoConfereComOsTipos = [clinicas, templates, envios, cache, interessados]

/** Colunas do contrato que faltam no banco, por tabela. Vazio = contrato ok. */
export function colunasFaltando(
  noBanco: Record<string, string[]>
): { tabela: string; faltando: string[] }[] {
  return Object.entries(CONTRATO)
    .map(([tabela, esperadas]) => ({
      tabela,
      faltando: esperadas.filter((coluna) => !(noBanco[tabela] ?? []).includes(coluna)),
    }))
    .filter((r) => r.faltando.length > 0)
}
