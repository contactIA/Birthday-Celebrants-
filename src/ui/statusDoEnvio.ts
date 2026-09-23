// Como cada status de envio aparece na tela — um mapa só para a Agenda e o
// Histórico. Com um mapa em cada tela, a Agenda mostrava "Agendado" para a
// mesma mensagem que o Histórico já mostrava como "Entregue".
//
// Os status são os da coluna `aniversariantes_envios.status`, que espelham os
// da plataforma de mensagens. Quem os atualiza é a reconciliação (a cada 15
// min), então a tela reflete a plataforma com esse atraso.

export type TomDoEstado = 'ok' | 'atencao' | 'parado' | 'erro' | 'neutro'

const STATUS: Record<string, { rotulo: string; tom: TomDoEstado }> = {
  scheduled: { rotulo: 'Agendada', tom: 'ok' },
  processed: { rotulo: 'Em processamento', tom: 'neutro' },
  sent: { rotulo: 'Enviada', tom: 'ok' },
  delivered: { rotulo: 'Entregue', tom: 'ok' },
  read: { rotulo: 'Lida', tom: 'ok' },
  canceled: { rotulo: 'Cancelada', tom: 'parado' },
  failed: { rotulo: 'Falhou', tom: 'erro' },
}

export function estadoDoEnvio(status: string): { rotulo: string; tom: TomDoEstado } {
  return STATUS[status] ?? { rotulo: status, tom: 'neutro' }
}

/**
 * O paciente já tem parabéns resolvido este ano — agendado, a caminho ou
 * entregue. Cancelado e falho NÃO contam: nos dois a mensagem não vai sair, e
 * a pessoa precisa poder agendar de novo (o registro é sobrescrito).
 */
export function temMensagemValida(status: string | undefined | null): boolean {
  return !!status && status !== 'canceled' && status !== 'failed'
}
