import { describe, expect, it, vi } from 'vitest'
import type { Clinica } from '@/shared/clinica/repositorio'
import {
  BASE_URL_CLINICORP,
  BASE_URL_ECLINICA,
  CadastroInvalidoError,
  camposAlterados,
  lerEntrada,
  lerValidade,
  montarClinica,
  type EntradaDeClinica,
} from './regras'
import { conferirRemetente, testarConexao } from './conexao'

const COMPANY = '7b1a1c2e-3d4f-4a5b-8c6d-0e1f2a3b4c5d'

const NOVA: EntradaDeClinica = {
  companyId: COMPANY,
  nome: 'Clínica Sorriso',
  sistemaProntuario: 'clinicorp',
  clinicorpUsuarioApi: 'usuario',
  clinicorpTokenApi: 'token-cp',
  clinicorpSubscriberId: 'sub-1',
  mensageriaToken: 'token-msg',
}

function existente(): Clinica {
  return montarClinica(NOVA, null)
}

describe('lerEntrada', () => {
  it('aceita só os campos conhecidos — o resto não vira coluna', () => {
    const e = lerEntrada({ nome: 'X', slug: 'outra', helena_token: 'y', id: 'z' })
    expect(e).toEqual({ nome: 'X' })
  })

  it('recusa campo conhecido com tipo errado', () => {
    expect(() => lerEntrada({ nome: 42 })).toThrow(CadastroInvalidoError)
  })

  it('recusa corpo que não é objeto', () => {
    expect(() => lerEntrada(null)).toThrow(CadastroInvalidoError)
    expect(() => lerEntrada('texto')).toThrow(CadastroInvalidoError)
  })
})

describe('montarClinica — cadastro', () => {
  it('monta a clínica com defaults de fuso e URLs', () => {
    const c = montarClinica(NOVA, null)
    expect(c).toMatchObject({
      id: '',
      companyId: COMPANY,
      nome: 'Clínica Sorriso',
      timezone: 'America/Sao_Paulo',
      sistemaProntuario: 'clinicorp',
    })
    expect(c.credenciais.clinicorp.baseUrl).toBe(BASE_URL_CLINICORP)
    expect(c.credenciais.eclinica.baseUrl).toBe(BASE_URL_ECLINICA)
  })

  it('normaliza o company_id para minúsculas e tira espaços', () => {
    const c = montarClinica({ ...NOVA, companyId: `  ${COMPANY.toUpperCase()} ` }, null)
    expect(c.companyId).toBe(COMPANY)
  })

  it.each([
    ['sem company_id', { companyId: '' }, /company_id/],
    ['company_id que não é UUID', { companyId: 'oral-foz' }, /UUID/],
    ['placeholder não substituído', { companyId: '{idaccount}' }, /UUID/],
    ['sem nome', { nome: '  ' }, /nome/],
    ['sem sistema', { sistemaProntuario: '' }, /sistema/],
    ['sistema desconhecido', { sistemaProntuario: 'dentalpro' }, /não suportado/],
    ['fuso fora da lista', { timezone: 'Europe/Lisbon' }, /Fuso/],
    ['sem token de mensageria', { mensageriaToken: '' }, /mensagens/],
    ['URL http', { clinicorpBaseUrl: 'http://api.clinicorp.com' }, /https/],
    ['URL inválida', { eclinicaBaseUrl: 'não é url' }, /inválida/],
  ])('recusa %s', (_, alteracao, mensagem) => {
    expect(() => montarClinica({ ...NOVA, ...alteracao }, null)).toThrow(mensagem)
  })

  it('NÃO valida completude das credenciais do prontuário — isso é do banco', () => {
    // A check constraint é a fonte da verdade (ADR 0002). Duplicar aqui
    // divergiria dela na primeira mudança.
    const c = montarClinica({ ...NOVA, clinicorpTokenApi: '' }, null)
    expect(c.credenciais.clinicorp.tokenApi).toBeNull()
  })

  it('URL vazia volta ao padrão; barra final sai', () => {
    const c = montarClinica({ ...NOVA, clinicorpBaseUrl: '', eclinicaBaseUrl: 'https://outra.api/v2/' }, null)
    expect(c.credenciais.clinicorp.baseUrl).toBe(BASE_URL_CLINICORP)
    expect(c.credenciais.eclinica.baseUrl).toBe('https://outra.api/v2')
  })
})

