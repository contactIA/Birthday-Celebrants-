import { describe, expect, it } from 'vitest'
import { limiteDoNaoSaiu, naoSaiu } from './envio-que-nao-saiu'

const AGORA = new Date('2026-11-05T15:00:00Z')

describe('o envio que não saiu', () => {
  it('agendado e duas horas depois do horário: não saiu', () => {
    expect(naoSaiu('scheduled', '2026-10-30T11:00:00Z', AGORA)).toBe(true)
    expect(naoSaiu('processed', '2026-11-05T12:59:00Z', AGORA)).toBe(true)
  })

  it('dentro da folga, ou ainda por vir, segue agendado', () => {
    expect(naoSaiu('scheduled', '2026-11-05T13:30:00Z', AGORA)).toBe(false)
    expect(naoSaiu('scheduled', '2026-11-06T11:00:00Z', AGORA)).toBe(false)
  })

  it('o que já tem status final, ou não tem horário, não entra', () => {
    for (const status of ['sent', 'delivered', 'read', 'failed', 'canceled']) {
      expect(naoSaiu(status, '2026-10-30T11:00:00Z', AGORA)).toBe(false)
    }
    expect(naoSaiu('scheduled', null, AGORA)).toBe(false)
  })

  it('o limite é o horário menos a folga', () => {
    expect(limiteDoNaoSaiu(AGORA)).toBe('2026-11-05T13:00:00.000Z')
  })
})
