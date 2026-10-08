import { describe, expect, it } from 'vitest'
import { contasComOProdutoLigado, lerClinicaDoCadastro, lerClinicasDoCadastro } from './cadastro'
import {
  CLINICA_NO_CRM,
  CONTA,
  bancoFalso,
  clinicaDoCadastro,
  origemDaUnidade,
  produtoDoCadastro,
  unidadeDoCadastro,
  type Tabelas,
} from './cadastro-falso'
import { ClinicaNaoProvisionadaError } from './modelo'

// A leitura do cadastro comum contra um banco falso: as visões do CRM e as
// tabelas deste app, com o gatilho que cria a principal e as chaves únicas.

const CLINICA_AQUI = 'd0000000-0000-4000-8000-000000000001'
const PRINCIPAL_AQUI = 'b0000000-0000-4000-8000-000000000001'
const UNIDADE_NO_CRM = 'a0000000-0000-4000-8000-000000000001'

const nada = () => {}

/** O cadastro de uma clínica com o produto ligado e uma unidade, sem nada local. */
function soNoCadastro(extra: Partial<Tabelas> = {}): Tabelas {
  return {
    'cadastro.clinicas': [clinicaDoCadastro()],
    'cadastro.produtos': [
      produtoDoCadastro({ produto: 'crm', ligado: true, configuracao: {} }),
      produtoDoCadastro(),
      produtoDoCadastro({ produto: 'lembretes', ligado: false, configuracao: {} }),
      produtoDoCadastro({ produto: 'botao', ligado: false, configuracao: {} }),
    ],
    'cadastro.unidades': [unidadeDoCadastro()],
    'cadastro.unidade_origens': [],
    'aniversariantes.aniversariantes_clinicas': [],
    'aniversariantes.aniversariantes_unidades': [],
    ...extra,
  }
}

/** A clínica que já estava neste app, importada (#214) com a origem da principal. */
function importada(extra: Partial<Tabelas> = {}): Tabelas {
  return soNoCadastro({
    'cadastro.unidade_origens': [origemDaUnidade()],
    'aniversariantes.aniversariantes_clinicas': [{ id: CLINICA_AQUI, slug: CONTA, created_at: '2026-09-15T12:00:00Z' }],
    'aniversariantes.aniversariantes_unidades': [{ id: PRINCIPAL_AQUI, clinica_id: CLINICA_AQUI, nome: 'Prev', principal: true }],
    ...extra,
  })
}

const insercoes = (banco: ReturnType<typeof bancoFalso>) => banco.operacoes.filter((o) => o.tipo === 'insert')

