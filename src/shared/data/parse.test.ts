import { describe, it, expect } from 'vitest'
import { parseDataYMD, parseAniversarioPronto, paraExibicao, mesDiaDe } from './parse'

describe('parseDataYMD', () => {
  it('lê data completa', () => {
    expect(parseDataYMD('1990-05-20')).toEqual({
      aniversario: '05/20',
      datanascimento: '20/05/1990',
    })
  })

  it('ignora hora no fim', () => {
    expect(parseDataYMD('1990-05-20T00:00:00')?.aniversario).toBe('05/20')
  })

  // Cada um destes foi observado em produção no lugar de null.
  it.each(['0000-00-00', '0001-01-01', '1990-00-10', '1990-05-00'])(
    'sentinela %s vira null',
    (bruto) => {
      expect(parseDataYMD(bruto)).toBeNull()
    }
  )

  it.each(['1990-13-01', '1990-05-40'])('data impossível %s vira null', (bruto) => {
    expect(parseDataYMD(bruto)).toBeNull()
  })

  it.each([null, undefined, '', 'sei la'])('entrada ausente ou inválida vira null', (bruto) => {
    expect(parseDataYMD(bruto)).toBeNull()
  })
})

describe('parseAniversarioPronto', () => {
  it('lê MM/DD', () => {
    expect(parseAniversarioPronto('05/20')).toEqual({
      aniversario: '05/20',
      datanascimento: null,
    })
  })

  it.each(['00/00', '00/10', '05/00', '13/01', '05/40'])(
    'sentinela ou inválido %s vira null',
    (bruto) => {
      expect(parseAniversarioPronto(bruto)).toBeNull()
    }
  )
})

describe('formatos', () => {
  it('exibe no formato brasileiro', () => {
    expect(paraExibicao('05/20')).toBe('20/05')
  })

  it('extrai mês e dia', () => {
    expect(mesDiaDe('05/20')).toEqual({ mes: 5, dia: 20 })
  })
})
