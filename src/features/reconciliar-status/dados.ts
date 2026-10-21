import { db, type EnvioRow, type StatusEnvio } from '@/shared/db'
import type { Clinica } from '@/shared/clinica/repositorio'
import { inicioDoAcompanhamentoDaEntrega, type EnvioPendente } from './reconciliacao'

/** Estados que ainda podem mudar na plataforma, sem prazo. */
const AGUARDANDO: StatusEnvio[] = ['scheduled', 'processed']

/** Estados que ainda mudam, mas só nos primeiros dias (ver DIAS_ACOMPANHANDO_A_ENTREGA). */
const A_CAMINHO: StatusEnvio[] = ['sent', 'delivered']

/**
 * Os envios que ainda aguardam resposta da plataforma.
 *
 * Três filtros, e o terceiro é o que economiza chamada: só interessa o que já
 * DEVERIA ter saído. Uma mensagem agendada para o mês que vem continua
 * `scheduled` por definição — consultá-la seria gastar requisição para
 * confirmar o óbvio, todo dia até lá.
 *
 * As `sent` e `delivered` entram também, mas só as dos últimos dias: ainda
 * podem virar entregue, lida ou falha.
 */
export async function buscarPendentes(clinica: Clinica, agora: Date): Promise<EnvioPendente[]> {
  const desde = inicioDoAcompanhamentoDaEntrega(agora)
  const { data, error } = await db()
    .from('aniversariantes_envios')
    .select('id, scheduled_message_id, scheduled_for, status')
    .eq('clinica_id', clinica.id)
    .eq('unidade_id', clinica.unidade.id)
    .or(`status.in.(${AGUARDANDO.join(',')}),and(status.in.(${A_CAMINHO.join(',')}),scheduled_for.gt.${desde})`)
    .not('scheduled_message_id', 'is', null)
    .lt('scheduled_for', agora.toISOString())
    .returns<Pick<EnvioRow, 'id' | 'scheduled_message_id' | 'scheduled_for' | 'status'>[]>()

  if (error) throw new Error(`Erro ao buscar envios pendentes: ${error.message}`)

  return (data ?? [])
    // `scheduled_for` não nulo já está garantido pelo filtro `lt`, mas o tipo
    // não sabe disso — e sem data não há como montar a janela de consulta.
    .filter((linha) => linha.scheduled_message_id !== null && linha.scheduled_for !== null)
    .map((linha) => ({
      id: linha.id,
      mensagemId: linha.scheduled_message_id!,
      agendadoPara: linha.scheduled_for!,
      statusAtual: linha.status,
    }))
}

export async function atualizarStatus(
  clinica: Clinica,
  envioId: string,
  status: StatusEnvio,
  motivoDaFalha: string | null
): Promise<void> {
  const { error } = await db()
    .from('aniversariantes_envios')
    .update({ status, motivo_da_falha: motivoDaFalha })
    .eq('id', envioId)
    .eq('clinica_id', clinica.id)
    .eq('unidade_id', clinica.unidade.id)

  if (error) throw new Error(error.message)
}
