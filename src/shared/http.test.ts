import { describe, it, expect, vi, afterEach } from 'vitest'
import { lerMes, responderErro, ParametroInvalidoError } from './http'
import { ClinicaNaoProvisionadaError } from './clinica/repositorio'
import { SemEscopoError } from '@/acesso/escopo'
import { ProntuarioIndisponivelError } from '@/providers/prontuario'

afterEach(() => vi.restoreAllMocks())

describe('lerMes', () => {
  it('ausente vira null, para a rota decidir o padrão', () => {
    expect(lerMes(null)).toBeNull()
    expect(lerMes('')).toBeNull()
  })

  it.each([
    ['1', 1],
    ['09', 9],
    ['12', 12],
  ])('aceita %s', (bruto, esperado) => {
    expect(lerMes(bruto)).toBe(esperado)
  })

  it.each(['0', '13', '-1', 'setembro', '1.5', 'NaN'])('recusa %s', (bruto) => {
    expect(() => lerMes(bruto)).toThrow(ParametroInvalidoError)
  })
})

describe('responderErro', () => {
  it.each([
    [new SemEscopoError(), 401, 'SEM_ESCOPO'],
    [new ClinicaNaoProvisionadaError('abc'), 404, 'CLINICA_NAO_PROVISIONADA'],
    [new ProntuarioIndisponivelError('fora do ar'), 502, 'PRONTUARIO_INDISPONIVEL'],
    [new ParametroInvalidoError('Mês inválido'), 400, 'PARAMETRO_INVALIDO'],
  ])('erro de domínio vira %#: status e código próprios', async (erro, status, codigo) => {
    const res = responderErro('teste', erro)
    expect(res.status).toBe(status)
    await expect(res.json()).resolves.toMatchObject({ codigo })
  })

  it('erro inesperado vira 500 genérico', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = responderErro('teste', new Error('conexão falhou: postgres://user:senha@host'))
    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toEqual({
      error: 'Não foi possível completar a operação',
      codigo: 'ERRO_INTERNO',
    })
  })

  it('não vaza a mensagem da exceção no corpo', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const segredo = 'postgres://user:senha@host'
    const res = responderErro('teste', new Error(segredo))
    expect(JSON.stringify(await res.json())).not.toContain('senha')
  })

  it('registra o erro inesperado no log, com contexto', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const erro = new Error('quebrou')
    responderErro('api/aniversariantes', erro)
    expect(log).toHaveBeenCalledWith('[api/aniversariantes]', erro)
  })
})
