import { db, type ClinicaRow, type SistemaProntuario } from '@/shared/db'

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
