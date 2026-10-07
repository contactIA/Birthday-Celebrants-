import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ClienteDoBanco, ClinicaRow } from '@/shared/db'
import {
  CHAVE_DE_TESTE,
  CONTA,
  bancoFalso,
  cifrar,
  clinicaDoCadastro,
  origemDaUnidade,
  produtoDoCadastro,
  unidadeDoCadastro,
  type BancoFalso,
  type Tabelas,
} from './cadastro-falso'

// As duas posições do CADASTRO_UNIFICADO no acessor: desligada, a clínica vem
// das tabelas deste app, como sempre veio; ligada, das visões do cadastro. O
// banco é o falso de `cadastro-falso.ts`, no lugar do cliente real.

const atual = vi.hoisted(() => ({ cliente: null as unknown }))
vi.mock('@/shared/db', async (original) => ({
  ...(await original<typeof import('@/shared/db')>()),
  db: () => (atual.cliente as ClienteDoBanco).schema('aniversariantes'),
  clienteDoBanco: () => atual.cliente as ClienteDoBanco,
}))

const {
  CadastroNoCrmError,
  ClinicaNaoProvisionadaError,
  buscarClinica,
  buscarClinicaNoSetup,
  buscarClinicaPorId,
  buscarClinicaPublica,
  cadastroComumLigado,
  companyIdsCadastrados,
  criarUnidade,
  exigirCadastroLocal,
  listarTodasAsClinicas,
} = await import('./repositorio')

const CLINICA_AQUI = 'd0000000-0000-4000-8000-000000000001'
const PRINCIPAL_AQUI = 'b0000000-0000-4000-8000-000000000001'

/** A linha local de hoje, com as credenciais em texto (as colunas antigas). */
const LINHA_LOCAL: ClinicaRow = {
  id: CLINICA_AQUI,
  slug: CONTA,
  nome: 'Prev Odonto (antigo)',
  eclinica_token: null,
  eclinica_base_url: 'https://eclinica.app/api/v2',
  helena_token: 'token-antigo',
  helena_channel_id: 'canal-antigo',
  helena_from: '5545911110000',
  helena_department_id: null,
  helena_campo_nascimento: null,
  timezone: 'America/Sao_Paulo',
  created_at: '2026-09-15T12:00:00Z',
  sistema_prontuario: 'clinicorp',
  clinicorp_usuario_api: 'api-antigo',
  clinicorp_token_api: 'clinicorp-antigo',
  clinicorp_subscriber_id: 'antigo',
  clinicorp_base_url: 'https://api.clinicorp.com/rest/v1',
}

/** O mesmo banco nas duas posições: as tabelas de hoje e o cadastro já importado. */
function tabelas(): Tabelas {
  return {
    'aniversariantes.aniversariantes_clinicas': [{ ...LINHA_LOCAL }],
    'aniversariantes.aniversariantes_unidades': [
      {
        id: PRINCIPAL_AQUI,
        clinica_id: CLINICA_AQUI,
        nome: 'Principal',
        principal: true,
        sistema_prontuario: null,
        eclinica_token: null,
        eclinica_base_url: null,
        clinicorp_usuario_api: null,
        clinicorp_token_api: null,
        clinicorp_subscriber_id: null,
        clinicorp_base_url: null,
        helena_from: null,
        helena_channel_id: null,
        helena_department_id: null,
        created_at: '2026-09-15T12:00:00Z',
      },
    ],
    'cadastro.clinicas': [clinicaDoCadastro()],
    'cadastro.produtos': [produtoDoCadastro()],
    'cadastro.unidades': [unidadeDoCadastro()],
    'cadastro.unidade_origens': [origemDaUnidade()],
  }
}

let banco: BancoFalso
const envAntes = { ...process.env }

beforeEach(() => {
  banco = bancoFalso(tabelas())
  atual.cliente = banco.cliente
})

afterEach(() => {
  for (const nome of ['CADASTRO_UNIFICADO', 'CADASTRO_CHAVE_CIFRAGEM']) {
    const antes = envAntes[nome]
    if (antes === undefined) delete process.env[nome]
    else process.env[nome] = antes
  }
  vi.restoreAllMocks()
})

function ligar() {
  process.env.CADASTRO_UNIFICADO = '1'
  process.env.CADASTRO_CHAVE_CIFRAGEM = CHAVE_DE_TESTE
}

const leuOCadastro = () => banco.operacoes.some((o) => o.tabela.startsWith('cadastro.'))

