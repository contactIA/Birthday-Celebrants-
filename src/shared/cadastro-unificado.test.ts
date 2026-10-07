import { describe, expect, it } from 'vitest'
import { cadastroUnificadoLigado } from './cadastro-unificado'

describe('cadastroUnificadoLigado', () => {
  it('liga com 1, true, sim ou ligado, sem diferença de caixa nem espaço', () => {
    for (const valor of ['1', 'true', 'TRUE', 'sim', 'Sim', 'ligado', ' ligado ']) {
      expect(cadastroUnificadoLigado(valor)).toBe(true)
    }
  })

  it('qualquer outro valor desliga, inclusive vazio e ausente: o padrão é o app de hoje', () => {
    for (const valor of [undefined, '', ' ', '0', 'false', 'não', 'nao', 'desligado', 'yes', 'on']) {
      expect(cadastroUnificadoLigado(valor)).toBe(false)
    }
  })
})