describe('lerClinicaDoCadastro', () => {
  it('clínica importada: os ids de antes, e nenhuma linha nova', async () => {
    const banco = bancoFalso(importada())
    const r = await lerClinicaDoCadastro(banco.cliente, CONTA, nada)
    expect(r.idLocal).toBe(CLINICA_AQUI)
    expect(r.unidades.map((u) => u.idLocal)).toEqual([{ id: PRINCIPAL_AQUI, de: 'origem', criar: false }])
    expect(r.campoNascimento).toBe('data-de-nascimento')
    expect(insercoes(banco)).toEqual([])
  })

  it('lê só as visões e as colunas do contrato, filtradas pela conta e pelo produto', async () => {
    const banco = bancoFalso(importada())
    await lerClinicaDoCadastro(banco.cliente, CONTA, nada)
    const lidas = banco.operacoes.filter((o) => o.tabela.startsWith('cadastro.')).map((o) => o.tabela)
    expect(lidas.sort()).toEqual(['cadastro.clinicas', 'cadastro.produtos', 'cadastro.unidade_origens', 'cadastro.unidades'])
  })

  it('clínica que só existe no cadastro: cria a âncora da clínica e a unidade com o id do cadastro', async () => {
    const banco = bancoFalso(soNoCadastro())
    const r = await lerClinicaDoCadastro(banco.cliente, CONTA, nada)

    const [clinica, unidade] = insercoes(banco)
    expect(clinica).toMatchObject({ tabela: 'aniversariantes.aniversariantes_clinicas' })
    expect(clinica!.linhas![0]).toMatchObject({ slug: CONTA, nome: 'Prev Odonto', helena_token: '' })
    expect(unidade).toMatchObject({ tabela: 'aniversariantes.aniversariantes_unidades' })
    expect(unidade!.linhas![0]).toMatchObject({ id: UNIDADE_NO_CRM, clinica_id: r.idLocal, principal: false })
    expect(r.unidades[0]!.idLocal.id).toBe(UNIDADE_NO_CRM)

    // A segunda leitura acha tudo: não cria de novo.
    const antes = banco.operacoes.length
    const de_novo = await lerClinicaDoCadastro(banco.cliente, CONTA, nada)
    expect(de_novo.idLocal).toBe(r.idLocal)
    expect(de_novo.unidades[0]!.idLocal).toEqual({ id: UNIDADE_NO_CRM, de: 'cadastro', criar: false })
    expect(banco.operacoes.slice(antes).filter((o) => o.tipo === 'insert')).toEqual([])
  })

  it('unidade nova no CRM numa clínica importada: cria só ela, e a importada segue com o id de antes', async () => {
    const norte = unidadeDoCadastro({ id: 'a0000000-0000-4000-8000-000000000002', nome: 'Norte', principal: false })
    const banco = bancoFalso(importada({ 'cadastro.unidades': [unidadeDoCadastro(), norte] }))
    const r = await lerClinicaDoCadastro(banco.cliente, CONTA, nada)
    expect(r.unidades.map((u) => u.idLocal.id)).toEqual([PRINCIPAL_AQUI, norte.id])
    expect(insercoes(banco).map((o) => o.linhas![0]!.id)).toEqual([norte.id])
  })

  it('a conta chega com outra caixa e a linha local tem outra: acha a mesma clínica, não duplica', async () => {
    const banco = bancoFalso(
      importada({
        'aniversariantes.aniversariantes_clinicas': [{ id: CLINICA_AQUI, slug: CONTA.toUpperCase(), created_at: '2026-09-15T12:00:00Z' }],
      })
    )
    const r = await lerClinicaDoCadastro(banco.cliente, CONTA.toUpperCase(), nada)
    expect(r.idLocal).toBe(CLINICA_AQUI)
    expect(insercoes(banco)).toEqual([])
  })

  it('produto aniversariantes desligado: não provisionada, e nada é criado', async () => {
    const banco = bancoFalso(soNoCadastro({ 'cadastro.produtos': [produtoDoCadastro({ ligado: false })] }))
    await expect(lerClinicaDoCadastro(banco.cliente, CONTA, nada)).rejects.toBeInstanceOf(ClinicaNaoProvisionadaError)
    expect(insercoes(banco)).toEqual([])
  })

  it('conta fora do cadastro: não provisionada', async () => {
    const banco = bancoFalso(soNoCadastro())
    await expect(
      lerClinicaDoCadastro(banco.cliente, '11111111-2222-4333-8444-555555555555', nada)
    ).rejects.toBeInstanceOf(ClinicaNaoProvisionadaError)
  })

  it('conta que não é UUID: não provisionada, sem consultar o banco', async () => {
    const banco = bancoFalso(soNoCadastro())
    await expect(lerClinicaDoCadastro(banco.cliente, '{idaccount}', nada)).rejects.toBeInstanceOf(ClinicaNaoProvisionadaError)
    expect(banco.operacoes).toEqual([])
  })

  it('a origem que aponta para unidade de outra clínica é ignorada, com aviso', async () => {
    const outraClinica = 'd0000000-0000-4000-8000-000000000009'
    const banco = bancoFalso(
      importada({
        'aniversariantes.aniversariantes_unidades': [
          { id: PRINCIPAL_AQUI, clinica_id: outraClinica, nome: 'De outra', principal: true },
        ],
      })
    )
    const avisos: string[] = []
    const r = await lerClinicaDoCadastro(banco.cliente, CONTA, (t) => avisos.push(t))
    expect(r.unidades[0]!.idLocal.id).toBe(UNIDADE_NO_CRM)
    expect(avisos.join(' ')).toContain('ignorada')
  })

  it('o id do cadastro já é unidade de outra clínica aqui: erro, nunca junta as duas', async () => {
    const banco = bancoFalso(
      importada({
        'cadastro.unidade_origens': [],
        'aniversariantes.aniversariantes_unidades': [
          { id: PRINCIPAL_AQUI, clinica_id: CLINICA_AQUI, nome: 'Prev', principal: true },
          { id: UNIDADE_NO_CRM, clinica_id: 'd0000000-0000-4000-8000-000000000009', nome: 'Alheia', principal: false },
        ],
      })
    )
    await expect(lerClinicaDoCadastro(banco.cliente, CONTA, nada)).rejects.toThrow(/noutra clínica/)
  })

  it('o esquema cadastro não exposto (ou fora do ar): erro com o motivo', async () => {
    const banco = bancoFalso(soNoCadastro(), { 'cadastro.clinicas': 'The schema must be one of the following: aniversariantes' })
    await expect(lerClinicaDoCadastro(banco.cliente, CONTA, nada)).rejects.toThrow(/cadastro\.clinicas.*schema/)
  })

  it('sem unidade ativa com prontuário: resolve sem unidades, e a de fora vem com o motivo', async () => {
    const semProntuario = unidadeDoCadastro({ prontuario_sistema: null, prontuario_credenciais_cifradas: null })
    const banco = bancoFalso(soNoCadastro({ 'cadastro.unidades': [semProntuario] }))
    const r = await lerClinicaDoCadastro(banco.cliente, CONTA, nada)
    expect(r.unidades).toEqual([])
    expect(r.foraDoPainel).toEqual([{ nome: 'Centro', motivo: 'sem_prontuario' }])
  })
})

