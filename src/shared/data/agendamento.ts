import { hojeNoTimezone, offsetDe } from './fuso'

/** Quando enviar, relativo ao aniversário. Espelha a check constraint da tabela. */
export type DiaEnvio = 'aniversario' | '1_dia_antes' | '3_dias_antes'

const DIAS_DE_ANTECEDENCIA: Record<DiaEnvio, number> = {
  aniversario: 0,
  '1_dia_antes': 1,
  '3_dias_antes': 3,
}

/** Quando a data calculada já passou mas o aniversário não, envia daqui a pouco. */
const MINUTOS_DE_MARGEM = 5

/**
 * Um aniversário anterior a hoje não é agendável.
 *
 * O cálculo antigo empurrava para o ano seguinte, e agendar em lote no dia 5
 * mandava quem fez aniversário no dia 3 para o ano que vem — parabéns fantasma,
 * ocupando a chave única (clínica, paciente, ano).
 */
export function aniversarioJaPassou(mes: number, dia: number, timezone: string, agora: Date): boolean {
  const hoje = hojeNoTimezone(timezone, agora)
  if (mes !== hoje.mes) return mes < hoje.mes
  return dia < hoje.dia
}

export interface ParametrosDeEnvio {
  timezone: string
  /** "HH:MM" no fuso da clínica. */
  horario: string
  diaEnvio: DiaEnvio
  agora: Date
}

/**
 * O instante do envio neste ano, ou `null` se o aniversário já passou.
 *
 * `diaEnvio` é aplicado AQUI. No app anterior essa configuração era salva no
 * banco, exibida na tela e nunca lida no cálculo — quem escolhia "3 dias antes"
 * recebia envio no próprio dia.
 */
export function instanteDoEnvio(mes: number, dia: number, p: ParametrosDeEnvio): Date | null {
  if (aniversarioJaPassou(mes, dia, p.timezone, p.agora)) return null

  const hoje = hojeNoTimezone(p.timezone, p.agora)
  const [hh, mm] = p.horario.split(':').map(Number)
  const noAniversario = Date.UTC(hoje.ano, mes - 1, dia, (hh ?? 9) - offsetDe(p.timezone), mm ?? 0)
  const alvo = noAniversario - DIAS_DE_ANTECEDENCIA[p.diaEnvio] * 86_400_000

  // A antecedência (ou o horário padrão, quando é hoje) pode cair no passado.
  // A plataforma rejeita agendamento retroativo, então empurra para daqui a
  // pouco em vez de pular o envio.
  if (alvo <= p.agora.getTime()) {
    return new Date(p.agora.getTime() + MINUTOS_DE_MARGEM * 60_000)
  }
  return new Date(alvo)
}

/** Idade em anos completos a partir de "DD/MM/AAAA". */
export function idadeAtual(datanascimento: string, timezone: string, agora: Date): number | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(datanascimento)
  if (!m) return null
  const [, diaStr, mesStr, anoStr] = m as unknown as [string, string, string, string]
  const dia = Number(diaStr)
  const mes = Number(mesStr)
  const ano = Number(anoStr)

  const hoje = hojeNoTimezone(timezone, agora)
  let idade = hoje.ano - ano
  if (hoje.mes < mes || (hoje.mes === mes && hoje.dia < dia)) idade--

  // Erro de digitação no cadastro ("1694" em vez de "1964") não é sentinela de
  // vazio, então os parsers não pegam — mas produz idade absurda na tela.
  if (idade < 0 || idade > 120) return null
  return idade
}
