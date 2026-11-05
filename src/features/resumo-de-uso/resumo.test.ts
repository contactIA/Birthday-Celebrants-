import { describe, expect, it } from 'vitest'
import { SITUACOES } from '@/features/historico/filtros'
import { instanteDoEnvio, resumirUso, STATUS_ENVIADOS, type EntradaDoResumo, type EnvioDoResumo } from './resumo'

const AGORA = new Date('2026-11-05T12:00:00.000Z')
const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const C = '33333333-3333-4333-8333-333333333333'
const CONTA_A = 'aaaaaaaa-0000-4000-8000-00000000000a'
const CONTA_B = 'bbbbbbbb-0000-4000-8000-00000000000b'
const CONTA_C = 'cccccccc-0000-4000-8000-00000000000c'

/** Um instante `dias` antes de AGORA, em ISO. */
const ha = (dias: number) => new Date(AGORA.getTime() - dias * 24 * 60 * 60 * 1000).toISOString()

function envio(clinicaId: string, status: EnvioDoResumo['status'], dias: number, extra: Partial<EnvioDoResumo> = {}): EnvioDoResumo {
  return { clinicaId, status, enviadoEm: null, agendadoPara: ha(dias), criadoEm: ha(dias + 1), ...extra }
}

function entrada(parcial: Partial<EntradaDoResumo> = {}): EntradaDoResumo {
  return {
    modulo: 'aniversariantes',
    agora: AGORA,
    baseUrl: null,
    clinicasLocais: [],
    unidadesLocais: [],
    clinicasDoSetup: [],
    contasLigadas: [],
    envios: [],
    ...parcial,
  }
}

describe('o que conta como enviado', () => {
  it('é o grupo "Enviadas" do Histórico', () => {
    expect([...STATUS_ENVIADOS].sort()).toEqual([...SITUACOES.enviadas].sort())
  })

  it('o instante: enviado_em, senão o horário marcado, senão a criação', () => {
    expect(instanteDoEnvio(envio(A, 'sent', 5, { enviadoEm: ha(2) }))).toBe(Date.parse(ha(2)))
    expect(instanteDoEnvio(envio(A, 'sent', 5))).toBe(Date.parse(ha(5)))
    expect(instanteDoEnvio(envio(A, 'sent', 5, { agendadoPara: null }))).toBe(Date.parse(ha(6)))
    expect(instanteDoEnvio(envio(A, 'sent', 5, { enviadoEm: 'lixo', agendadoPara: null }))).toBe(Date.parse(ha(6)))
  })
})