describe('montarClinica — edição', () => {
  it('SEGREDO em branco MANTÉM o valor atual', () => {
    // O caso que motivou a regra: a tela nunca recebe o token, então ele chega
    // vazio em toda edição. Salvar só o nome não pode apagar os tokens.
    const c = montarClinica({ nome: 'Novo nome', clinicorpTokenApi: '', mensageriaToken: '' }, existente())
    expect(c.nome).toBe('Novo nome')
    expect(c.credenciais.clinicorp.tokenApi).toBe('token-cp')
    expect(c.credenciais.mensageria.token).toBe('token-msg')
  })

  it('segredo preenchido substitui', () => {
    const c = montarClinica({ clinicorpTokenApi: 'token-novo' }, existente())
    expect(c.credenciais.clinicorp.tokenApi).toBe('token-novo')
  })

  it('campo ABERTO vazio limpa; ausente mantém', () => {
    const c = montarClinica({ mensageriaFrom: '' }, montarClinica({ ...NOVA, mensageriaFrom: '5545999' }, null))
    expect(c.credenciais.mensageria.from).toBeNull()
    expect(c.credenciais.clinicorp.usuarioApi).toBe('usuario')
  })

  it('preserva o id da linha', () => {
    const c = montarClinica({}, { ...existente(), id: 'id-da-linha' })
    expect(c.id).toBe('id-da-linha')
  })

  it('company_id não muda — nem se vier outro no corpo', () => {
    expect(() =>
      montarClinica({ companyId: '00000000-0000-4000-8000-000000000000' }, existente())
    ).toThrow(/não pode ser alterado/)
  })

  it('o mesmo company_id no corpo (em outra caixa) é aceito', () => {
    expect(montarClinica({ companyId: COMPANY.toUpperCase() }, existente()).companyId).toBe(COMPANY)
  })
})

describe('camposAlterados', () => {
  it('lista os NOMES dos campos que mudaram — nunca valores', () => {
    const antes = existente()
    const depois = montarClinica({ nome: 'Outro', clinicorpTokenApi: 'novo' }, antes)
    const alterados = camposAlterados(antes, depois)
    expect(alterados).toEqual(['nome', 'clinicorpTokenApi'])
    expect(alterados.join()).not.toContain('novo')
  })

  it('nada mudou, lista vazia', () => {
    const antes = existente()
    expect(camposAlterados(antes, montarClinica({ clinicorpTokenApi: '' }, antes))).toEqual([])
  })
})

describe('lerValidade', () => {
  it.each(['sem', '30d', '7d', '24h'])('aceita %s', (v) => expect(lerValidade(v)).toBe(v))

  it.each(['1ano', '', null, 30])('recusa %s', (v) => {
    expect(() => lerValidade(v)).toThrow(CadastroInvalidoError)
  })
})

describe('testarConexao', () => {
  it('cada teste falha sozinho — um erro de prontuário não esconde a mensageria', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const r = await testarConexao(existente(), {
      testarProntuario: async () => {
        throw new Error('/patient/birthdays: HTTP 401')
      },
      testarMensageria: async () => 'conectada — 3 modelos',
    })
    expect(r).toEqual({
      prontuario: { ok: false, mensagem: '/patient/birthdays: HTTP 401' },
      mensageria: { ok: true, mensagem: 'conectada — 3 modelos' },
    })
  })

  it('erro sem mensagem vira frase genérica', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const r = await testarConexao(existente(), {
      testarProntuario: async () => {
        throw 'string solta'
      },
      testarMensageria: async () => 'ok',
    })
    expect(r.prontuario).toEqual({ ok: false, mensagem: expect.stringMatching(/inesperada/) })
  })
})

describe('conferirRemetente', () => {
  const CANAL = '556231930175' // como listarRemetentes devolve

  it('aceita o mesmo número escrito de outro jeito', () => {
    expect(conferirRemetente('(62) 3193-0175', [CANAL])).toMatchObject({ ok: true })
    expect(conferirRemetente('556231930175', [CANAL])).toMatchObject({ ok: true })
  })

  it('recusa número que não é canal — e lista os disponíveis', () => {
    // O caso real: o 9 a mais num número fixo.
    const r = conferirRemetente('5562931930175', [CANAL])
    expect(r.ok).toBe(false)
    expect(r.mensagem).toMatch(/não é um canal desta conta/)
    expect(r.mensagem).toMatch(/\(62\) 3193-0175/)
  })

  it('remetente vazio com um canal só: usa o da conta', () => {
    expect(conferirRemetente('', [CANAL])).toMatchObject({ ok: true, mensagem: expect.stringMatching(/canal da conta/) })
  })

  it('remetente vazio com vários canais: avisa que falta escolher', () => {
    expect(conferirRemetente(null, [CANAL, '5562999990000']).mensagem).toMatch(/defina qual usar/)
  })

  it('conta sem canal ativo falha', () => {
    expect(conferirRemetente(null, [])).toMatchObject({ ok: false })
  })
})
