import { db, type EnvioRow } from '@/shared/db'
import type { Clinica } from '@/shared/clinica/repositorio'
import { SITUACOES, type FiltrosDoHistorico } from './filtros'

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
  /** Nome do modelo usado. `null` se o modelo foi apagado depois. */
  modeloNome: string | null
  /** `false` quando não há id na plataforma: cancelar não é possível. */
  podeCancelar: boolean
}

export interface PaginaDoHistorico {
  itens: ItemDoHistorico[]
  total: number
  pagina: number
  porPagina: number
  /** O número que envia (o canal), igual para todos os envios da clínica. */
  remetente: string | null
}

const CANCELAVEIS = new Set<EnvioRow['status']>(['scheduled', 'processed'])

type Linha = Pick<
  EnvioRow,
  'id' | 'paciente_nome' | 'paciente_telefone' | 'status' | 'scheduled_for' | 'created_at' | 'scheduled_message_id'
> & { aniversariantes_templates: { nome: string } | null }

export async function buscarHistorico(
  clinica: Clinica,
  pagina: number,
  porPagina: number,
  filtros: FiltrosDoHistorico
): Promise<PaginaDoHistorico> {
  const de = (pagina - 1) * porPagina
  const coluna = filtros.ordem === 'criacao' ? 'created_at' : 'scheduled_for'

  let consulta = db()
    .from('aniversariantes_envios')
    .select(
      'id, paciente_nome, paciente_telefone, status, scheduled_for, created_at, scheduled_message_id, aniversariantes_templates(nome)',
      { count: 'exact' }
    )
    .eq('clinica_id', clinica.id)

  if (filtros.situacao) consulta = consulta.in('status', [...SITUACOES[filtros.situacao]])
  if (filtros.busca) {
    // `filtros.busca` já vem sem vírgula e parênteses (ver lerFiltros): é o que
    // impede a busca de virar outra condição dentro do `or`.
    const condicoes = [`paciente_nome.ilike.%${filtros.busca}%`]
    if (filtros.buscaDigitos) condicoes.push(`paciente_telefone.ilike.%${filtros.buscaDigitos}%`)
    consulta = consulta.or(condicoes.join(','))
  }

  const { data, error, count } = await consulta
    // `created_at` desempata quando `scheduled_for` é nulo ou igual, senão a
    // ordem fica indefinida entre páginas, e item repetido ou pulado na
    // paginação é difícil de diagnosticar depois.
    .order(coluna, { ascending: filtros.crescente, nullsFirst: false })
    .order('created_at', { ascending: filtros.crescente })
    .range(de, de + porPagina - 1)
    .returns<Linha[]>()

  if (error) throw new Error(`Erro ao buscar o histórico: ${error.message}`)

  return {
    itens: (data ?? []).map((linha) => ({
      id: linha.id,
      pacienteNome: linha.paciente_nome,
      pacienteTelefone: linha.paciente_telefone,
      status: linha.status,
      agendadoPara: linha.scheduled_for,
      criadoEm: linha.created_at,
      modeloNome: linha.aniversariantes_templates?.nome ?? null,
      podeCancelar: CANCELAVEIS.has(linha.status) && linha.scheduled_message_id !== null,
    })),
    total: count ?? 0,
    pagina,
    porPagina,
    remetente: clinica.credenciais.mensageria.from,
  }
}
