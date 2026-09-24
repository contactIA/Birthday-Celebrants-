import { db, type InteressadoRow } from '@/shared/db'
import type { PedidoDeVaga } from './regras'

// Acesso a `aniversariantes_interessados`. Tabela só deste app — fica dentro da
// fatia, sem cerimônia (ADR 0002).

export interface Interessado {
  companyId: string
  nomeClinica: string
  telefone: string
  sistemaProntuario: InteressadoRow['sistema_prontuario']
  modeloMensagem: string
  pedidoEm: string
  atualizadoEm: string
}

function paraDominio(row: InteressadoRow): Interessado {
  return {
    companyId: row.company_id,
    nomeClinica: row.nome_clinica,
    telefone: row.telefone,
    sistemaProntuario: row.sistema_prontuario,
    modeloMensagem: row.modelo_mensagem,
    pedidoEm: row.created_at,
    atualizadoEm: row.updated_at,
  }
}

/**
 * Grava (ou atualiza) o pedido da conta. Upsert em `company_id`: reenviar o
 * formulário corrige os dados, não duplica o pedido.
 */
export async function salvarPedido(companyId: string, pedido: PedidoDeVaga, agora: Date): Promise<Interessado> {
  const { data, error } = await db()
    .from('aniversariantes_interessados')
    .upsert(
      {
        company_id: companyId,
        nome_clinica: pedido.nomeClinica,
        telefone: pedido.telefone,
        sistema_prontuario: pedido.sistemaProntuario,
        modelo_mensagem: pedido.modeloMensagem,
        consentimento_em: agora.toISOString(),
        updated_at: agora.toISOString(),
      },
      { onConflict: 'company_id' }
    )
    .select('*')
    .single()

  if (error) throw new Error(`Erro ao gravar o pedido: ${error.message}`)
  return paraDominio(data)
}

/** O pedido desta conta, se já existir — a página mostra "você está na lista". */
export async function buscarPedido(companyId: string): Promise<Interessado | null> {
  const { data, error } = await db()
    .from('aniversariantes_interessados')
    .select('*')
    .eq('company_id', companyId)
    .maybeSingle()

  if (error) throw new Error(`Erro ao buscar o pedido: ${error.message}`)
  return data ? paraDominio(data) : null
}

/** Todos os pedidos, mais recentes primeiro — só para a área de setup. */
export async function listarPedidos(): Promise<Interessado[]> {
  const { data, error } = await db()
    .from('aniversariantes_interessados')
    .select('*')
    .order('updated_at', { ascending: false })

  if (error) throw new Error(`Erro ao listar pedidos: ${error.message}`)
  return (data ?? []).map(paraDominio)
}
