import { describe, expect, it } from 'vitest'
import { lerFiltros, limitesDoPeriodo, SITUACOES, TAMANHO_MAXIMO_DA_BUSCA } from './filtros'

const ler = (q: Record<string, string>) => lerFiltros(new URLSearchParams(q))

describe('lerFiltros', () => {
  it('sem parâmetros: mais recentes pela data de envio, tudo', () => {
    expect(ler({})).toEqual({ busca: null, buscaDigitos: null, situacao: null, ordem: 'envio', crescente: false, periodo: null })
  })

  it('busca por nome e por telefone', () => {
    expect(ler({ busca: '  Maria  ' })).toMatchObject({ busca: 'Maria', buscaDigitos: null })
    expect(ler({ busca: '(62) 98187' })).toMatchObject({ buscaDigitos: '6298187' })
  })

  it('tira da busca o que é sintaxe do filtro do banco', () => {
    expect(ler({ busca: 'a,status.eq.x)%_*' }).busca).toBe('a status.eq.x')
  })

  it('corta a busca no tamanho máximo', () => {
    expect(ler({ busca: 'x'.repeat(200) }).busca).toHaveLength(TAMANHO_MAXIMO_DA_BUSCA)
  })

  it('situação, ordem e direção válidas', () => {
    expect(ler({ situacao: 'canceladas', ordem: 'criacao', direcao: 'asc' })).toMatchObject({
      situacao: 'canceladas',
      ordem: 'criacao',
      crescente: true,
    })
  })

  it.each<Record<string, string>>([{ situacao: 'todas' }, { ordem: 'nome' }, { direcao: 'cima' }])('recusa %o', (q) => {
    expect(() => ler(q)).toThrow(/inválida/)
  })

  it('"enviadas" junta enviada, entregue e lida', () => {
    expect(SITUACOES.enviadas).toEqual(['sent', 'delivered', 'read'])
    expect(SITUACOES.nao_sairam).toEqual(['scheduled', 'processed'])
  })

  it('período: sem datas, nenhum; com uma ou as duas, pela data do envio', () => {
    expect(ler({}).periodo).toBeNull()
    expect(ler({ de: '2026-11-01' }).periodo).toEqual({ de: '2026-11-01', ate: null })
    expect(ler({ de: '2026-11-01', ate: '2026-11-30' }).periodo).toEqual({ de: '2026-11-01', ate: '2026-11-30' })
  })

  it.each<Record<string, string>>([{ de: '2026-02-30' }, { ate: '01/11/2026' }, { de: '2026-11-02', ate: '2026-11-01' }])(
    'recusa o período %o',
    (q) => {
      expect(() => ler(q)).toThrow(/inválida|antes da inicial/)
    }
  )
})

describe('limitesDoPeriodo', () => {
  it('da meia-noite da clínica até a meia-noite do dia seguinte, no fuso dela', () => {
    expect(limitesDoPeriodo({ de: '2026-11-05', ate: '2026-11-05' }, 'America/Sao_Paulo')).toEqual({
      desde: '2026-11-05T03:00:00.000Z',
      antesDe: '2026-11-06T03:00:00.000Z',
    })
  })

  it('a virada do mês e outro fuso', () => {
    expect(limitesDoPeriodo({ de: null, ate: '2026-11-30' }, 'America/Manaus')).toEqual({
      desde: null,
      antesDe: '2026-12-01T04:00:00.000Z',
    })
  })
})