describe('CADASTRO_UNIFICADO desligado: tudo como hoje', () => {
  it('a variável vazia, ausente ou com outro valor desliga', () => {
    delete process.env.CADASTRO_UNIFICADO
    expect(cadastroComumLigado()).toBe(false)
    process.env.CADASTRO_UNIFICADO = ''
    expect(cadastroComumLigado()).toBe(false)
    process.env.CADASTRO_UNIFICADO = 'talvez'
    expect(cadastroComumLigado()).toBe(false)
  })

  it('a clínica vem de aniversariantes_clinicas, e o cadastro nem é consultado', async () => {
    delete process.env.CADASTRO_UNIFICADO
    const c = await buscarClinica(CONTA)
    expect(c).toMatchObject({
      id: CLINICA_AQUI,
      nome: 'Prev Odonto (antigo)',
      unidade: { id: PRINCIPAL_AQUI, principal: true },
      credenciais: { mensageria: { token: 'token-antigo', from: '5545911110000' }, clinicorp: { tokenApi: 'clinicorp-antigo' } },
    })
    expect(leuOCadastro()).toBe(false)
  })

  it('o setup escreve, como hoje', () => {
    delete process.env.CADASTRO_UNIFICADO
    expect(() => exigirCadastroLocal()).not.toThrow()
  })
})

describe('CADASTRO_UNIFICADO ligado: a clínica vem do cadastro comum', () => {
  it('a mesma Clinica de hoje, com os dados do cadastro e os ids deste app', async () => {
    ligar()
    const c = await buscarClinica(CONTA)
    expect(c).toMatchObject({
      id: CLINICA_AQUI,
      companyId: CONTA,
      nome: 'Prev Odonto',
      unidade: { id: PRINCIPAL_AQUI, nome: 'Centro', principal: true },
      sistemaProntuario: 'clinicorp',
      credenciais: {
        clinicorp: { usuarioApi: 'api@prev', tokenApi: 'token-clinicorp', subscriberId: 'prevodonto' },
        mensageria: {
          token: 'token-da-plataforma',
          from: '5545999990001',
          channelId: 'canal-centro',
          campoNascimento: 'data-de-nascimento',
        },
      },
    })
    expect(JSON.stringify(c)).not.toContain('antigo')
  })

  it('o cabeçalho do painel abre sem a chave: não decifra nada', async () => {
    ligar()
    delete process.env.CADASTRO_CHAVE_CIFRAGEM
    const p = await buscarClinicaPublica(CONTA.toUpperCase())
    // A conta volta como a requisição a trouxe: o proxy a compara com a do escopo.
    expect(p).toEqual({
      id: CLINICA_AQUI,
      companyId: CONTA.toUpperCase(),
      nome: 'Prev Odonto',
      unidades: [{ id: PRINCIPAL_AQUI, nome: 'Centro', principal: true }],
      unidadeAtualId: PRINCIPAL_AQUI,
    })
  })

  it('o produto desligado no CRM: não provisionada, mesmo com a linha antiga aqui', async () => {
    ligar()
    banco.tabelas['cadastro.produtos'] = [produtoDoCadastro({ ligado: false })]
    await expect(buscarClinica(CONTA)).rejects.toBeInstanceOf(ClinicaNaoProvisionadaError)
  })

  it('o setup lê pelo id local e não escreve: a clínica se edita no CRM', async () => {
    ligar()
    const setup = await buscarClinicaNoSetup(CLINICA_AQUI)
    expect(setup).toMatchObject({ id: CLINICA_AQUI, cadastroComum: true, nome: 'Prev Odonto' })
    expect((await buscarClinicaPorId(CLINICA_AQUI, PRINCIPAL_AQUI)).unidade.id).toBe(PRINCIPAL_AQUI)
    expect(() => exigirCadastroLocal()).toThrow(CadastroNoCrmError)
    await expect(
      criarUnidade(CLINICA_AQUI, {
        nome: 'Nova',
        sistemaProntuario: 'eclinica',
        eclinica: { token: 't', baseUrl: 'https://eclinica.app/api/v2' },
        clinicorp: { usuarioApi: null, tokenApi: null, subscriberId: null, baseUrl: 'https://api.clinicorp.com/rest/v1' },
        from: null,
        channelId: null,
        equipeId: null,
      })
    ).rejects.toBeInstanceOf(CadastroNoCrmError)
    expect(banco.operacoes.filter((o) => o.tipo === 'insert')).toEqual([])
  })

  it('os crons: uma entrada por unidade; a que não abre fica de fora, com o motivo no log', async () => {
    ligar()
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {})
    banco.tabelas['cadastro.unidades'] = [
      unidadeDoCadastro(),
      unidadeDoCadastro({
        id: 'a0000000-0000-4000-8000-000000000002',
        nome: 'Norte',
        principal: false,
        prontuario_credenciais_cifradas: cifrar('{}', Buffer.alloc(32, 9).toString('base64')),
      }),
    ]
    const clinicas = await listarTodasAsClinicas()
    expect(clinicas.map((c) => c.unidade.nome)).toEqual(['Centro'])
    expect(erro).toHaveBeenCalledWith(expect.stringContaining('Norte'))
  })

  it('a fila de interessados vê as contas com o produto ligado', async () => {
    ligar()
    expect([...(await companyIdsCadastrados())]).toEqual([CONTA])
  })
})
