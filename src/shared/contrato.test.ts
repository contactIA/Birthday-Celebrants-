import { describe, expect, it } from 'vitest'
import { CONTRATO, colunasFaltando } from './contrato'

const BANCO_OK = Object.fromEntries(Object.entries(CONTRATO).map(([t, cols]) => [t, [...cols]]))

describe('colunasFaltando', () => {
  it('banco com todas as colunas: nada falta', () => {
    expect(colunasFaltando(BANCO_OK)).toEqual([])
  })

  it('coluna extra no banco não é problema — o código só lê o que conhece', () => {
    const comExtra = { ...BANCO_OK, aniversariantes_clinicas: [...BANCO_OK.aniversariantes_clinicas!, 'nova'] }
    expect(colunasFaltando(comExtra)).toEqual([])
  })

  it('coluna renomeada do lado do Clinic Control é pega', () => {
    const renomeada = {
      ...BANCO_OK,
      aniversariantes_clinicas: BANCO_OK.aniversariantes_clinicas!.map((c) => (c === 'slug' ? 'company_id' : c)),
    }
    expect(colunasFaltando(renomeada)).toEqual([{ tabela: 'aniversariantes_clinicas', faltando: ['slug'] }])
  })

  it('tabela inteira ausente (schema não exposto) aparece com todas as colunas', () => {
    const semCache = { ...BANCO_OK }
    delete semCache.aniversariantes_pacientes_cache
    const r = colunasFaltando(semCache)
    expect(r).toHaveLength(1)
    expect(r[0]!.faltando).toHaveLength(CONTRATO.aniversariantes_pacientes_cache.length)
  })
})
