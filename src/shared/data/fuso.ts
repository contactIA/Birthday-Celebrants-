// O Brasil não tem horário de verão desde 2019, então o offset por fuso é fixo
// e não precisamos de biblioteca de timezone. Se um dia voltar, é AQUI que
// muda — e o teste que fixa `agora` é o que vai acusar.
const OFFSET_UTC_FIXO: Record<string, number> = {
  'America/Sao_Paulo': -3,
  'America/Manaus': -4,
  'America/Rio_Branco': -5,
  'America/Noronha': -2,
}

export const OFFSET_PADRAO = -3

/**
 * Os fusos que o cálculo conhece. Qualquer outro cai no OFFSET_PADRAO em
 * silêncio — por isso o cadastro de clínica só oferece estes.
 */
export const FUSOS_SUPORTADOS = Object.keys(OFFSET_UTC_FIXO)

export function offsetDe(timezone: string): number {
  return OFFSET_UTC_FIXO[timezone] ?? OFFSET_PADRAO
}

export interface DataLocal {
  ano: number
  mes: number
  dia: number
}

/**
 * A data de "hoje" no fuso da clínica.
 *
 * `agora` é parâmetro, não `Date.now()` interno: o container roda em UTC na
 * VPS e a regra de "já passou" muda de resposta conforme a hora do dia.
 * Injetar o instante é o que permite testar a virada de meia-noite sem relógio.
 */
export function hojeNoTimezone(timezone: string, agora: Date): DataLocal {
  const local = new Date(agora.getTime() + offsetDe(timezone) * 3_600_000)
  return { ano: local.getUTCFullYear(), mes: local.getUTCMonth() + 1, dia: local.getUTCDate() }
}