describe('resumirUso', () => {
  it('soma por situação, o último envio e as janelas de 30 e 90 dias', () => {
    const r = resumirUso(
      entrada({
        clinicasLocais: [{ id: A, companyId: CONTA_A, nome: 'Clínica A' }],
        clinicasDoSetup: [{ id: A, companyId: CONTA_A, nome: 'Clínica A', unidades: [{ id: 'u1', nome: 'Centro' }] }],
        contasLigadas: [CONTA_A],
        envios: [
          envio(A, 'sent', 3, { enviadoEm: ha(2) }),
          envio(A, 'delivered', 29),
          envio(A, 'read', 31),
          envio(A, 'read', 90),
          envio(A, 'sent', 91),
          // Não contam como enviados, mesmo recentes:
          envio(A, 'scheduled', -2),
          envio(A, 'processed', 0),
          envio(A, 'canceled', 1),
          envio(A, 'failed', 1),
        ],
      })
    )

    expect(r.modulo).toBe('aniversariantes')
    expect(r.geradoEm).toBe(AGORA.toISOString())
    expect(r.clinicas).toHaveLength(1)
    expect(r.clinicas[0]).toEqual({
      companyId: CONTA_A,
      nome: 'Clínica A',
      ligado: true,
      setupUrl: null,
      unidades: [{ id: 'u1', nome: 'Centro' }],
      envios: {
        total: 9,
        porSituacao: { agendado: 1, processando: 1, enviado: 2, entregue: 1, lido: 2, cancelado: 1, falhou: 1 },
        ultimoEnvioEm: ha(2),
        ultimos30Dias: 2,
        ultimos90Dias: 4,
      },
    })
  })

  it('ligada sem envio: tudo zero e ultimoEnvioEm nulo', () => {
    const [c] = resumirUso(
      entrada({
        clinicasLocais: [{ id: A, companyId: CONTA_A, nome: 'A' }],
        clinicasDoSetup: [{ id: A, companyId: CONTA_A, nome: 'A', unidades: [] }],
        contasLigadas: [CONTA_A],
      })
    ).clinicas
    expect(c!.ligado).toBe(true)
    expect(c!.envios).toEqual({
      total: 0,
      porSituacao: { agendado: 0, processando: 0, enviado: 0, entregue: 0, lido: 0, cancelado: 0, falhou: 0 },
      ultimoEnvioEm: null,
      ultimos30Dias: 0,
      ultimos90Dias: 0,
    })
  })

  it('só agendado ou falho: não há último envio', () => {
    const [c] = resumirUso(
      entrada({
        clinicasLocais: [{ id: A, companyId: CONTA_A, nome: 'A' }],
        contasLigadas: [CONTA_A],
        envios: [envio(A, 'scheduled', -1), envio(A, 'failed', 3)],
      })
    ).clinicas
    expect(c!.envios.total).toBe(2)
    expect(c!.envios.ultimoEnvioEm).toBeNull()
    expect(c!.envios.ultimos30Dias).toBe(0)
  })

  it('a clínica da tabela local fora das contas ligadas entra desligada, com os envios e as unidades locais', () => {
    const r = resumirUso(
      entrada({
        clinicasLocais: [
          { id: A, companyId: CONTA_A, nome: 'Ligada' },
          { id: B, companyId: CONTA_B, nome: 'Desligada' },
        ],
        unidadesLocais: [
          { id: 'b2', clinicaId: B, nome: 'Sul' },
          { id: 'b1', clinicaId: B, nome: 'Norte' },
        ],
        clinicasDoSetup: [{ id: A, companyId: CONTA_A, nome: 'Ligada', unidades: [] }],
        contasLigadas: [CONTA_A],
        envios: [envio(B, 'read', 100)],
        baseUrl: 'https://app.exemplo',
      })
    )
    const desligada = r.clinicas.find((c) => c.companyId === CONTA_B)!
    expect(desligada.ligado).toBe(false)
    expect(desligada.setupUrl).toBeNull()
    expect(desligada.unidades).toEqual([
      { id: 'b1', nome: 'Norte' },
      { id: 'b2', nome: 'Sul' },
    ])
    expect(desligada.envios.ultimoEnvioEm).toBe(ha(100))
    expect(desligada.envios.ultimos90Dias).toBe(0)
  })

  it('a clínica do setup que a tabela local ainda não tinha também entra', () => {
    const r = resumirUso(
      entrada({
        clinicasDoSetup: [{ id: C, companyId: CONTA_C, nome: 'Nova', unidades: [{ id: 'c1', nome: 'Principal' }] }],
        contasLigadas: [CONTA_C],
      })
    )
    expect(r.clinicas.map((c) => [c.companyId, c.ligado])).toEqual([[CONTA_C, true]])
  })

  it('o setupUrl usa o id local, sem barra dobrada', () => {
    const [c] = resumirUso(
      entrada({
        baseUrl: 'https://app.exemplo/',
        clinicasDoSetup: [{ id: A, companyId: CONTA_A, nome: 'A', unidades: [] }],
        contasLigadas: [CONTA_A],
      })
    ).clinicas
    expect(c!.setupUrl).toBe(`https://app.exemplo/setup/clinicas/${A}`)
  })

  it('compara conta e id sem caixa, e devolve a conta em minúsculas', () => {
    const r = resumirUso(
      entrada({
        clinicasLocais: [{ id: A.toUpperCase(), companyId: CONTA_A.toUpperCase(), nome: 'A' }],
        contasLigadas: [CONTA_A.toUpperCase()],
        envios: [envio(A, 'sent', 1)],
      })
    )
    expect(r.clinicas).toHaveLength(1)
    expect(r.clinicas[0]).toMatchObject({ companyId: CONTA_A, ligado: true })
    expect(r.clinicas[0]!.envios.total).toBe(1)
  })

  it('ordena pelo nome', () => {
    const r = resumirUso(
      entrada({
        clinicasLocais: [
          { id: A, companyId: CONTA_A, nome: 'Zélia' },
          { id: B, companyId: CONTA_B, nome: 'Ágata' },
          { id: C, companyId: CONTA_C, nome: 'Bruno' },
        ],
      })
    )
    expect(r.clinicas.map((c) => c.nome)).toEqual(['Ágata', 'Bruno', 'Zélia'])
  })
})
