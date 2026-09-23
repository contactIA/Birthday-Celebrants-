import { describe, it, expect } from 'vitest'
import { digitosComPais, formatarTelefoneBR, paraE164BR } from './e164'

describe('paraE164BR', () => {
  it.each([
    ['(45) 99977-0408', '+5545999770408'],
    ['45999770408', '+5545999770408'],
    ['5545999770408', '+5545999770408'],
    ['+55 (45) 3523-4567', '+554535234567'],
    ['4535234567', '+554535234567'],
  ])('normaliza %s', (bruto, esperado) => {
    expect(paraE164BR(bruto)).toBe(esperado)
  })

  // Todos os casos abaixo vieram de cadastro real do prontuário.
  it.each([
    ['9977-0408FILHA', 'texto colado no número, sem DDD'],
    ['000000', 'placeholder'],
    ['555555555555', 'dígito repetido: estruturalmente válido, mas é placeholder'],
    ['0045999770408', 'DDD inválido'],
    ['45199770408', 'celular de 11 dígitos que não começa com 9'],
    ['', 'vazio'],
  ])('recusa %s (%s)', (bruto) => {
    expect(paraE164BR(bruto)).toBeNull()
  })

  it.each([null, undefined])('recusa entrada ausente', (bruto) => {
    expect(paraE164BR(bruto)).toBeNull()
  })
})

describe('formatarTelefoneBR', () => {
  it.each([
    ['62981878291', '(62) 98187-8291'],
    ['+5562981878291', '(62) 98187-8291'],
    ['556231930175', '(62) 3193-0175'],
    ['+55|6231930175', '(62) 3193-0175'],
    ['(51) 99622-5380', '(51) 99622-5380'],
  ])('%s → %s', (bruto, esperado) => {
    expect(formatarTelefoneBR(bruto)).toBe(esperado)
  })

  it('valor não reconhecido volta como veio — é exibição, não validação', () => {
    expect(formatarTelefoneBR('9977-0408FILHA')).toBe('9977-0408FILHA')
  })

  it('vazio vira string vazia', () => {
    expect(formatarTelefoneBR(null)).toBe('')
  })
})

describe('digitosComPais', () => {
  it('iguala o mesmo número escrito de jeitos diferentes', () => {
    expect(digitosComPais('(62) 3193-0175')).toBe('556231930175')
    expect(digitosComPais('+55|6231930175')).toBe('556231930175')
    expect(digitosComPais('556231930175')).toBe('556231930175')
  })
})
