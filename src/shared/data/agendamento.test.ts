import { describe, it, expect } from 'vitest'
import { aniversarioJaPassou, instanteDoEnvio, idadeAtual } from './agendamento'

const SP = 'America/Sao_Paulo'
// 15/09/2026, 14:00 em São Paulo (17:00 UTC).
const AGORA = new Date('2026-09-15T17:00:00Z')

describe('aniversarioJaPassou', () => {
  it('mês anterior já passou', () => {
    expect(aniversarioJaPassou(8, 20, SP, AGORA)).toBe(true)
  })

  it('mês seguinte não passou', () => {
    expect(aniversarioJaPassou(10, 1, SP, AGORA)).toBe(false)
  })

  it('hoje não conta como passado', () => {
    expect(aniversarioJaPassou(9, 15, SP, AGORA)).toBe(false)
  })

  it('ontem passou', () => {
    expect(aniversarioJaPassou(9, 14, SP, AGORA)).toBe(true)
  })

  it('usa o fuso da clínica, não o do servidor', () => {
    // 01:00 UTC de 16/09 ainda é 22:00 de 15/09 em São Paulo — o aniversário
    // de hoje não pode virar "já passou" porque o servidor está em UTC.
    const viradaUTC = new Date('2026-09-16T01:00:00Z')
    expect(aniversarioJaPassou(9, 15, SP, viradaUTC)).toBe(false)
  })
})

describe('instanteDoEnvio', () => {
  const base = { timezone: SP, horario: '09:00', diaEnvio: 'aniversario' as const, agora: AGORA }

  it('recusa aniversário que já passou', () => {
    expect(instanteDoEnvio(9, 14, base)).toBeNull()
  })

  it('agenda no dia, no horário da clínica', () => {
    // 09:00 em São Paulo = 12:00 UTC
    expect(instanteDoEnvio(10, 20, base)?.toISOString()).toBe('2026-10-20T12:00:00.000Z')
  })

  it('aplica "1 dia antes"', () => {
    const d = instanteDoEnvio(10, 20, { ...base, diaEnvio: '1_dia_antes' })
    expect(d?.toISOString()).toBe('2026-10-19T12:00:00.000Z')
  })

  it('aplica "3 dias antes"', () => {
    const d = instanteDoEnvio(10, 20, { ...base, diaEnvio: '3_dias_antes' })
    expect(d?.toISOString()).toBe('2026-10-17T12:00:00.000Z')
  })

  it('atravessa a virada de mês na antecedência', () => {
    const d = instanteDoEnvio(10, 1, { ...base, diaEnvio: '3_dias_antes' })
    expect(d?.toISOString()).toBe('2026-09-28T12:00:00.000Z')
  })

  it('é hoje mas o horário já passou: envia com margem, não pula o dia', () => {
    const d = instanteDoEnvio(9, 15, base)
    expect(d).not.toBeNull()
    expect(d!.getTime()).toBeGreaterThan(AGORA.getTime())
    expect(d!.getTime()).toBeLessThan(AGORA.getTime() + 10 * 60_000)
  })

  it('antecedência que cairia no passado vira margem, não null', () => {
    // Aniversário amanhã com 3 dias de antecedência cairia 2 dias atrás.
    const d = instanteDoEnvio(9, 16, { ...base, diaEnvio: '3_dias_antes' })
    expect(d).not.toBeNull()
    expect(d!.getTime()).toBeGreaterThan(AGORA.getTime())
  })

  it('respeita o horário configurado, não um fixo', () => {
    const d = instanteDoEnvio(10, 20, { ...base, horario: '18:30' })
    expect(d?.toISOString()).toBe('2026-10-20T21:30:00.000Z')
  })
})

describe('idadeAtual', () => {
  it('conta anos completos', () => {
    expect(idadeAtual('20/05/1990', SP, AGORA)).toBe(36)
  })

  it('ainda não fez aniversário este ano', () => {
    expect(idadeAtual('20/12/1990', SP, AGORA)).toBe(35)
  })

  it('esconde idade absurda vinda de erro de digitação', () => {
    expect(idadeAtual('20/05/1694', SP, AGORA)).toBeNull()
  })

  it('recusa formato inválido', () => {
    expect(idadeAtual('', SP, AGORA)).toBeNull()
  })
})
