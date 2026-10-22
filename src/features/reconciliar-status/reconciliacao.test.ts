import { describe, it, expect, vi } from 'vitest'
import {
  inicioDoAcompanhamentoDaEntrega,
  mudancaDoStatus,
  reconciliarStatus,
  type DependenciasDaReconciliacao,
  type EnvioPendente,
} from './reconciliacao'
import type { MensagemNaPlataforma } from '@/providers/mensageria'
import type { StatusEnvio } from '@/shared/db'

const AGORA = new Date('2026-09-15T17:00:00Z')
const CLINICA = 'c1'

function pendente(over: Partial<EnvioPendente> = {}): EnvioPendente {
  return {
    id: 'e1',
    mensagemId: 'msg-1',
    agendadoPara: '2026-09-10T12:00:00.000Z',
    statusAtual: 'scheduled',
    ...over,
  }
}

function mensagem(id: string, status: StatusEnvio, motivoDaFalha: string | null = null): MensagemNaPlataforma {
  return { id, status, motivoDaFalha, conversaId: `conversa-${id}`, atualizadaEm: '2026-09-15T16:52:10.000Z' }
}

/** O que a reconciliação manda gravar, sem repetir o horário e a conversa em todo teste. */
const mudou = (status: StatusEnvio, motivoDaFalha: string | null) => expect.objectContaining({ status, motivoDaFalha })

function deps(over: Partial<DependenciasDaReconciliacao> = {}) {
  const d = {
    buscarPendentes: vi.fn(async () => [pendente()]),
    listarNaPlataforma: vi.fn(async () => [] as MensagemNaPlataforma[]),
    atualizarStatus: vi.fn(async () => {}),
    ...over,
  }
  return d as DependenciasDaReconciliacao & typeof d
}

describe('sem pendentes', () => {
  it('não chama a plataforma', async () => {
    const d = deps({ buscarPendentes: vi.fn(async () => []) })
    const r = await reconciliarStatus(CLINICA, AGORA, d)
    expect(r).toEqual({
      companyId: CLINICA,
      pendentes: 0,
      atualizados: 0,
      naoEncontrados: 0,
      erro: null,
    })
    expect(d.listarNaPlataforma).not.toHaveBeenCalled()
  })
})

describe('atualização', () => {
  it.each(['sent', 'delivered', 'read', 'canceled'] as const)('traz %s da plataforma para o banco', async (status) => {
    const d = deps({ listarNaPlataforma: vi.fn(async () => [mensagem('msg-1', status)]) })
    const r = await reconciliarStatus(CLINICA, AGORA, d)
    expect(d.atualizarStatus).toHaveBeenCalledWith('e1', mudou(status, null))
    expect(r.atualizados).toBe(1)
  })

  it('não escreve quando o status não mudou', async () => {
    // Um update por envio a cada execução diária encheria o banco de escrita
    // sem informação nova.
    const d = deps({ listarNaPlataforma: vi.fn(async () => [mensagem('msg-1', 'scheduled')]) })
    const r = await reconciliarStatus(CLINICA, AGORA, d)
    expect(d.atualizarStatus).not.toHaveBeenCalled()
    expect(r.atualizados).toBe(0)
  })

  it('casa cada envio pelo id da plataforma, não pela ordem', async () => {
    const d = deps({
      buscarPendentes: vi.fn(async () => [
        pendente({ id: 'e1', mensagemId: 'msg-1' }),
        pendente({ id: 'e2', mensagemId: 'msg-2' }),
      ]),
      listarNaPlataforma: vi.fn(async () => [mensagem('msg-2', 'failed'), mensagem('msg-1', 'delivered')]),
    })
    await reconciliarStatus(CLINICA, AGORA, d)
    expect(d.atualizarStatus).toHaveBeenCalledWith('e1', mudou('delivered', null))
    expect(d.atualizarStatus).toHaveBeenCalledWith('e2', mudou('failed', null))
  })

  it('ignora mensagens da conta que não são nossas', async () => {
    // A listagem devolve tudo da conta no intervalo, inclusive agendamentos
    // criados fora deste painel.
    const d = deps({
      listarNaPlataforma: vi.fn(async () => [mensagem('msg-de-outro-fluxo', 'sent'), mensagem('msg-1', 'sent')]),
    })
    const r = await reconciliarStatus(CLINICA, AGORA, d)
    expect(d.atualizarStatus).toHaveBeenCalledTimes(1)
    expect(r.atualizados).toBe(1)
  })
})