describe('lerClinicasDoCadastro', () => {
  const OUTRA_CONTA = '22222222-3333-4444-8555-666666666666'
  const OUTRA_CLINICA = 'c0000000-0000-4000-8000-000000000002'

  it('só as clínicas com o produto ligado; a que falha fica de fora sem derrubar as outras', async () => {
    const desligada = 'c0000000-0000-4000-8000-000000000003'
    const banco = bancoFalso(
      importada({
        'cadastro.clinicas': [
          clinicaDoCadastro(),
          clinicaDoCadastro({ id: OUTRA_CLINICA, company_id: OUTRA_CONTA, nome: 'Salutar' }),
          clinicaDoCadastro({ id: desligada, company_id: '33333333-4444-4555-8666-777777777777', nome: 'Desligada' }),
        ],
        'cadastro.produtos': [
          produtoDoCadastro(),
          produtoDoCadastro({ clinica_id: OUTRA_CLINICA, company_id: OUTRA_CONTA }),
          produtoDoCadastro({ clinica_id: desligada, ligado: false }),
        ],
        'cadastro.unidades': [
          unidadeDoCadastro(),
          // O id desta unidade já é de outra clínica aqui: a Salutar falha.
          unidadeDoCadastro({ id: PRINCIPAL_AQUI, clinica_id: OUTRA_CLINICA, company_id: OUTRA_CONTA }),
        ],
      })
    )
    const { resolvidas, falhas } = await lerClinicasDoCadastro(banco.cliente, nada)
    expect(resolvidas.map((r) => r.clinica.nome)).toEqual(['Prev Odonto'])
    expect(falhas.map((f) => f.companyId)).toEqual([OUTRA_CONTA])
  })
})

describe('contasComOProdutoLigado', () => {
  it('as contas com o produto ligado, em minúsculas', async () => {
    const banco = bancoFalso({
      'cadastro.produtos': [
        produtoDoCadastro({ company_id: CONTA.toUpperCase() }),
        produtoDoCadastro({ clinica_id: CLINICA_NO_CRM, company_id: '22222222-3333-4444-8555-666666666666', ligado: false }),
        produtoDoCadastro({ produto: 'lembretes', company_id: '33333333-4444-4555-8666-777777777777' }),
      ],
    })
    expect([...(await contasComOProdutoLigado(banco.cliente))]).toEqual([CONTA])
  })
})
