// O envio que passou do horário e não saiu.
//
// A plataforma às vezes deixa a mensagem "agendada" depois do horário: tenta,
// abre a conversa e para aí, sem enviar nem falhar (Odontho, 30/10 a 03/11/2026:
// 108 parabéns). A reconciliação lê o mesmo "agendada" de lá, e aqui ele
// continuava "Agendada", travando o paciente para outro parabéns no ano. Com a
// folga abaixo, ele aparece como "Não saiu", para a recepção cancelar e agendar
// de novo.

/** Quanto depois do horário o envio ainda pode sair: as mensagens saem em minutos. */
export const FOLGA_DO_ENVIO_MS = 2 * 60 * 60 * 1000

const AGUARDANDO: ReadonlySet<string> = new Set(['scheduled', 'processed'])

/** O horário (ISO) antes do qual um envio que ainda aguarda é "não saiu". */
export function limiteDoNaoSaiu(agora: Date): string {
  return new Date(agora.getTime() - FOLGA_DO_ENVIO_MS).toISOString()
}

/** Ainda aguarda a plataforma, e o horário passou da folga. */
export function naoSaiu(status: string, agendadoPara: string | null, agora: Date): boolean {
  if (!AGUARDANDO.has(status) || !agendadoPara) return false
  const quando = new Date(agendadoPara).getTime()
  return !Number.isNaN(quando) && quando < agora.getTime() - FOLGA_DO_ENVIO_MS
}

/** O passo que a ficha mostra para o envio que não saiu. */
export const O_QUE_FAZER_QUANDO_NAO_SAIU =
  'Passou do horário e a plataforma de mensagens não enviou. Cancele esta mensagem e agende de novo pela Agenda, com a data e a hora escolhidas à mão. Se acontecer com várias, avise quem administra a conta da plataforma.'
