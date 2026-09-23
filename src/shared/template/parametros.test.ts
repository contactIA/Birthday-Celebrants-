import { describe, it, expect } from 'vitest'
import { resolverParametros, renderizar, parametrosDoTemplate } from './parametros'

const PACIENTE = {
  nome: 'Maria Clara Souza',
  datanascimento: '20/05/1990',
  aniversario: '05/20',
}

describe('resolverParametros', () => {
  it('mapeia cada campo disponível', () => {
    const r = resolverParametros(
      { 1: 'primeiro_nome', 2: 'nome', 3: 'aniversario', 4: 'data_nascimento' },
      PACIENTE
    )
    expect(r).toEqual({
      1: 'Maria',
      2: 'Maria Clara Souza',
      3: '20/05',
      4: '20/05/1990',
    })
  })

  it('campo desconhecido vira string vazia', () => {
    expect(resolverParametros({ 1: 'inexistente' }, PACIENTE)).toEqual({ 1: '' })
  })

  it('nome sem sobrenome ainda resolve primeiro_nome', () => {
    const r = resolverParametros({ 1: 'primeiro_nome' }, { ...PACIENTE, nome: 'Maria' })
    expect(r['1']).toBe('Maria')
  })

  it('mapeamento vazio não produz parâmetro', () => {
    expect(resolverParametros({}, PACIENTE)).toEqual({})
  })
})

describe('renderizar', () => {
  it('substitui todas as ocorrências do mesmo parâmetro', () => {
    const texto = 'Oi {{1}}! Parabéns, {{1}} — {{2}}.'
    expect(renderizar(texto, { 1: 'primeiro_nome', 2: 'aniversario' }, PACIENTE)).toBe(
      'Oi Maria! Parabéns, Maria — 20/05.'
    )
  })

  it('a prévia e o envio concordam sobre campo ausente', () => {
    // A garantia que fecha a divergência das duas implementações antigas: uma
    // preenchia vazio no envio, a outra mantinha o {{n}} literal na prévia.
    const mapeamento = { 1: 'primeiro_nome', 9: 'inexistente' }
    const texto = 'Oi {{1}}, {{9}}'
    const valores = resolverParametros(mapeamento, PACIENTE)
    expect(renderizar(texto, mapeamento, PACIENTE)).toBe(`Oi ${valores['1']}, ${valores['9']}`)
  })

  it('template sem variáveis passa intacto', () => {
    expect(renderizar('Feliz aniversário!', {}, PACIENTE)).toBe('Feliz aniversário!')
  })
})

describe('parametrosDoTemplate', () => {
  it('extrai sem repetir e tolera espaços', () => {
    expect(parametrosDoTemplate('Oi {{1}}, tudo bem {{1}}? {{ 2 }}')).toEqual(['1', '2'])
  })

  it('template sem variáveis', () => {
    expect(parametrosDoTemplate('Feliz aniversário!')).toEqual([])
  })
})
