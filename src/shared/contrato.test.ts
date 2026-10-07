import { describe, expect, it } from 'vitest'
import { CONTRATO, CONTRATO_DO_CADASTRO, colunasDoCadastro, colunasFaltando } from './contrato'

describe('o contrato do cadastro comum', () => {
  const CADASTRO_OK = Object.fromEntries(Object.entries(CONTRATO_DO_CADASTRO).map(([v, cols]) => [v, [...cols]]))

  it('confere as visões quando recebe o contrato delas', () => {
    expect(colunasFaltando(CADASTRO_OK, CONTRATO_DO_CADASTRO)).toEqual([])
    const semCanal = { ...CADASTRO_OK, unidades: CADASTRO_OK.unidades!.filter((c) => c !== 'canal_envio_numero') }
    expect(colunasFaltando(semCanal, CONTRATO_DO_CADASTRO)).toEqual([{ tabela: 'unidades', faltando: ['canal_envio_numero'] }])
  })

  it('o esquema não exposto aparece com as quatro visões inteiras', () => {
    expect(colunasFaltando({}, CONTRATO_DO_CADASTRO).map((r) => r.tabela)).toEqual([
      'clinicas',
      'unidades',
      'produtos',
      'unidade_origens',
    ])
  })

  it('o select pede só as colunas do contrato', () => {
    expect(colunasDoCadastro('clinicas')).toBe('id,company_id,nome,fuso_horario,token_plataforma_cifrado')
  })
})

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
