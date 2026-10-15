import { describe, expect, it } from 'vitest'
import {
  EXPEDIENTE_PADRAO,
  dataHoraComSemana,
  dataHoraLegivel,
  diaDoTexto,
  juntarDataHora,
  lerHorario,
  opcoesDeHorario,
  separarDataHora,
  textoDaData,
  textoDoDia,
} from './datas'

describe('dias', () => {
  it('ida e volta sem mudar o dia', () => {
    expect(textoDoDia(diaDoTexto('2026-10-15')!)).toBe('2026-10-15')
    expect(diaDoTexto('15/10/2026')).toBeUndefined()
  })

  it('o hoje da clínica que o servidor manda', () => {
    expect(textoDaData({ ano: 2026, mes: 3, dia: 9 })).toBe('2026-03-09')
  })
})

describe('dia e horário', () => {
  it('textos legíveis, com o dia da semana', () => {
    expect(dataHoraLegivel('2026-10-02T14:30')).toBe('02/10/2026 às 14:30')
    expect(dataHoraComSemana('2026-10-02T14:30')).toBe('sex, 02/10/2026 às 14:30')
    expect(dataHoraLegivel('')).toBe('')
  })

  it('juntar só com dia, hora e minuto', () => {
    expect(juntarDataHora('2026-11-01', 9, 5)).toBe('2026-11-01T09:05')
    expect(juntarDataHora('2026-11-01', undefined, 0)).toBe('')
    expect(juntarDataHora(undefined, 9, 0)).toBe('')
  })

  it('separar o texto do campo', () => {
    expect(separarDataHora('2026-11-01T09:05')).toEqual({ dia: '2026-11-01', hora: 9, minuto: 5 })
    expect(separarDataHora('')).toEqual({ dia: undefined })
  })
})

describe('lerHorario', () => {
  it('aceita os jeitos comuns de escrever', () => {
    expect(lerHorario('14:30')).toEqual({ hora: 14, minuto: 30 })
    expect(lerHorario('1430')).toEqual({ hora: 14, minuto: 30 })
    expect(lerHorario('14h30')).toEqual({ hora: 14, minuto: 30 })
    expect(lerHorario('14h')).toEqual({ hora: 14, minuto: 0 })
    expect(lerHorario('9')).toEqual({ hora: 9, minuto: 0 })
  })

  it('recusa o que não é horário', () => {
    expect(lerHorario('')).toBeNull()
    expect(lerHorario('24:00')).toBeNull()
    expect(lerHorario('14:60')).toBeNull()
    expect(lerHorario('14:3')).toBeNull()
  })
})

describe('opcoesDeHorario', () => {
  it('o expediente padrão, das 7h às 20h de 5 em 5 minutos', () => {
    const { horas, minutos } = opcoesDeHorario(EXPEDIENTE_PADRAO)
    expect(horas).toEqual([7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20])
    expect(minutos).toHaveLength(12)
  })

  it('um horário gravado fora da grade continua visível', () => {
    const { horas, minutos } = opcoesDeHorario(EXPEDIENTE_PADRAO, { hora: 6, minuto: 7 })
    expect(horas[0]).toBe(6)
    expect(minutos).toContain(7)
  })
})
