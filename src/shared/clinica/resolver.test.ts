import { describe, expect, it } from 'vitest'
import type { ClinicaRow, UnidadeRow } from '@/shared/db'
import { credenciaisDaUnidade, escolherUnidade, ordenarUnidades } from './resolver'

const clinica: ClinicaRow = {
  id: 'c1',
  slug: '7b1a1c2e-3d4f-4a5b-8c6d-0e1f2a3b4c5d',
  nome: 'Clínica',
  eclinica_token: null,
  eclinica_base_url: 'https://eclinica.app/api/v2',
  helena_token: 'tk',
  helena_channel_id: 'canal-matriz',
  helena_from: '5545999990000',
  helena_campo_nascimento: null,
  timezone: 'America/Sao_Paulo',
  created_at: '2026-01-01',
  sistema_prontuario: 'clinicorp',
  clinicorp_usuario_api: 'usuario-matriz',
  clinicorp_token_api: 'token-matriz',
  clinicorp_subscriber_id: 'sub-matriz',
  clinicorp_base_url: 'https://api.clinicorp.com/rest/v1',
}

const base: UnidadeRow = {
  id: 'u',
  clinica_id: 'c1',
  nome: 'Unidade',
  principal: false,
  sistema_prontuario: null,
  eclinica_token: null,
  eclinica_base_url: null,
  clinicorp_usuario_api: null,
  clinicorp_token_api: null,
  clinicorp_subscriber_id: null,
  clinicorp_base_url: null,
  helena_from: null,
  helena_channel_id: null,
  created_at: '2026-01-01',
}

describe('credenciaisDaUnidade', () => {
  it('a principal lê tudo da linha da clínica', () => {
    const c = credenciaisDaUnidade(clinica, { ...base, principal: true })
    expect(c.sistemaProntuario).toBe('clinicorp')
    expect(c.clinicorp.subscriberId).toBe('sub-matriz')
    expect(c.from).toBe('5545999990000')
    expect(c.channelId).toBe('canal-matriz')
  })

  it('a principal ignora credencial gravada na própria unidade', () => {
    const c = credenciaisDaUnidade(clinica, { ...base, principal: true, clinicorp_subscriber_id: 'outro' })
    expect(c.clinicorp.subscriberId).toBe('sub-matriz')
  })

  it('a adicional usa as próprias credenciais e o próprio remetente', () => {
    const c = credenciaisDaUnidade(clinica, {
      ...base,
      sistema_prontuario: 'eclinica',
      eclinica_token: 'tk-filial',
      helena_from: '5545888880000',
    })
    expect(c.sistemaProntuario).toBe('eclinica')
    expect(c.eclinica.token).toBe('tk-filial')
    expect(c.clinicorp.subscriberId).toBeNull()
    expect(c.from).toBe('5545888880000')
  })

  it('a adicional sem remetente NÃO herda o número da clínica', () => {
    const c = credenciaisDaUnidade(clinica, {
      ...base,
      sistema_prontuario: 'clinicorp',
      clinicorp_usuario_api: 'u',
      clinicorp_token_api: 't',
      clinicorp_subscriber_id: 's',
    })
    expect(c.from).toBeNull()
    expect(c.channelId).toBeNull()
  })

  it('a URL da API em branco cai na da clínica', () => {
    const c = credenciaisDaUnidade(clinica, { ...base, sistema_prontuario: 'eclinica', eclinica_token: 'x' })
    expect(c.eclinica.baseUrl).toBe('https://eclinica.app/api/v2')
  })
})

describe('escolherUnidade', () => {
  const unidades = [
    { id: 'a', principal: true },
    { id: 'b', principal: false },
  ]

  it('devolve a pedida quando é desta clínica', () => {
    expect(escolherUnidade(unidades, 'b')?.id).toBe('b')
  })

  it('cai na principal sem pedido, com pedido de outra clínica ou lixo', () => {
    expect(escolherUnidade(unidades, null)?.id).toBe('a')
    expect(escolherUnidade(unidades, 'de-outra-clinica')?.id).toBe('a')
  })

  it('devolve null quando a clínica não tem unidade nenhuma', () => {
    expect(escolherUnidade([], 'a')).toBeNull()
  })
})

describe('ordenarUnidades', () => {
  it('principal primeiro, depois por nome', () => {
    const ordem = ordenarUnidades([
      { nome: 'Zeta', principal: false },
      { nome: 'Centro', principal: true },
      { nome: 'Alfa', principal: false },
    ]).map((u) => u.nome)
    expect(ordem).toEqual(['Centro', 'Alfa', 'Zeta'])
  })
})
