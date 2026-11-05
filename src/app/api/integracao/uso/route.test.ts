import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import type { ResumoDeUso } from '@/features/resumo-de-uso/resumo'
import { GET } from './route'

const { buscarResumoDeUso } = vi.hoisted(() => ({
  buscarResumoDeUso: vi.fn<(agora: Date, baseUrl: string | null) => Promise<ResumoDeUso>>(),
}))
vi.mock('@/features/resumo-de-uso/dados', () => ({ buscarResumoDeUso }))

const CHAVE = 'chave-de-teste'
const RESUMO: ResumoDeUso = { modulo: 'aniversariantes', geradoEm: '2026-11-05T12:00:00.000Z', clinicas: [] }

function pedir(authorization?: string) {
  const headers = new Headers()
  if (authorization !== undefined) headers.set('authorization', authorization)
  return GET(new NextRequest('http://127.0.0.1:3000/api/integracao/uso', { headers }))
}

describe('GET /api/integracao/uso', () => {
  beforeEach(() => {
    buscarResumoDeUso.mockReset()
    buscarResumoDeUso.mockResolvedValue(RESUMO)
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('503 sem a variável, sem ler nada', async () => {
    vi.stubEnv('INTEGRACAO_USO_CHAVE', '')
    const res = await pedir(`Bearer ${CHAVE}`)
    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({ codigo: 'INTEGRACAO_NAO_CONFIGURADA' })
    expect(buscarResumoDeUso).not.toHaveBeenCalled()
  })

  it.each([undefined, 'Bearer outra', CHAVE])('401 com a chave errada ou sem ela (%s)', async (header) => {
    vi.stubEnv('INTEGRACAO_USO_CHAVE', CHAVE)
    const res = await pedir(header)
    expect(res.status).toBe(401)
    expect(await res.json()).toMatchObject({ codigo: 'NAO_AUTORIZADO' })
    expect(buscarResumoDeUso).not.toHaveBeenCalled()
  })

  it('200 com o resumo, sem cache; sem a URL_PUBLICA, a origem vai nula', async () => {
    vi.stubEnv('INTEGRACAO_USO_CHAVE', CHAVE)
    vi.stubEnv('URL_PUBLICA', '')
    const res = await pedir(`Bearer ${CHAVE}`)
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(await res.json()).toEqual(RESUMO)
    expect(buscarResumoDeUso).toHaveBeenCalledWith(expect.any(Date), null)
  })

  it('com a URL_PUBLICA, a origem vai para o resumo', async () => {
    vi.stubEnv('INTEGRACAO_USO_CHAVE', CHAVE)
    vi.stubEnv('URL_PUBLICA', 'https://app.exemplo')
    expect((await pedir(`Bearer ${CHAVE}`)).status).toBe(200)
    expect(buscarResumoDeUso).toHaveBeenCalledWith(expect.any(Date), 'https://app.exemplo')
  })

  it('500 genérico quando a leitura falha', async () => {
    vi.stubEnv('INTEGRACAO_USO_CHAVE', CHAVE)
    buscarResumoDeUso.mockRejectedValue(new Error('detalhe interno'))
    const res = await pedir(`Bearer ${CHAVE}`)
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'Não foi possível completar a operação', codigo: 'ERRO_INTERNO' })
  })
})
