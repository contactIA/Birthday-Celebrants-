import { describe, expect, it } from 'vitest'
import { lerFiltros, SITUACOES, TAMANHO_MAXIMO_DA_BUSCA } from './filtros'

const ler = (q: Record<string, string>) => lerFiltros(new URLSearchParams(q))

describe('lerFiltros', () => {
  it('sem parâmetros: mais recentes pela data de envio, tudo', () => {
    expect(ler({})).toEqual({ busca: null, buscaDigitos: null, situacao: null, ordem: 'envio', crescente: false })
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
  })
})
