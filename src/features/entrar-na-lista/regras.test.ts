import { describe, expect, it } from 'vitest'
import { LIMITES, lerPedido, PedidoDeVagaInvalidoError, previaDoModelo } from './regras'

const VALIDO = {
  nomeClinica: 'Clínica Sorriso',
  telefone: '(62) 98187-8291',
  sistemaProntuario: 'clinicorp',
  modeloMensagem: 'Olá, {{nome}}! Feliz aniversário da equipe {{clinica}}!',
  consentimento: true,
}

describe('lerPedido', () => {
  it('aceita o pedido e normaliza o telefone para E.164', () => {
    expect(lerPedido(VALIDO)).toEqual({
      nomeClinica: 'Clínica Sorriso',
      telefone: '+5562981878291',
      sistemaProntuario: 'clinicorp',
      modeloMensagem: VALIDO.modeloMensagem,
    })
  })

  it('ignora company_id no corpo — ele vem do escopo de acesso', () => {
    const r = lerPedido({ ...VALIDO, companyId: 'outra-clinica', company_id: 'x' })
    expect(r).not.toHaveProperty('companyId')
    expect(r).not.toHaveProperty('company_id')
  })

  it.each([
    ['sem consentimento', { consentimento: false }, /autorização/],
    ['consentimento como texto', { consentimento: 'true' }, /autorização/],
    ['sem nome', { nomeClinica: '   ' }, /nome da clínica/],
    ['nome longo demais', { nomeClinica: 'x'.repeat(LIMITES.nome + 1) }, /muito longo/],
    ['telefone inválido', { telefone: '1234' }, /DDD/],
    ['sistema desconhecido', { sistemaProntuario: 'dentalpro' }, /sistema/],
    ['sem mensagem', { modeloMensagem: '' }, /mensagem/],
    ['mensagem longa demais', { modeloMensagem: 'x'.repeat(LIMITES.modelo + 1) }, /até/],
  ])('recusa %s', (_, alteracao, mensagem) => {
    expect(() => lerPedido({ ...VALIDO, ...alteracao })).toThrow(mensagem)
  })

  it('corpo que não é objeto', () => {
    expect(() => lerPedido(null)).toThrow(PedidoDeVagaInvalidoError)
  })
})

describe('previaDoModelo', () => {
  it('troca {{nome}} pelo paciente de exemplo e {{clinica}} pelo nome digitado', () => {
    expect(previaDoModelo(VALIDO.modeloMensagem, 'Clínica Sorriso')).toBe(
      'Olá, Marina! Feliz aniversário da equipe Clínica Sorriso!'
    )
  })

  it('sem nome de clínica ainda, usa "sua clínica"', () => {
    expect(previaDoModelo('Da {{clinica}}', '  ')).toBe('Da sua clínica')
  })

  it('troca todas as ocorrências', () => {
    expect(previaDoModelo('{{nome}}, {{nome}}!', 'X')).toBe('Marina, Marina!')
  })
})
