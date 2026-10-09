import { describe, it, expect, vi } from 'vitest'
import {
  agendarMensagens,
  exigirModeloDoRemetente,
  ModeloNaoEncontradoError,
  PedidoInvalidoError,
  MAXIMO_POR_LOTE,
  AVISO_CONTATO_NAO_SALVO,
  ERRO_JA_AGENDADO,
  ERRO_JA_ENVIADO,
  type ConfiguracaoDeModelo,
  type Dependencias,
  type EnvioExistente,
} from './agendamento'
import type { Aniversariante } from '@/providers/prontuario'

const SP = 'America/Sao_Paulo'
const AGORA = new Date('2026-09-15T17:00:00Z') // 14:00 em São Paulo
const CONTEXTO = { timezone: SP, agora: AGORA, remetente: null }

const MODELO: ConfiguracaoDeModelo = {
  id: 'config-1',
  modeloId: 'modelo-na-plataforma',
  parametros: { 1: 'primeiro_nome' },
  diaEnvio: 'aniversario',
  horarioEnvio: '09:00',
}

function paciente(over: Partial<Aniversariante> = {}): Aniversariante {
  return {
    id: 'p1',
    nome: 'Maria Souza',
    telefone: '45999770408',
    aniversario: '10/20',
    datanascimento: '20/10/1990',
    situacao: 'ATIVO',
    ...over,
  }
}

function deps(over: Partial<Dependencias> = {}) {
  const d = {
    buscarModelo: vi.fn(async () => MODELO as ConfiguracaoDeModelo | null),
    listarDaPlataforma: vi.fn(async () => ({ modelos: [], canais: [], filtradoPorTipo: true })),
    buscarPacientes: vi.fn(async () => [paciente()]),
    buscarEnvios: vi.fn(async () => [] as EnvioExistente[]),
    agendar: vi.fn(async () => ({ id: 'msg-1' })),
    salvarContato: vi.fn(async () => 'criado' as const),
    registrarEnvio: vi.fn(async () => {}),
    ...over,
  }
  return d as Dependencias & typeof d
}

describe('o paciente vem do prontuário, nunca do pedido', () => {
  it('usa o telefone do prontuário como destinatário', async () => {
    const d = deps({ buscarPacientes: vi.fn(async () => [paciente({ telefone: '45988887777' })]) })
    await agendarMensagens({ modeloConfigId: 'config-1', pacienteIds: ['p1'] }, CONTEXTO, d)
    expect(d.agendar).toHaveBeenCalledWith(expect.objectContaining({ para: '+5545988887777' }))
  })

  it('id inexistente no prontuário falha, sem chamar a plataforma', async () => {
    const d = deps({ buscarPacientes: vi.fn(async () => []) })
    const [r] = await agendarMensagens(
      { modeloConfigId: 'config-1', pacienteIds: ['fantasma'] },
      CONTEXTO,
      d
    )
    expect(r).toMatchObject({ ok: false, pacienteId: 'fantasma' })
    expect(r!.erro).toMatch(/não encontrado/i)
    expect(d.agendar).not.toHaveBeenCalled()
  })

  it('o nome enviado nos parâmetros vem do prontuário', async () => {
    const d = deps({ buscarPacientes: vi.fn(async () => [paciente({ nome: 'Ana Lima' })]) })
    await agendarMensagens({ modeloConfigId: 'config-1', pacienteIds: ['p1'] }, CONTEXTO, d)
    expect(d.agendar).toHaveBeenCalledWith(expect.objectContaining({ parametros: { 1: 'Ana' } }))
  })
})

describe('dia_envio é aplicado', () => {
  it.each([
    ['aniversario', '2026-10-20T12:00:00.000Z'],
    ['1_dia_antes', '2026-10-19T12:00:00.000Z'],
    ['3_dias_antes', '2026-10-17T12:00:00.000Z'],
  ] as const)('%s agenda para %s', async (diaEnvio, esperado) => {
    const d = deps({ buscarModelo: vi.fn(async () => ({ ...MODELO, diaEnvio })) })
    await agendarMensagens({ modeloConfigId: 'config-1', pacienteIds: ['p1'] }, CONTEXTO, d)
    expect(d.agendar).toHaveBeenCalledWith(expect.objectContaining({ quando: esperado }))
  })

  it('usa o horário configurado no modelo', async () => {
    const d = deps({ buscarModelo: vi.fn(async () => ({ ...MODELO, horarioEnvio: '18:30' })) })
    await agendarMensagens({ modeloConfigId: 'config-1', pacienteIds: ['p1'] }, CONTEXTO, d)
    expect(d.agendar).toHaveBeenCalledWith(
      expect.objectContaining({ quando: '2026-10-20T21:30:00.000Z' })
    )
  })
})

