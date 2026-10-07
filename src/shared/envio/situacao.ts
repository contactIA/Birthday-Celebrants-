// Quando o parabéns do ano já está resolvido.
//
// A Agenda e o agendamento aplicam a MESMA regra, e por isso ela mora aqui: a
// tela esconde quem já tem mensagem, e o servidor recusa agendar de novo para
// essas pessoas. Com uma regra em cada lado, a tela ofereceria um paciente que
// o servidor recusa — ou o servidor aceitaria um que a tela já mostra como
// agendado, e sairiam duas mensagens.

/**
 * O paciente já tem parabéns resolvido este ano — agendado, a caminho ou
 * entregue. Cancelado e falho NÃO contam: nos dois a mensagem não vai sair, e
 * a pessoa precisa poder agendar de novo (o registro é sobrescrito).
 */
export function temMensagemValida(status: string | undefined | null): boolean {
  return !!status && status !== 'canceled' && status !== 'failed'
}
