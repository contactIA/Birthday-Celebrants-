import { describe, expect, it } from 'vitest'
import { trechosDoTexto, type DadosDoPaciente } from '@/shared/template/parametros'
import { pedacosDaPrevia, type Pedaco } from './previa'

const MARIA: DadosDoPaciente = {
  nome: 'Maria Souza',
  datanascimento: '20/05/1990',
  aniversario: '05/20',
}

const fixo = (texto: string, estilo: Partial<Pedaco> = {}): Pedaco => ({
  texto,
  negrito: false,
  italico: false,
  riscado: false,
  variavel: null,
  ...estilo,
})

describe('pedacosDaPrevia', () => {
  it('o negrito do WhatsApp por cima do valor, sem os asteriscos', () => {
    const trechos = trechosDoTexto('Oi, *[Nome]*! Parabéns pelo *[ANIVERSÁRIO]*', { Nome: 'primeiro_nome', ANIVERSÁRIO: 'aniversario' }, MARIA)
    expect(pedacosDaPrevia(trechos)).toEqual([
      fixo('Oi, '),
      fixo('Maria', { negrito: true, variavel: 'ligada' }),
      fixo('! Parabéns pelo '),
      fixo('20/05', { negrito: true, variavel: 'ligada' }),
    ])
  })

  it('variável sem campo fica com a marcação, marcada como solta', () => {
    const pedacos = pedacosDaPrevia(trechosDoTexto('Idade: [IDADE]', {}, MARIA))
    expect(pedacos).toEqual([fixo('Idade: '), fixo('[IDADE]', { variavel: 'solta' })])
  })

  it('itálico e riscado; marcador colado em letra ou com espaço por dentro não formata', () => {
    expect(pedacosDaPrevia([{ texto: '_oi_ ~não~ a*b*c * x*' }])).toEqual([
      fixo('oi', { italico: true }),
      fixo(' '),
      fixo('não', { riscado: true }),
      fixo(' a*b*c * x*'),
    ])
  })

  it('não atravessa linha', () => {
    expect(pedacosDaPrevia([{ texto: '*Feliz\naniversário*' }])).toEqual([fixo('*Feliz\naniversário*')])
  })

  it('marcador dentro de um valor não formata o texto do modelo', () => {
    const pedacos = pedacosDaPrevia([
      { texto: 'Oi ' },
      { texto: 'ana_maria', variavel: 'Nome', ligada: true },
      { texto: ' e _parabéns_' },
    ])
    expect(pedacos).toEqual([
      fixo('Oi '),
      fixo('ana_maria', { variavel: 'ligada' }),
      fixo(' e '),
      fixo('parabéns', { italico: true }),
    ])
  })

  it('dois valores vizinhos continuam separados', () => {
    const trechos = trechosDoTexto('{{1}}{{2}}', { 1: 'primeiro_nome', 2: 'aniversario' }, MARIA)
    expect(pedacosDaPrevia(trechos).map((p) => p.texto)).toEqual(['Maria', '20/05'])
  })
})