describe('até o status final', () => {
  it('uma enviada que falhou depois vira falha', async () => {
    // Até 2026-10-21 a `sent` saía da consulta e ficava assim para sempre.
    const d = deps({
      buscarPendentes: vi.fn(async () => [pendente({ statusAtual: 'sent' })]),
      listarNaPlataforma: vi.fn(async () => [mensagem('msg-1', 'failed', 'Número sem WhatsApp')]),
    })
    await reconciliarStatus(CLINICA, AGORA, d)
    expect(d.atualizarStatus).toHaveBeenCalledWith('e1', mudou('failed', 'Número sem WhatsApp'))
  })

  it('uma enviada que foi entregue vira entregue', async () => {
    const d = deps({
      buscarPendentes: vi.fn(async () => [pendente({ statusAtual: 'sent' })]),
      listarNaPlataforma: vi.fn(async () => [mensagem('msg-1', 'delivered')]),
    })
    await reconciliarStatus(CLINICA, AGORA, d)
    expect(d.atualizarStatus).toHaveBeenCalledWith('e1', mudou('delivered', null))
  })

  it('uma entregue que foi lida vira lida', async () => {
    const d = deps({
      buscarPendentes: vi.fn(async () => [pendente({ statusAtual: 'delivered' })]),
      listarNaPlataforma: vi.fn(async () => [mensagem('msg-1', 'read')]),
    })
    await reconciliarStatus(CLINICA, AGORA, d)
    expect(d.atualizarStatus).toHaveBeenCalledWith('e1', mudou('read', null))
  })

  it('as enviadas e entregues são acompanhadas por três dias depois do envio', () => {
    expect(inicioDoAcompanhamentoDaEntrega(AGORA)).toBe('2026-09-12T17:00:00.000Z')
  })
})

describe('motivo da falha', () => {
  it('a falha grava a frase da plataforma junto com o status', async () => {
    const motivo = '132012 - Os valores de parâmetros variáveis foram formatados incorretamente.'
    const d = deps({ listarNaPlataforma: vi.fn(async () => [mensagem('msg-1', 'failed', motivo)]) })
    await reconciliarStatus(CLINICA, AGORA, d)
    expect(d.atualizarStatus).toHaveBeenCalledWith('e1', mudou('failed', motivo))
  })

  it('fora da falha o motivo não é gravado, mesmo que venha', async () => {
    const d = deps({ listarNaPlataforma: vi.fn(async () => [mensagem('msg-1', 'delivered', 'resto de outra tentativa')]) })
    await reconciliarStatus(CLINICA, AGORA, d)
    expect(d.atualizarStatus).toHaveBeenCalledWith('e1', mudou('delivered', null))
  })
})

