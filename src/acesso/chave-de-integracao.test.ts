import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { conferirChaveDeIntegracao, conferirChavePeloHash } from './chave-de-integracao'

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

describe('conferirChavePeloHash', () => {
  const HASH = createHash('sha256').update(CHAVE).digest('hex')

  it('a chave certa libera, com o hash em qualquer caixa e com espaço em volta', () => {
    expect(conferirChavePeloHash(`Bearer ${CHAVE}`, HASH)).toBe('liberar')
    expect(conferirChavePeloHash(`Bearer ${CHAVE}`, ` ${HASH.toUpperCase()}\n`)).toBe('liberar')
  })

  it.each([
    ['ausente', undefined],
    ['vazio', ''],
    ['a chave em vez do hash', CHAVE],
    ['hash curto', HASH.slice(0, 63)],
    ['hash com caractere de fora', `${HASH.slice(0, 63)}g`],
  ])('hash %s: não configurada', (_, hash) => {
    expect(conferirChavePeloHash(`Bearer ${CHAVE}`, hash)).toBe('nao-configurada')
  })

  it.each([
    ['sem header', null],
    ['sem o Bearer', CHAVE],
    ['o próprio hash como chave', `Bearer ${HASH}`],
    ['outra chave', `Bearer ${CHAVE}x`],
  ])('nega: %s', (_, header) => {
    expect(conferirChavePeloHash(header, HASH)).toBe('negar')
  })
})
