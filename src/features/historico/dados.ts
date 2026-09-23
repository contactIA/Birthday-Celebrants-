import { db, type EnvioRow } from '@/shared/db'
import type { Clinica } from '@/shared/clinica/repositorio'

/** Página padrão e teto. O app anterior devolvia a tabela inteira, sem limite. */
export const POR_PAGINA_PADRAO = 50
export const POR_PAGINA_MAXIMO = 200

export interface ItemDoHistorico {
  id: string
  pacienteNome: string
  pacienteTelefone: string
  status: EnvioRow['status']
  agendadoPara: string | null
  criadoEm: string
  /** `false` quando não há id na plataforma — cancelar não é possível. */
  podeCancelar: boolean
}

export interface PaginaDoHistorico {
  itens: ItemDoHistorico[]
  total: number
  pagina: number
  porPagina: number
}

const CANCELAVEIS = new Set<EnvioRow['status']>(['scheduled', 'processed'])

export async function buscarHistorico(
  clinica: Clinica,
  pagina: number,
  porPagina: number
): Promise<PaginaDoHistorico> {
  const de = (pagina - 1) * porPagina

  const { data, error, count } = await db()
    .from('aniversariantes_envios')
    .select('id, paciente_nome, paciente_telefone, status, scheduled_for, created_at, scheduled_message_id', {
      count: 'exact',
    })
    // Mais recentes primeiro. `created_at` desempata quando `scheduled_for` é
    // nulo, senão a ordem entre eles fica indefinida entre páginas — e item
    // repetido ou pulado na paginação é difícil de diagnosticar depois.
    .order('scheduled_for', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .eq('clinica_id', clinica.id)
    .range(de, de + porPagina - 1)
    .returns<
      Pick<
        EnvioRow,
        | 'id'
        | 'paciente_nome'
        | 'paciente_telefone'
        | 'status'
        | 'scheduled_for'
        | 'created_at'
        | 'scheduled_message_id'
      >[]
    >()

  if (error) throw new Error(`Erro ao buscar o histórico: ${error.message}`)

  return {
    itens: (data ?? []).map((linha) => ({
      id: linha.id,
      pacienteNome: linha.paciente_nome,
      pacienteTelefone: linha.paciente_telefone,
      status: linha.status,
      agendadoPara: linha.scheduled_for,
      criadoEm: linha.created_at,
      podeCancelar: CANCELAVEIS.has(linha.status) && linha.scheduled_message_id !== null,
    })),
    total: count ?? 0,
    pagina,
    porPagina,
  }
}
