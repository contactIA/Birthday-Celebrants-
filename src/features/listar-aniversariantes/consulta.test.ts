import { describe, it, expect, vi } from 'vitest'
import {
  aguardandoPrimeiraSincronizacao,
  listarAniversariantes,
  type Dependencias,
  type EnvioResumo,
  type ItemDaLista,
} from './consulta'
import type { Aniversariante } from '@/providers/prontuario'

const SP = 'America/Sao_Paulo'
const AGORA = new Date('2026-09-15T17:00:00Z') // 14:00 em São Paulo

function paciente(over: Partial<Aniversariante> = {}): Aniversariante {
  return {
    id: '1',
    nome: 'Maria Souza',
    telefone: '45999770408',
    aniversario: '09/20',
    datanascimento: '20/09/1990',
    situacao: 'ATIVO',
    ...over,
  }
}

function deps(
  doProntuario: Aniversariante[],
  envios: EnvioResumo[] = []
): Dependencias & { buscarEnvios: ReturnType<typeof vi.fn> } {
  return {
    listarDoProntuario: vi.fn(async () => doProntuario),
    buscarEnvios: vi.fn(async () => envios),
  }
}

describe('cruzamento com envios', () => {
  it('anexa o envio ao paciente certo', async () => {
    const envio: EnvioResumo = { pacienteId: '1', status: 'scheduled', scheduledFor: null }
    const itens = await listarAniversariantes(
      { mes: 9, timezone: SP, agora: AGORA },
      deps([paciente({ id: '1' }), paciente({ id: '2', nome: 'Ana' })], [envio])
    )
    expect(itens.find((i) => i.id === '1')?.envio).toEqual(envio)
    expect(itens.find((i) => i.id === '2')?.envio).toBeNull()
  })

  it('paciente sem agendamento vem com envio null', async () => {
    const [item] = await listarAniversariantes({ mes: 9, timezone: SP, agora: AGORA }, deps([paciente()]))
    expect(item!.envio).toBeNull()
  })
})

describe('ano no fuso da clínica', () => {
  // O app anterior usava o ano do SERVIDOR, que roda em UTC. Em 31/12 às 22h
  // de Brasília já é 1º de janeiro em UTC — a busca de envios ia para o ano
  // errado e todo mundo aparecia como "sem mensagem" logo após agendar.
  it('31/12 às 22h de Brasília ainda é o ano corrente', async () => {
    const viradaUTC = new Date('2026-12-31T23:30:00Z') // 20:30 em São Paulo
    const d = deps([paciente({ aniversario: '12/31' })])
    await listarAniversariantes({ mes: 12, timezone: SP, agora: viradaUTC }, d)
    expect(d.buscarEnvios).toHaveBeenCalledWith(2026)
  })

  it('01/01 às 02h UTC ainda é 31/12 na clínica', async () => {
    const viradaUTC = new Date('2027-01-01T02:00:00Z') // 23:00 de 31/12 em SP
    const d = deps([])
    await listarAniversariantes({ mes: 12, timezone: SP, agora: viradaUTC }, d)
    expect(d.buscarEnvios).toHaveBeenCalledWith(2026)
  })

  it('respeita fuso diferente de Brasília', async () => {
    const d = deps([])
    await listarAniversariantes(
      { mes: 1, timezone: 'America/Rio_Branco', agora: new Date('2027-01-01T04:00:00Z') },
      d
    )
    // 04:00 UTC = 23:00 de 31/12 no Acre.
    expect(d.buscarEnvios).toHaveBeenCalledWith(2026)
  })
})

describe('jaPassou', () => {
  it('marca aniversário anterior a hoje', async () => {
    const [item] = await listarAniversariantes(
      { mes: 9, timezone: SP, agora: AGORA },
      deps([paciente({ aniversario: '09/14' })])
    )
    expect(item!.jaPassou).toBe(true)
  })

  it('hoje não conta como passado', async () => {
    const [item] = await listarAniversariantes(
      { mes: 9, timezone: SP, agora: AGORA },
      deps([paciente({ aniversario: '09/15' })])
    )
    expect(item!.jaPassou).toBe(false)
  })

  it('usa o fuso da clínica, não o do servidor', async () => {
    // 01:00 UTC de 16/09 ainda é 22:00 de 15/09 em São Paulo.
    const [item] = await listarAniversariantes(
      { mes: 9, timezone: SP, agora: new Date('2026-09-16T01:00:00Z') },
      deps([paciente({ aniversario: '09/15' })])
    )
    expect(item!.jaPassou).toBe(false)
  })
})

describe('agendavel', () => {
  it('amanhã é agendável; hoje e ontem não', async () => {
    const itens = await listarAniversariantes(
      { mes: 9, timezone: SP, agora: AGORA },
      deps([
        paciente({ id: 'ontem', aniversario: '09/14' }),
        paciente({ id: 'hoje', aniversario: '09/15' }),
        paciente({ id: 'amanha', aniversario: '09/16' }),
      ])
    )
    const por = Object.fromEntries(itens.map((i) => [i.id, i]))
    expect(por.ontem).toMatchObject({ jaPassou: true, agendavel: false })
    // Hoje: nem "já passou", nem agendável — a tela mostra "É hoje".
    expect(por.hoje).toMatchObject({ jaPassou: false, agendavel: false })
    expect(por.amanha).toMatchObject({ jaPassou: false, agendavel: true })
  })
})

describe('ordenação', () => {
  it('ordena por dia, depois por nome', async () => {
    const itens = await listarAniversariantes(
      { mes: 9, timezone: SP, agora: AGORA },
      deps([
        paciente({ id: '3', nome: 'Carlos', aniversario: '09/20' }),
        paciente({ id: '1', nome: 'Ana', aniversario: '09/20' }),
        paciente({ id: '2', nome: 'Beatriz', aniversario: '09/05' }),
      ])
    )
    expect(itens.map((i) => i.nome)).toEqual(['Beatriz', 'Ana', 'Carlos'])
  })
})

describe('repasse ao provedor', () => {
  it('pede o mês consultado, sem saber qual sistema responde', async () => {
    const d = deps([])
    await listarAniversariantes({ mes: 11, timezone: SP, agora: AGORA }, d)
    expect(d.listarDoProntuario).toHaveBeenCalledWith(11)
  })

  it('mês sem aniversariante devolve lista vazia, não erro', async () => {
    const itens = await listarAniversariantes({ mes: 2, timezone: SP, agora: AGORA }, deps([]))
    expect(itens).toEqual([])
  })
})

describe('aguardandoPrimeiraSincronizacao', () => {
  const item = { id: '1' } as ItemDaLista

  it('lista vazia + provedor sem dado nenhum = aguardando', async () => {
    expect(await aguardandoPrimeiraSincronizacao([], async () => true)).toBe(true)
  })

  it('lista vazia + provedor com dado = ninguém faz aniversário mesmo', async () => {
    expect(await aguardandoPrimeiraSincronizacao([], async () => false)).toBe(false)
  })

  it('com itens nem pergunta ao provedor', async () => {
    const verificar = vi.fn(async () => true)
    expect(await aguardandoPrimeiraSincronizacao([item], verificar)).toBe(false)
    expect(verificar).not.toHaveBeenCalled()
  })

  it('provedor ao vivo (sem o método) nunca está aguardando', async () => {
    expect(await aguardandoPrimeiraSincronizacao([], undefined)).toBe(false)
  })
})