describe('horário e conversa', () => {
  it('grava o horário da plataforma na coluna do passo, e a conversa', async () => {
    const d = deps({ listarNaPlataforma: vi.fn(async () => [mensagem('msg-1', 'read')]) })
    await reconciliarStatus(CLINICA, AGORA, d)
    expect(d.atualizarStatus).toHaveBeenCalledWith('e1', {
      status: 'read',
      motivoDaFalha: null,
      conversaId: 'conversa-msg-1',
      passo: { coluna: 'lido_em', quando: '2026-09-15T16:52:10.000Z' },
    })
  })

  it('sem horário da plataforma, usa o da execução', async () => {
    const d = deps({
      listarNaPlataforma: vi.fn(async () => [{ ...mensagem('msg-1', 'failed', 'x'), atualizadaEm: null }]),
    })
    await reconciliarStatus(CLINICA, AGORA, d)
    expect(d.atualizarStatus).toHaveBeenCalledWith(
      'e1',
      expect.objectContaining({ passo: { coluna: 'falhou_em', quando: AGORA.toISOString() } })
    )
  })

  it('status sem passo na linha do tempo não grava horário', () => {
    expect(mudancaDoStatus(mensagem('msg-1', 'processed'), AGORA).passo).toBeNull()
  })
})

describe('janela de consulta', () => {
  it('vai do pendente mais antigo até agora, com margem', async () => {
    const janelasUsadas: { de: string; ate: string }[] = []
    const d = deps({
      buscarPendentes: vi.fn(async () => [
        pendente({ agendadoPara: '2026-09-10T12:00:00.000Z' }),
        pendente({ id: 'e2', mensagemId: 'msg-2', agendadoPara: '2026-08-01T12:00:00.000Z' }),
      ]),
      listarNaPlataforma: vi.fn(async (janela: { de: string; ate: string }) => {
        janelasUsadas.push(janela)
        return []
      }),
    })

    await reconciliarStatus(CLINICA, AGORA, d)

    // Um dia antes do mais antigo (01/08), e um dia depois de agora.
    expect(janelasUsadas[0]).toEqual({
      de: '2026-07-31T12:00:00.000Z',
      ate: '2026-09-16T17:00:00.000Z',
    })
  })
})

describe('mensagens não encontradas', () => {
  it('conta em vez de adivinhar o status', async () => {
    // Pode ser mensagem apagada na plataforma. Inventar "failed" seria dizer à
    // clínica que o parabéns não saiu sem ter essa informação.
    const d = deps({ listarNaPlataforma: vi.fn(async () => []) })
    const r = await reconciliarStatus(CLINICA, AGORA, d)
    expect(r.naoEncontrados).toBe(1)
    expect(r.atualizados).toBe(0)
    expect(d.atualizarStatus).not.toHaveBeenCalled()
  })
})

describe('falhas', () => {
  it('erro ao listar preserva a contagem de pendentes e não escreve nada', async () => {
    const d = deps({
      listarNaPlataforma: vi.fn(async () => {
        throw new Error('502')
      }),
    })
    const r = await reconciliarStatus(CLINICA, AGORA, d)
    expect(r.pendentes).toBe(1)
    expect(r.erro).toMatch(/listar/)
    expect(d.atualizarStatus).not.toHaveBeenCalled()
  })

  it('falha ao gravar um envio não interrompe os outros', async () => {
    let chamada = 0
    const d = deps({
      buscarPendentes: vi.fn(async () => [
        pendente({ id: 'e1', mensagemId: 'msg-1' }),
        pendente({ id: 'e2', mensagemId: 'msg-2' }),
      ]),
      listarNaPlataforma: vi.fn(async () => [mensagem('msg-1', 'sent'), mensagem('msg-2', 'sent')]),
      atualizarStatus: vi.fn(async () => {
        if (chamada++ === 0) throw new Error('conflito')
      }),
    })
    const r = await reconciliarStatus(CLINICA, AGORA, d)
    expect(r.atualizados).toBe(1)
    expect(r.erro).toMatch(/atualizar/)
  })

  it('erro ao buscar pendentes não chama a plataforma', async () => {
    const d = deps({
      buscarPendentes: vi.fn(async () => {
        throw new Error('banco fora')
      }),
    })
    const r = await reconciliarStatus(CLINICA, AGORA, d)
    expect(r.erro).toMatch(/buscar pendentes/)
    expect(d.listarNaPlataforma).not.toHaveBeenCalled()
  })
})
