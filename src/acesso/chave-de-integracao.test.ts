import { describe, expect, it } from 'vitest'
import { conferirChaveDeIntegracao } from './chave-de-integracao'

const CHAVE = 'chave-de-teste-com-tamanho-qualquer'

describe('conferirChaveDeIntegracao', () => {
  it('sem a variável: não configurada, mesmo com header', () => {
    expect(conferirChaveDeIntegracao(`Bearer ${CHAVE}`, undefined)).toBe('nao-configurada')
    expect(conferirChaveDeIntegracao(`Bearer ${CHAVE}`, '')).toBe('nao-configurada')
    expect(conferirChaveDeIntegracao('Bearer ', '   ')).toBe('nao-configurada')
  })

  it('a chave certa libera', () => {
    expect(conferirChaveDeIntegracao(`Bearer ${CHAVE}`, CHAVE)).toBe('liberar')
  })

  it('o espaço em volta da chave do .env não conta', () => {
    expect(conferirChaveDeIntegracao(`Bearer ${CHAVE}`, `  ${CHAVE}\n`)).toBe('liberar')
  })

  it.each([
    ['sem header', null],
    ['header vazio', ''],
    ['sem o Bearer', CHAVE],
    ['Bearer sem chave', 'Bearer '],
    ['outro esquema', `Basic ${CHAVE}`],
    ['outra chave, mesmo tamanho', `Bearer ${CHAVE.slice(0, -1)}X`],
    ['outra chave, outro tamanho', 'Bearer curta'],
    ['a chave com sobra', `Bearer ${CHAVE}x`],
  ])('nega: %s', (_, header) => {
    expect(conferirChaveDeIntegracao(header, CHAVE)).toBe('negar')
  })
})
