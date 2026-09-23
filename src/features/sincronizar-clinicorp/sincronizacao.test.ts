import { describe, it, expect, vi } from 'vitest'
import {
  sincronizarClinica,
  diasParaSincronizar,
  type DependenciasDoSync,
  type PacienteBruto,
} from './sincronizacao'

const SP = 'America/Sao_Paulo'
const AGORA = new Date('2026-09-15T17:00:00Z')
const CLINICA = { companyId: 'c1', timezone: SP }

function paciente(over: Partial<PacienteBruto> = {}): PacienteBruto {
  return { PatientId: 1, Name: 'Maria', BirthDate: '1990-09-20', MobilePhone: '45999770408', ...over }
}

function deps(over: Partial<DependenciasDoSync> = {}) {
  const d = {
    buscarAniversariantesDoDia: vi.fn(async () => [] as PacienteBruto[]),
    gravarLote: vi.fn(async () => {}),
    removerObsoletos: vi.fn(async () => {}),
    ...over,
  }
  return d as DependenciasDoSync & typeof d
}

describe('diasParaSincronizar', () => {
  it('cobre mês atual + seguinte', () => {
    const dias = diasParaSincronizar(SP, AGORA)
    expect(dias[0]).toBe('2026-09-01')
    expect(dias.at(-1)).toBe('2026-10-31')
    expect(dias).toHaveLength(61)
  })

  it('atravessa a virada de ano', () => {
    const dias = diasParaSincronizar(SP, new Date('2026-12-10T12:00:00Z'))
    expect(dias[0]).toBe('2026-12-01')
    expect(dias.at(-1)).toBe('2027-01-31')
  })

  it('usa o fuso da clínica para saber o mês', () => {
    // 02:00 UTC de 01/10 ainda é 30/09 em São Paulo: sincroniza set+out.
    const dias = diasParaSincronizar(SP, new Date('2026-10-01T02:00:00Z'))
    expect(dias[0]).toBe('2026-09-01')
  })
})

describe('coleta', () => {
  it('deduplica paciente que aparece em mais de um dia', async () => {
    const d = deps({ buscarAniversariantesDoDia: vi.fn(async () => [paciente({ PatientId: 7 })]) })
    const r = await sincronizarClinica(CLINICA, AGORA, d)
    expect(r.pacientes).toBe(1)
    expect(d.gravarLote).toHaveBeenCalledWith([expect.objectContaining({ pacienteId: '7' })])
  })

  it('ignora paciente sem data de nascimento válida', async () => {
    const d = deps({
      buscarAniversariantesDoDia: vi.fn(async () => [
        paciente({ PatientId: 1, BirthDate: null }),
        paciente({ PatientId: 2, BirthDate: '0000-00-00' }),
        paciente({ PatientId: 3, BirthDate: '1990-09-20' }),
      ]),
    })
    const r = await sincronizarClinica(CLINICA, AGORA, d)
    expect(r.pacientes).toBe(1)
  })

  it('grava todo paciente como ACTIVE, sem consulta de status', async () => {
    // A listagem da Clinicorp só devolve ativos; a consulta por paciente foi
    // removida (ver o topo de sincronizacao.ts). O que este teste prende: o
    // sync faz UMA chamada por dia e nenhuma por paciente.
    const buscar = vi.fn(async () => [paciente({ PatientId: 1 }), paciente({ PatientId: 2 })])
    const d = deps({ buscarAniversariantesDoDia: buscar })
    const r = await sincronizarClinica(CLINICA, AGORA, d)
    expect(buscar).toHaveBeenCalledTimes(61)
    expect(d.gravarLote).toHaveBeenCalledWith([
      expect.objectContaining({ pacienteId: '1', situacao: 'ACTIVE' }),
      expect.objectContaining({ pacienteId: '2', situacao: 'ACTIVE' }),
    ])
    expect(r.erros).toEqual([])
  })
})

describe('ordem das escritas', () => {
  it('grava ANTES de remover obsoletos', async () => {
    // O app anterior apagava o cache e só então reinseria: falha no meio
    // deixava a clínica sem dado nenhum, e a tela dizia "mês vazio".
    const ordem: string[] = []
    const d = deps({
      buscarAniversariantesDoDia: vi.fn(async () => [paciente()]),
      gravarLote: vi.fn(async () => {
        ordem.push('gravar')
      }),
      removerObsoletos: vi.fn(async () => {
        ordem.push('remover')
      }),
    })
    await sincronizarClinica(CLINICA, AGORA, d)
    expect(ordem).toEqual(['gravar', 'remover'])
  })

  it('NÃO remove obsoletos quando algum dia falhou', async () => {
    // Os pacientes daquele dia não foram renovados — removê-los seria apagar
    // dado bom por causa de uma falha de rede.
    let chamada = 0
    const d = deps({
      buscarAniversariantesDoDia: vi.fn(async () => {
        if (chamada++ === 0) throw new Error('timeout')
        return [paciente()]
      }),
    })
    const r = await sincronizarClinica(CLINICA, AGORA, d)
    expect(r.obsoletosRemovidos).toBe(false)
    expect(d.removerObsoletos).not.toHaveBeenCalled()
    expect(r.erros[0]).toMatch(/timeout/)
  })

  it('não grava lote vazio', async () => {
    const d = deps()
    await sincronizarClinica(CLINICA, AGORA, d)
    expect(d.gravarLote).not.toHaveBeenCalled()
    // Mas ainda limpa: zero aniversariantes no período é resultado legítimo.
    expect(d.removerObsoletos).toHaveBeenCalled()
  })
})

describe('relatório', () => {
  it('conta dias e pacientes, e acumula os erros', async () => {
    const d = deps({ buscarAniversariantesDoDia: vi.fn(async () => [paciente()]) })
    const r = await sincronizarClinica(CLINICA, AGORA, d)
    expect(r).toMatchObject({ companyId: 'c1', diasConsultados: 61, pacientes: 1, erros: [] })
  })
})