describe('recusas', () => {
  it('modelo de outra clínica é "não encontrado"', async () => {
    const d = deps({ buscarModelo: vi.fn(async () => null) })
    await expect(
      agendarMensagens({ modeloConfigId: 'de-outra', pacienteIds: ['p1'] }, CONTEXTO, d)
    ).rejects.toThrow(ModeloNaoEncontradoError)
  })

  it('lista vazia', async () => {
    await expect(
      agendarMensagens({ modeloConfigId: 'config-1', pacienteIds: [] }, CONTEXTO, deps())
    ).rejects.toThrow(PedidoInvalidoError)
  })

  it('lote acima do limite', async () => {
    const ids = Array.from({ length: MAXIMO_POR_LOTE + 1 }, (_, i) => `p${i}`)
    await expect(
      agendarMensagens({ modeloConfigId: 'config-1', pacienteIds: ids }, CONTEXTO, deps())
    ).rejects.toThrow(PedidoInvalidoError)
  })

  it('telefone inválido no cadastro não vira envio', async () => {
    const d = deps({ buscarPacientes: vi.fn(async () => [paciente({ telefone: '000000' })]) })
    const [r] = await agendarMensagens(
      { modeloConfigId: 'config-1', pacienteIds: ['p1'] },
      CONTEXTO,
      d
    )
    expect(r!.ok).toBe(false)
    expect(d.agendar).not.toHaveBeenCalled()
  })

  it('aniversário que já passou não é agendável', async () => {
    const d = deps({ buscarPacientes: vi.fn(async () => [paciente({ aniversario: '09/14' })]) })
    const [r] = await agendarMensagens(
      { modeloConfigId: 'config-1', pacienteIds: ['p1'] },
      CONTEXTO,
      d
    )
    expect(r!.ok).toBe(false)
    expect(r!.erro).toMatch(/já passou/i)
    expect(d.agendar).not.toHaveBeenCalled()
  })

  it('aniversário de HOJE não é agendável, com frase própria', async () => {
    const d = deps({ buscarPacientes: vi.fn(async () => [paciente({ aniversario: '09/15' })]) })
    const [r] = await agendarMensagens(
      { modeloConfigId: 'config-1', pacienteIds: ['p1'] },
      CONTEXTO,
      d
    )
    expect(r!.ok).toBe(false)
    expect(r!.erro).toMatch(/é hoje/i)
    expect(d.agendar).not.toHaveBeenCalled()
  })
})

