import { describe, expect, it } from 'vitest'
import { nomeAusente, oQueCompletar, paraCampoDeData } from './helena'

describe('nomeAusente: o nome que a plataforma mostra quando não há contato', () => {
  it.each(['', '   ', '+55 62 98187-8291', '5562981878291', '(62) 98187-8291', '+55|62981878291'])(
    '"%s" não é nome',
    (nome) => expect(nomeAusente(nome)).toBe(true)
  )
  it('null e undefined não são nome', () => {
    expect(nomeAusente(null)).toBe(true)
    expect(nomeAusente(undefined)).toBe(true)
  })
  it.each(['Marina', 'Marina 2', 'Dona Lúcia (mãe)'])('"%s" é nome', (nome) => expect(nomeAusente(nome)).toBe(false))
})

describe('paraCampoDeData', () => {
  it('DD/MM/AAAA vira AAAA-MM-DD, o formato que a plataforma aceita', () => {
    expect(paraCampoDeData('01/03/2006')).toBe('2006-03-01')
  })
  it.each([null, '', '1/3/2006', '01/03/0000', 'lixo'])('%s não vira data', (v) => expect(paraCampoDeData(v)).toBeNull())
})

describe('oQueCompletar: só o que está vazio', () => {
  const CAMPO = 'data-de-nascimento'

  it('contato sem nome e sem nascimento: completa os dois', () => {
    expect(oQueCompletar({ name: '5562981878291', customFields: {} }, 'Marina Souza', CAMPO, '2006-03-01')).toEqual({
      fields: ['Name', 'CustomFields'],
      name: 'Marina Souza',
      customFields: { [CAMPO]: '2006-03-01' },
    })
  })

  it('nome dado pela equipe fica como está', () => {
    expect(oQueCompletar({ name: 'Marina ortodontia', customFields: { [CAMPO]: ['2006/03/01'] } }, 'Marina Souza', CAMPO, '2006-03-01')).toBeNull()
  })

  it('nascimento já preenchido (lista, como a plataforma devolve) não é sobrescrito', () => {
    expect(oQueCompletar({ name: '', customFields: { [CAMPO]: ['1990/01/01'] } }, 'Marina', CAMPO, '2006-03-01')).toEqual({
      fields: ['Name'],
      name: 'Marina',
    })
  })

  it('campo de nascimento vazio (lista vazia) é completado', () => {
    expect(oQueCompletar({ name: 'Marina', customFields: { [CAMPO]: [] } }, 'Marina', CAMPO, '2006-03-01')).toEqual({
      fields: ['CustomFields'],
      customFields: { [CAMPO]: '2006-03-01' },
    })
  })

  it('clínica sem campo de nascimento escolhido: só o nome importa', () => {
    expect(oQueCompletar({ name: 'Marina', customFields: {} }, 'Marina', null, '2006-03-01')).toBeNull()
  })
})
