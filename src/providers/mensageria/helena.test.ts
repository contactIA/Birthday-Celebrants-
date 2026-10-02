import { describe, expect, it } from 'vitest'
import { canaisDaEquipe, classificarErro, nomeAusente, oQueCompletar, paraCampoDeData, paraCanais } from './helena'

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

describe('classificarErro: a mesma chave, causas diferentes', () => {
  const erro = (key: string, text: string) =>
    JSON.stringify({ customData: null, httpStatusCode: 'INTERNALSERVERERROR', error: true, key, text })

  it('canal fora da equipe NÃO é recurso desativado', () => {
    // O corpo real, copiado do log de produção.
    expect(classificarErro(erro('ENTITY_NOT_FOUND', 'Esse canal não esta associado a esse departamento.'))).toBe(
      'canal-fora-da-equipe'
    )
  })

  it('recurso desativado é só quando a frase diz isso', () => {
    expect(classificarErro(erro('ENTITY_NOT_FOUND', 'App Mensagens agendadas não está habilitado'))).toBe(
      'recurso-nao-habilitado'
    )
  })

  it('outro "não encontrado" fica genérico', () => {
    expect(classificarErro(erro('ENTITY_NOT_FOUND', 'Template não encontrado'))).toBe('nao-encontrado')
  })

  it('remetente que não é canal da conta', () => {
    expect(classificarErro(erro('ENTITY_NOT_FOUND', 'Canal de comunicação não encontrado (5562931930175)'))).toBe(
      'remetente-nao-encontrado'
    )
  })

  it('contato inexistente', () => {
    expect(classificarErro(erro('ENTITY_NOT_FOUND', 'Contato não encontrado'))).toBe('contato-nao-encontrado')
  })

  it('cancelar o que já não está agendado', () => {
    expect(classificarErro(erro('ENTITY_ERROR_SAVE', 'Erro ao salvar'))).toBe('mensagem-nao-esta-agendada')
    expect(classificarErro(erro('X', 'Só é possível cancelar mensagens que estão agendadas'))).toBe(
      'mensagem-nao-esta-agendada'
    )
  })

  it('acento escapado no JSON e corpo que não é JSON', () => {
    expect(classificarErro('{"key":"ENTITY_NOT_FOUND","text":"Esse canal n\u00e3o esta associado a esse departamento."}')).toBe(
      'canal-fora-da-equipe'
    )
    expect(classificarErro('Bad Gateway')).toBe('outro')
  })
})

describe('paraCanais', () => {
  it('fica com os de WhatsApp, com o número em dígitos e o nome da conta', () => {
    expect(
      paraCanais([
        { id: 'c1', active: true, number: '+55|6231930175', identity: { displayName: 'Recepção' } },
        { id: 'c2', active: false, number: '+55|62981878291', name: 'Antigo' },
        { id: 'c3', active: true, number: null, identity: { displayName: 'Instagram' } },
      ])
    ).toEqual([
      { id: 'c1', numero: '556231930175', nome: 'Recepção', ativo: true },
      { id: 'c2', numero: '5562981878291', nome: 'Antigo', ativo: false },
    ])
  })

  it('sem nome, o número formatado', () => {
    expect(paraCanais([{ id: 'c1', number: '553821000921' }])[0]?.nome).toBe('(38) 2100-0921')
  })
})

describe('canaisDaEquipe', () => {
  it('ALL = todos os canais da conta', () => expect(canaisDaEquipe({ scope: 'ALL', channels: [] })).toBe('todos'))
  it('NONE = nenhum', () => expect(canaisDaEquipe({ scope: 'NONE', channels: ['c1'] })).toEqual([]))
  it('SELECTED = os listados, como id ou objeto', () => {
    expect(canaisDaEquipe({ scope: 'SELECTED', channels: ['c1', { id: 'c2' }, 3] })).toEqual(['c1', 'c2'])
  })
  it('resposta vazia = nenhum', () => expect(canaisDaEquipe(null)).toEqual([]))
})