describe('um parabéns por paciente por ano', () => {
  function jaTem(status: EnvioExistente['status'], over: Partial<EnvioExistente> = {}) {
    return vi.fn(async () => [{ pacienteId: 'p1', ano: 2026, status, ...over }])
  }

  it.each(['scheduled', 'processed'] as const)(
    'com mensagem %s, recusa sem tocar na plataforma',
    async (status) => {
      // Era o caminho da duplicata: a linha era sobrescrita e a mensagem
      // anterior continuava agendada lá.
      const d = deps({ buscarEnvios: jaTem(status) })
      const [r] = await agendarMensagens({ modeloConfigId: 'config-1', pacienteIds: ['p1'] }, CONTEXTO, d)

      expect(r).toMatchObject({ ok: false, erro: ERRO_JA_AGENDADO })
      expect(d.salvarContato).not.toHaveBeenCalled()
      expect(d.agendar).not.toHaveBeenCalled()
      expect(d.registrarEnvio).not.toHaveBeenCalled()
    }
  )

  it.each(['sent', 'delivered', 'read'] as const)('com mensagem %s, diz que já foi enviada', async (status) => {
    const d = deps({ buscarEnvios: jaTem(status) })
    const [r] = await agendarMensagens({ modeloConfigId: 'config-1', pacienteIds: ['p1'] }, CONTEXTO, d)

    expect(r).toMatchObject({ ok: false, erro: ERRO_JA_ENVIADO })
    expect(d.agendar).not.toHaveBeenCalled()
  })

  it.each(['canceled', 'failed'] as const)('com mensagem %s, agenda de novo', async (status) => {
    const d = deps({ buscarEnvios: jaTem(status) })
    const [r] = await agendarMensagens({ modeloConfigId: 'config-1', pacienteIds: ['p1'] }, CONTEXTO, d)

    expect(r!.ok).toBe(true)
    expect(d.agendar).toHaveBeenCalledTimes(1)
  })

  it('a data manual não passa por cima', async () => {
    const d = deps({ buscarEnvios: jaTem('scheduled') })
    const [r] = await agendarMensagens(
      { modeloConfigId: 'config-1', pacienteIds: ['p1'], quandoManual: '2026-11-01T15:00:00.000Z' },
      CONTEXTO,
      d
    )
    expect(r).toMatchObject({ ok: false, erro: ERRO_JA_AGENDADO })
    expect(d.agendar).not.toHaveBeenCalled()
  })

  it('mensagem de outro ano não conta', async () => {
    const d = deps({ buscarEnvios: jaTem('read', { ano: 2025 }) })
    const [r] = await agendarMensagens({ modeloConfigId: 'config-1', pacienteIds: ['p1'] }, CONTEXTO, d)
    expect(r!.ok).toBe(true)
  })

  it('em dezembro, o janeiro que passou não bloqueia o janeiro do ano que vem', async () => {
    const d = deps({
      buscarPacientes: vi.fn(async () => [paciente({ aniversario: '01/05' })]),
      buscarEnvios: jaTem('read', { ano: 2026 }),
    })
    const [r] = await agendarMensagens(
      { modeloConfigId: 'config-1', pacienteIds: ['p1'] },
      { ...CONTEXTO, agora: new Date('2026-12-20T15:00:00Z') },
      d
    )
    expect(r!.ok).toBe(true)
    expect(d.registrarEnvio).toHaveBeenCalledWith(expect.objectContaining({ ano: 2027 }))
  })

  it('no lote, uma consulta ao banco, e só quem já tem mensagem fica de fora', async () => {
    const d = deps({
      buscarPacientes: vi.fn(async () => [paciente({ id: 'p1' }), paciente({ id: 'p2' })]),
      buscarEnvios: jaTem('scheduled', { pacienteId: 'p2' }),
    })
    const r = await agendarMensagens({ modeloConfigId: 'config-1', pacienteIds: ['p1', 'p2'] }, CONTEXTO, d)

    expect(d.buscarEnvios).toHaveBeenCalledTimes(1)
    expect(d.buscarEnvios).toHaveBeenCalledWith(['p1', 'p2'])
    expect(r.map((x) => x.ok)).toEqual([true, false])
    expect(d.agendar).toHaveBeenCalledTimes(1)
  })
})

describe('data e hora manuais', () => {
  it('sobrepõem o cálculo quando há um paciente', async () => {
    const d = deps()
    await agendarMensagens(
      {
        modeloConfigId: 'config-1',
        pacienteIds: ['p1'],
        quandoManual: '2026-11-01T15:00:00.000Z',
      },
      CONTEXTO,
      d
    )
    expect(d.agendar).toHaveBeenCalledWith(
      expect.objectContaining({ quando: '2026-11-01T15:00:00.000Z' })
    )
  })

  it('recusa data no passado', async () => {
    await expect(
      agendarMensagens(
        { modeloConfigId: 'config-1', pacienteIds: ['p1'], quandoManual: '2026-01-01T10:00:00Z' },
        CONTEXTO,
        deps()
      )
    ).rejects.toThrow(PedidoInvalidoError)
  })

  it('recusa data ilegível', async () => {
    await expect(
      agendarMensagens(
        { modeloConfigId: 'config-1', pacienteIds: ['p1'], quandoManual: 'amanhã cedo' },
        CONTEXTO,
        deps()
      )
    ).rejects.toThrow(PedidoInvalidoError)
  })

  it('recusa data manual em lote', async () => {
    await expect(
      agendarMensagens(
        {
          modeloConfigId: 'config-1',
          pacienteIds: ['p1', 'p2'],
          quandoManual: '2026-11-01T15:00:00Z',
        },
        CONTEXTO,
        deps()
      )
    ).rejects.toThrow(PedidoInvalidoError)
  })
})

