import { describe, it, expect } from 'vitest'
import { paraE164BR } from './e164'

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
