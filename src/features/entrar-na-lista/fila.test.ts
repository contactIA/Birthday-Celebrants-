import { describe, expect, it } from 'vitest'
import { etapaDoPedido, lerStatus, MINIMO_PARA_MOSTRAR, posicaoNaFila, situacaoDaTurma, VAGAS_DA_TURMA } from './fila'

const pedido = (companyId: string, dia: number) => ({ companyId, pedidoEm: `2026-09-${String(dia).padStart(2, '0')}T12:00:00Z` })

describe('posicaoNaFila', () => {
  const pedidos = [pedido('c', 3), pedido('a', 1), pedido('b', 2), pedido('d', 4)]

  it('conta pela ordem de chegada, não pela ordem da lista', () => {
    expect(posicaoNaFila(pedidos, new Set(), 'c')).toEqual({ posicao: 3, naFrente: 2 })
    expect(posicaoNaFila(pedidos, new Set(), 'a')).toEqual({ posicao: 1, naFrente: 0 })
  })

  it('clínica cadastrada sai da fila — e a posição dos outros anda', () => {
    expect(posicaoNaFila(pedidos, new Set(['a']), 'c')).toEqual({ posicao: 2, naFrente: 1 })
  })

  it('a própria clínica cadastrada não tem posição: a vaga foi liberada', () => {
    expect(posicaoNaFila(pedidos, new Set(['c']), 'c')).toEqual({ posicao: null, naFrente: 0 })
  })

  it('compara company_id sem diferenciar maiúsculas', () => {
    expect(posicaoNaFila([pedido('ABC', 1)], new Set(), 'abc').posicao).toBe(1)
  })

  it('conta que ainda não pediu: sem posição, mas sabe quantos esperam', () => {
    expect(posicaoNaFila(pedidos, new Set(), 'z')).toEqual({ posicao: null, naFrente: 4 })
  })
})

describe('situacaoDaTurma — nenhum número inventado', () => {
  it('abaixo do mínimo, não mostra contagem nenhuma', () => {
    expect(situacaoDaTurma(0)).toEqual({ tipo: 'aberta', vagas: VAGAS_DA_TURMA })
    expect(situacaoDaTurma(MINIMO_PARA_MOSTRAR - 1)).toEqual({ tipo: 'aberta', vagas: VAGAS_DA_TURMA })
  })

  it('a partir do mínimo, a contagem é a real', () => {
    expect(situacaoDaTurma(7)).toEqual({ tipo: 'enchendo', vagas: VAGAS_DA_TURMA, pedidos: 7 })
  })

  it('passou do tamanho da turma: completa, com o número real', () => {
    expect(situacaoDaTurma(VAGAS_DA_TURMA)).toMatchObject({ tipo: 'completa', pedidos: VAGAS_DA_TURMA })
    expect(situacaoDaTurma(23)).toMatchObject({ tipo: 'completa', pedidos: 23 })
  })
})

describe('etapaDoPedido', () => {
  it('"liberada" vem do cadastro, qualquer que seja o status salvo', () => {
    expect(etapaDoPedido('recebido', true)).toBe('liberada')
    expect(etapaDoPedido('em_analise', true)).toBe('liberada')
  })

  it('sem cadastro, vale o status marcado no setup', () => {
    expect(etapaDoPedido('em_analise', false)).toBe('em_analise')
    expect(etapaDoPedido('recebido', false)).toBe('recebido')
  })
})

describe('lerStatus', () => {
  it('aceita só as etapas que o setup pode marcar', () => {
    expect(lerStatus({ status: 'em_analise' })).toBe('em_analise')
    expect(lerStatus({ status: 'recebido' })).toBe('recebido')
    expect(lerStatus({ status: 'liberada' })).toBeNull()
    expect(lerStatus(null)).toBeNull()
  })
})