describe('lote', () => {
  it('uma consulta ao prontuário para o lote inteiro', async () => {
    const d = deps({
      buscarPacientes: vi.fn(async () => [paciente({ id: 'p1' }), paciente({ id: 'p2' })]),
    })
    await agendarMensagens({ modeloConfigId: 'config-1', pacienteIds: ['p1', 'p2'] }, CONTEXTO, d)
    expect(d.buscarPacientes).toHaveBeenCalledTimes(1)
    expect(d.buscarPacientes).toHaveBeenCalledWith(['p1', 'p2'])
  })

  it('ids repetidos viram um só', async () => {
    const d = deps()
    const r = await agendarMensagens(
      { modeloConfigId: 'config-1', pacienteIds: ['p1', 'p1', 'p1'] },
      CONTEXTO,
      d
    )
    expect(r).toHaveLength(1)
    expect(d.agendar).toHaveBeenCalledTimes(1)
  })

  it('falha de um paciente não aborta o lote', async () => {
    const d = deps({
      buscarPacientes: vi.fn(async () => [
        paciente({ id: 'p1' }),
        paciente({ id: 'p2', telefone: '000000' }),
        paciente({ id: 'p3' }),
      ]),
    })
    const r = await agendarMensagens(
      { modeloConfigId: 'config-1', pacienteIds: ['p1', 'p2', 'p3'] },
      CONTEXTO,
      d
    )
    expect(r.map((x) => x.ok)).toEqual([true, false, true])
    expect(d.registrarEnvio).toHaveBeenCalledTimes(2)
  })

  it('erro da plataforma vira falha daquele paciente, não exceção', async () => {
    const d = deps({
      agendar: vi.fn(async () => {
        throw new Error('A plataforma de mensagens respondeu 500')
      }),
    })
    const [r] = await agendarMensagens(
      { modeloConfigId: 'config-1', pacienteIds: ['p1'] },
      CONTEXTO,
      d
    )
    expect(r!.ok).toBe(false)
    expect(d.registrarEnvio).not.toHaveBeenCalled()
  })
})

describe('registro do envio', () => {
  it('grava o ano no fuso da clínica, não o do servidor', async () => {
    // 01:00 UTC de 01/01/2027 ainda é 22:00 de 31/12/2026 em São Paulo.
    //
    // Com data e hora manuais: o aniversário de 31/12 é "hoje" na clínica e,
    // desde que o dia corrente deixou de ser agendável, o cálculo automático o
    // recusaria. O que este teste prende é o ANO gravado, e o caminho manual
    // passa pelo mesmo registro.
    const viradaUTC = new Date('2027-01-01T01:00:00Z')
    const d = deps({ buscarPacientes: vi.fn(async () => [paciente({ aniversario: '12/31' })]) })
    await agendarMensagens(
      { modeloConfigId: 'config-1', pacienteIds: ['p1'], quandoManual: '2027-01-01T01:30:00Z' },
      { ...CONTEXTO, agora: viradaUTC },
      d
    )
    expect(d.registrarEnvio).toHaveBeenCalledWith(expect.objectContaining({ ano: 2026 }))
  })

  it('grava o telefone normalizado e o id da mensagem', async () => {
    const d = deps()
    await agendarMensagens({ modeloConfigId: 'config-1', pacienteIds: ['p1'] }, CONTEXTO, d)
    expect(d.registrarEnvio).toHaveBeenCalledWith(
      expect.objectContaining({ pacienteTelefone: '+5545999770408', mensagemId: 'msg-1' })
    )
  })

  it('aceita resposta sem id — a plataforma nem sempre devolve corpo', async () => {
    const d = deps({ agendar: vi.fn(async () => ({ id: null })) })
    const [r] = await agendarMensagens(
      { modeloConfigId: 'config-1', pacienteIds: ['p1'] },
      CONTEXTO,
      d
    )
    expect(r!.ok).toBe(true)
    expect(d.registrarEnvio).toHaveBeenCalledWith(expect.objectContaining({ mensagemId: null }))
  })
})

