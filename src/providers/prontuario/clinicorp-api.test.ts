import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Clinica } from '@/shared/clinica/repositorio'
import {
  clienteClinicorp,
  CotaEsgotadaError,
  ehDiaSemAniversariante,
  esperaAntesDaTentativa,
  TENTATIVAS,
} from './clinicorp-api'

const CLINICA = {
  id: 'id-1',
  companyId: 'c1',
  nome: 'Clínica',
  sistemaProntuario: 'clinicorp',
  timezone: 'America/Sao_Paulo',
  credenciais: {
    eclinica: { token: null, baseUrl: '' },
    clinicorp: { usuarioApi: 'u', tokenApi: 't', subscriberId: 's', baseUrl: 'https://api.teste' },
    mensageria: { token: 'x', from: null, channelId: null },
  },
} satisfies Clinica

function resposta(status: number, corpo: unknown = {}, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(corpo), { status, headers })
}

describe('esperaAntesDaTentativa', () => {
  it('respeita o Retry-After, em segundos', () => {
    expect(esperaAntesDaTentativa(1, '3')).toBe(3000)
  })

  it('Retry-After longo = não tentar de novo (null)', () => {
    // Em produção veio 2286s: a cota da hora acabou. Cortar em 30s e tentar de
    // novo não passava nunca e alongava a sincronização em dezenas de minutos.
    expect(esperaAntesDaTentativa(1, '2286')).toBeNull()
    expect(esperaAntesDaTentativa(1, '30')).toBe(30_000)
  })

  it('sem Retry-After, cresce a cada tentativa', () => {
    expect(esperaAntesDaTentativa(1, null, 0)).toBe(1000)
    expect(esperaAntesDaTentativa(2, null, 0)).toBe(2000)
    expect(esperaAntesDaTentativa(3, null, 0)).toBe(4000)
  })

  it('Retry-After em formato de data cai para a espera crescente', () => {
    expect(esperaAntesDaTentativa(2, 'Wed, 23 Sep 2026 14:00:00 GMT', 0)).toBe(2000)
  })
})

describe('ehDiaSemAniversariante', () => {
  it('reconhece o 400 de dia vazio pela mensagem', () => {
    expect(
      ehDiaSemAniversariante(400, '{"Error":400,"Message":"Nenhum paciente ativo faz aniversário na data informada!"}')
    ).toBe(true)
  })

  it('400 de parâmetro faltando continua sendo erro', () => {
    expect(ehDiaSemAniversariante(400, '{"Error":1,"Message":"Parâmetro obrigatório não informado"}')).toBe(false)
  })

  it('só vale para 400', () => {
    expect(ehDiaSemAniversariante(404, 'Nenhum paciente')).toBe(false)
  })
})

describe('retentativas', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    fetchMock.mockReset()
  })

  it('tenta de novo depois de um 429 e devolve o resultado', async () => {
    fetchMock
      .mockResolvedValueOnce(resposta(429, {}, { 'retry-after': '1' }))
      .mockResolvedValueOnce(resposta(200, [{ PatientId: 7, Name: 'Maria', BirthDate: '1990-09-02', MobilePhone: null }]))

    const promessa = clienteClinicorp(CLINICA).aniversariantesDoDia('2026-09-02')
    await vi.runAllTimersAsync()

    await expect(promessa).resolves.toHaveLength(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('desiste depois do limite de tentativas', async () => {
    fetchMock.mockImplementation(async () => resposta(429))

    const promessa = clienteClinicorp(CLINICA).aniversariantesDoDia('2026-09-02')
    const verificacao = expect(promessa).rejects.toThrow('/patient/birthdays: HTTP 429')
    await vi.runAllTimersAsync()

    await verificacao
    expect(fetchMock).toHaveBeenCalledTimes(TENTATIVAS)
  })

  it('cota da hora esgotada: desiste na PRIMEIRA resposta, sem esperar', async () => {
    fetchMock.mockResolvedValueOnce(resposta(429, { message: 'API rate limit exceeded' }, { 'retry-after': '2286' }))

    const erro = await clienteClinicorp(CLINICA)
      .aniversariantesDoDia('2026-09-02')
      .catch((e: Error) => e)

    expect(erro).toBeInstanceOf(CotaEsgotadaError)
    expect((erro as CotaEsgotadaError).message).toMatch(/libera em 39 min/)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('não tenta de novo um 400 — repetir não muda a resposta', async () => {
    fetchMock.mockResolvedValueOnce(resposta(400, { message: 'data inválida' }))

    await expect(clienteClinicorp(CLINICA).aniversariantesDoDia('2026-09-02')).rejects.toThrow(
      '/patient/birthdays: HTTP 400'
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('dia sem aniversariante (400 "Nenhum paciente…") é lista vazia, não erro', async () => {
    // Resposta real da Clinicorp. Tratada como erro, adiava a limpeza do cache
    // para sempre em toda clínica com um dia vazio no período.
    fetchMock.mockResolvedValueOnce(
      resposta(400, { Error: 400, Message: 'Nenhum paciente ativo faz aniversário na data informada!' })
    )

    await expect(clienteClinicorp(CLINICA).aniversariantesDoDia('2026-09-02')).resolves.toEqual([])
    expect(console.error).not.toHaveBeenCalled()
  })

  it('o corpo do erro vai para o log, nunca para a exceção', async () => {
    // A exceção sobe até o relatório do cron; o corpo pode ter dado de paciente.
    fetchMock.mockResolvedValueOnce(resposta(400, { message: 'Maria da Silva' }))

    const erro = await clienteClinicorp(CLINICA)
      .aniversariantesDoDia('2026-09-02')
      .catch((e: Error) => e)

    expect((erro as Error).message).not.toMatch(/Maria/)
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Maria da Silva'))
  })
})
