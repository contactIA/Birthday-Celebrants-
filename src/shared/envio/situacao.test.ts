import { describe, it, expect } from 'vitest'
import { temMensagemValida } from './situacao'

describe('temMensagemValida', () => {
  it.each(['scheduled', 'processed', 'sent', 'delivered', 'read'])('%s resolve o parabéns do ano', (status) => {
    expect(temMensagemValida(status)).toBe(true)
  })

  it.each(['canceled', 'failed'])('%s deixa agendar de novo — a mensagem não vai sair', (status) => {
    expect(temMensagemValida(status)).toBe(false)
  })

  it('sem envio, não há mensagem', () => {
    expect(temMensagemValida(null)).toBe(false)
    expect(temMensagemValida(undefined)).toBe(false)
  })
})
