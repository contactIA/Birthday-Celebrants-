import { describe, expect, it } from 'vitest'
import { porLetra, pontaAtiva, proximaAtiva } from './teclas-do-seletor'

const OPCOES = [
  { rotulo: 'Sem campo', desativada: true },
  { rotulo: 'Primeiro nome' },
  { rotulo: 'Data da consulta' },
  { rotulo: 'Dia da semana', desativada: true },
  { rotulo: 'Dia relativo ao envio' },
  { rotulo: 'Horário da consulta' },
]

describe('teclas do seletor', () => {
  it('as setas pulam as desativadas e param nas pontas', () => {
    expect(proximaAtiva(OPCOES, -1, 1)).toBe(1)
    expect(proximaAtiva(OPCOES, 2, 1)).toBe(4)
    expect(proximaAtiva(OPCOES, 4, -1)).toBe(2)
    expect(proximaAtiva(OPCOES, 1, -1)).toBe(1)
    expect(proximaAtiva(OPCOES, 5, 1)).toBe(5)
  })

  it('Home e End vão à primeira e à última ativas', () => {
    expect(pontaAtiva(OPCOES, 'inicio')).toBe(1)
    expect(pontaAtiva(OPCOES, 'fim')).toBe(5)
    expect(pontaAtiva([{ rotulo: 'x', desativada: true }], 'inicio')).toBe(-1)
  })

  it('a letra leva à próxima que começa com ela, dando a volta e sem acento', () => {
    expect(porLetra(OPCOES, -1, 'd')).toBe(2)
    expect(porLetra(OPCOES, 2, 'd')).toBe(4)
    expect(porLetra(OPCOES, 4, 'D')).toBe(2)
    expect(porLetra(OPCOES, 1, 'h')).toBe(5)
    expect(porLetra([{ rotulo: 'Ótimo' }], -1, 'o')).toBe(0)
    expect(porLetra(OPCOES, 1, 'z')).toBe(-1)
  })
})
