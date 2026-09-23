import { db } from '@/shared/db'
import type { Clinica } from '@/shared/clinica/repositorio'
import type { EnvioParaCancelar } from './cancelamento'
import type { StatusEnvio } from '@/shared/db'

/**
 * O envio, escopado à clínica.
 *
 * O `.eq('clinica_id')` é o que faz um envio de outra clínica responder
 * "não encontrado" em vez de ser cancelado.
 */
export async function buscarEnvio(
  clinica: Clinica,
  envioId: string
): Promise<EnvioParaCancelar | null> {
  const { data, error } = await db()
    .from('aniversariantes_envios')
    .select('id, scheduled_message_id, status')
    .eq('id', envioId)
    .eq('clinica_id', clinica.id)
    .maybeSingle<{ id: string; scheduled_message_id: string | null; status: StatusEnvio }>()

  if (error) throw new Error(`Erro ao buscar o agendamento: ${error.message}`)
  if (!data) return null

  return { id: data.id, mensagemId: data.scheduled_message_id, status: data.status }
}

export async function marcarComoCancelado(clinica: Clinica, envioId: string): Promise<void> {
  const { error } = await db()
    .from('aniversariantes_envios')
    .update({ status: 'canceled' })
    .eq('id', envioId)
    // Redundante com a busca, e mantido de propósito: uma escrita que depende
    // de uma leitura anterior para estar escopada é frágil a refatoração.
    .eq('clinica_id', clinica.id)

  if (error) throw new Error(`Erro ao atualizar o agendamento: ${error.message}`)
}
