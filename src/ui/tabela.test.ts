import { describe, expect, it } from 'vitest'
import { iniciais } from './tabela'

describe('iniciais', () => {
  it.each([
    ['Maria Souza', 'MS'],
    ['maria', 'M'],
    ['Elisa Amostra 🟢', 'EA'],
    ['🔴 Carla Teste', 'CT'],
    ['Ângela da Silva', 'ÂS'],
    ['  ', '?'],
    ['🟢', '?'],
  ])('%s → %s', (nome, esperado) => {
    expect(iniciais(nome)).toBe(esperado)
  })
})
