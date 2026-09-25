// Como cada status de envio aparece na tela — um mapa só para a Agenda e o
// Histórico. Com um mapa em cada tela, a Agenda mostrava "Agendado" para a
// mesma mensagem que o Histórico já mostrava como "Entregue".
//
// Os status são os da coluna `aniversariantes_envios.status`, que espelham os
// da plataforma de mensagens. Quem os atualiza é a reconciliação (a cada 15
// min), então a tela reflete a plataforma com esse atraso.

export type TomDoEstado = 'ok' | 'atencao' | 'parado' | 'erro' | 'neutro' | 'info'
export type IconeDoEstado = 'relogio' | 'engrenagem' | 'check' | 'check-duplo' | 'x' | 'alerta'

// Cores e ícones seguem a tela de mensagens agendadas da própria plataforma
// (cinza com relógio, azul com check, amarelo com x): quem usa as duas telas
// reconhece a situação sem reler o rótulo.
const STATUS: Record<string, { rotulo: string; tom: TomDoEstado; icone: IconeDoEstado }> = {
  scheduled: { rotulo: 'Agendada', tom: 'neutro', icone: 'relogio' },
  processed: { rotulo: 'Em processamento', tom: 'neutro', icone: 'engrenagem' },
  sent: { rotulo: 'Enviada', tom: 'info', icone: 'check' },
  delivered: { rotulo: 'Entregue', tom: 'info', icone: 'check' },
  read: { rotulo: 'Lida', tom: 'info', icone: 'check-duplo' },
  canceled: { rotulo: 'Cancelada', tom: 'atencao', icone: 'x' },
  failed: { rotulo: 'Falhou', tom: 'erro', icone: 'alerta' },
}

export function estadoDoEnvio(status: string): { rotulo: string; tom: TomDoEstado; icone: IconeDoEstado } {
  return STATUS[status] ?? { rotulo: status, tom: 'neutro', icone: 'alerta' }
}

/**
 * O paciente já tem parabéns resolvido este ano — agendado, a caminho ou
 * entregue. Cancelado e falho NÃO contam: nos dois a mensagem não vai sair, e
 * a pessoa precisa poder agendar de novo (o registro é sobrescrito).
 */
export function temMensagemValida(status: string | undefined | null): boolean {
  return !!status && status !== 'canceled' && status !== 'failed'
}