describe('virada de ano', () => {
  it('em dezembro, agenda o aniversário de janeiro com a chave do ANO QUE VEM', async () => {
    // Com o ano corrente, a chave (clínica, paciente, 2026) sobrescreveria o
    // registro do janeiro que já passou.
    const d = deps({ buscarPacientes: vi.fn(async () => [paciente({ aniversario: '01/05' })]) })
    const [r] = await agendarMensagens(
      { modeloConfigId: 'config-1', pacienteIds: ['p1'] },
      { ...CONTEXTO, agora: new Date('2026-12-20T15:00:00Z') },
      d
    )
    expect(r!.ok).toBe(true)
    expect(d.registrarEnvio).toHaveBeenCalledWith(expect.objectContaining({ ano: 2027 }))
  })
})

describe('o contato do paciente é salvo antes da mensagem', () => {
  it('cria o contato com nome, telefone do prontuário e nascimento, ANTES de agendar', async () => {
    const ordem: string[] = []
    const d = deps({
      salvarContato: vi.fn(async () => {
        ordem.push('contato')
        return 'criado' as const
      }),
      agendar: vi.fn(async () => {
        ordem.push('agendar')
        return { id: 'msg-1' }
      }),
    })
    await agendarMensagens({ modeloConfigId: 'config-1', pacienteIds: ['p1'] }, CONTEXTO, d)

    expect(ordem).toEqual(['contato', 'agendar'])
    expect(d.salvarContato).toHaveBeenCalledWith({
      telefone: '+5545999770408',
      nome: 'Maria Souza',
      dataNascimento: '20/10/1990',
    })
  })

  it('se o contato falhar, agenda mesmo assim e avisa', async () => {
    const d = deps({ salvarContato: vi.fn(async () => Promise.reject(new Error('fora do ar'))) })
    const [r] = await agendarMensagens({ modeloConfigId: 'config-1', pacienteIds: ['p1'] }, CONTEXTO, d)

    expect(d.agendar).toHaveBeenCalledTimes(1)
    expect(r).toMatchObject({ ok: true, aviso: AVISO_CONTATO_NAO_SALVO })
  })

  it('sem falha no contato, nenhum aviso', async () => {
    const [r] = await agendarMensagens({ modeloConfigId: 'config-1', pacienteIds: ['p1'] }, CONTEXTO, deps())
    expect(r).not.toHaveProperty('aviso')
  })

  it('telefone inválido não chega a criar contato', async () => {
    const d = deps({ buscarPacientes: vi.fn(async () => [paciente({ telefone: '000000' })]) })
    await agendarMensagens({ modeloConfigId: 'config-1', pacienteIds: ['p1'] }, CONTEXTO, d)
    expect(d.salvarContato).not.toHaveBeenCalled()
  })
})

describe('o número do modelo', () => {
  const canais = [
    { id: 'c1', numero: '556231930175', nome: 'Recepção', ativo: true },
    { id: 'c2', numero: '5571981270357', nome: 'Comercial', ativo: true },
  ]
  const plataforma = (canalId: string) => ({
    modelos: [{ id: 'modelo-na-plataforma', nome: 'Parabéns', conteudo: '', canalId }],
    canais,
    filtradoPorTipo: true,
  })

  it('modelo de outro número: recusa o lote inteiro, sem chamar a plataforma', async () => {
    const d = deps({ listarDaPlataforma: vi.fn(async () => plataforma('c2')) })
    await expect(
      agendarMensagens(
        { modeloConfigId: 'config-1', pacienteIds: ['p1'] },
        { ...CONTEXTO, remetente: '556231930175' },
        d
      )
    ).rejects.toThrow(/é do número \(71\) 98127-0357, e esta clínica agenda pelo \(62\) 3193-0175/)
    expect(d.agendar).not.toHaveBeenCalled()
  })

  it('modelo do número da clínica: segue', () => {
    expect(() => exigirModeloDoRemetente('modelo-na-plataforma', plataforma('c1'), '556231930175')).not.toThrow()
  })

  it('modelo fora da listagem: quem decide é a plataforma', () => {
    expect(() => exigirModeloDoRemetente('outro', plataforma('c2'), '556231930175')).not.toThrow()
  })
})
