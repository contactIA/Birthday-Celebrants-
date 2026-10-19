import { describe, it, expect } from 'vitest'
import {
  campoPeloNome,
  completarMapeamento,
  resolverParametros,
  renderizar,
  variaveisDoTemplate,
} from './parametros'

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

describe('variaveisDoTemplate', () => {
  it('extrai sem repetir e tolera espaços', () => {
    expect(variaveisDoTemplate('Oi {{1}}, tudo bem {{1}}? {{ 2 }}').map((v) => v.nome)).toEqual(['1', '2'])
  })

  it('template sem variáveis', () => {
    expect(variaveisDoTemplate('Feliz aniversário!')).toEqual([])
  })

  it('lê o formato da plataforma, com acento; colchete que não é nome não vira variável', () => {
    expect(variaveisDoTemplate('Oi, *[Nome]*! {{1}} [ANIVERSÁRIO] [] [!]')).toEqual([
      { nome: 'Nome', marcacao: '[Nome]', obrigatoria: false },
      { nome: '1', marcacao: '{{1}}', obrigatoria: true },
      { nome: 'ANIVERSÁRIO', marcacao: '[ANIVERSÁRIO]', obrigatoria: false },
    ])
  })
})

describe('ligação pelo nome da variável', () => {
  it.each([
    ['Nome', 'primeiro_nome'],
    ['NOME DO PACIENTE', 'primeiro_nome'],
    ['nome_completo', 'nome'],
    ['Data de nascimento', 'data_nascimento'],
    ['ANIVERSÁRIO', 'aniversario'],
  ])('%s → %s', (nome, campo) => expect(campoPeloNome(nome)).toBe(campo))

  it.each(['1', 'DATA', 'IDADE'])('%s: o nome não diz, a clínica escolhe', (nome) => {
    expect(campoPeloNome(nome)).toBeNull()
  })

  it('modelo salvo sem nada ligado sai com o primeiro nome', () => {
    const texto = 'Oi, *[Nome]*! Feliz aniversário 🎉'
    const mapa = completarMapeamento(texto, {})
    expect(mapa).toEqual({ Nome: 'primeiro_nome' })
    expect(renderizar(texto, mapa, PACIENTE)).toBe('Oi, *Maria*! Feliz aniversário 🎉')
  })

  it('o que a clínica salvou vale mais que o nome; campo salvo inválido é ignorado', () => {
    expect(completarMapeamento('[Nome] [ANIVERSÁRIO]', { Nome: 'nome', ANIVERSÁRIO: 'notes' })).toEqual({
      Nome: 'nome',
      ANIVERSÁRIO: 'aniversario',
    })
  })
})
