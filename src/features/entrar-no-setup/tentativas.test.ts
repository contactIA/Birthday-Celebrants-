import { describe, expect, it } from 'vitest'
import {
  estaBloqueado,
  JANELA_MS,
  limparVencidos,
  MAXIMO_DE_FALHAS,
  minutosParaLiberar,
  registrarFalha,
  type Registro,
} from './tentativas'

function falhar(vezes: number, agora = 0): Registro | undefined {
  let r: Registro | undefined
  for (let i = 0; i < vezes; i++) r = registrarFalha(r, agora)
  return r
}

describe('tentativas de senha', () => {
  it('não bloqueia quem nunca errou', () => {
    expect(estaBloqueado(undefined, 0)).toBe(false)
  })

  it('não bloqueia antes do limite', () => {
    expect(estaBloqueado(falhar(MAXIMO_DE_FALHAS - 1), 0)).toBe(false)
  })

  it('bloqueia ao atingir o limite', () => {
    expect(estaBloqueado(falhar(MAXIMO_DE_FALHAS), 0)).toBe(true)
  })

  it('libera quando a janela passa', () => {
    expect(estaBloqueado(falhar(MAXIMO_DE_FALHAS), JANELA_MS)).toBe(false)
  })

  it('falha depois da janela recomeça a contagem', () => {
    const r = registrarFalha(falhar(MAXIMO_DE_FALHAS), JANELA_MS + 1)
    expect(r).toEqual({ falhas: 1, desde: JANELA_MS + 1 })
  })

  it('diz quantos minutos faltam, arredondando para cima', () => {
    expect(minutosParaLiberar(falhar(MAXIMO_DE_FALHAS)!, 60_000)).toBe(14)
    expect(minutosParaLiberar(falhar(MAXIMO_DE_FALHAS)!, JANELA_MS - 1)).toBe(1)
  })

  it('limpa só os registros vencidos', () => {
    const mapa = new Map<string, Registro>([
      ['velho', { falhas: 3, desde: 0 }],
      ['novo', { falhas: 1, desde: JANELA_MS }],
    ])
    limparVencidos(mapa, JANELA_MS + 10)
    expect([...mapa.keys()]).toEqual(['novo'])
  })
})
