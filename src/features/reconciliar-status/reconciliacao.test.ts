import { describe, it, expect, vi } from 'vitest'
import {
  reconciliarStatus,
  type DependenciasDaReconciliacao,
  type EnvioPendente,
} from './reconciliacao'
import type { MensagemNaPlataforma } from '@/providers/mensageria'

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
  it.each(['sent', 'delivered', 'read', 'failed', 'canceled'] as const)(
    'traz %s da plataforma para o banco',
    async (status) => {
      const d = deps({ listarNaPlataforma: vi.fn(async () => [{ id: 'msg-1', status }]) })
      const r = await reconciliarStatus(CLINICA, AGORA, d)
      expect(d.atualizarStatus).toHaveBeenCalledWith('e1', status)
      expect(r.atualizados).toBe(1)
    }
  )

  it('não escreve quando o status não mudou', async () => {
    // Um update por envio a cada execução diária encheria o banco de escrita
    // sem informação nova.
    const d = deps({
      listarNaPlataforma: vi.fn(async () => [{ id: 'msg-1', status: 'scheduled' as const }]),
    })
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
      listarNaPlataforma: vi.fn(async () => [
        { id: 'msg-2', status: 'failed' as const },
        { id: 'msg-1', status: 'delivered' as const },
      ]),
    })
    await reconciliarStatus(CLINICA, AGORA, d)
    expect(d.atualizarStatus).toHaveBeenCalledWith('e1', 'delivered')
    expect(d.atualizarStatus).toHaveBeenCalledWith('e2', 'failed')
  })

  it('ignora mensagens da conta que não são nossas', async () => {
    // A listagem devolve tudo da conta no intervalo, inclusive agendamentos
    // criados fora deste painel.
    const d = deps({
      listarNaPlataforma: vi.fn(async () => [
        { id: 'msg-de-outro-fluxo', status: 'sent' as const },
        { id: 'msg-1', status: 'sent' as const },
      ]),
    })
    const r = await reconciliarStatus(CLINICA, AGORA, d)
    expect(d.atualizarStatus).toHaveBeenCalledTimes(1)
    expect(r.atualizados).toBe(1)
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
      listarNaPlataforma: vi.fn(async () => [
        { id: 'msg-1', status: 'sent' as const },
        { id: 'msg-2', status: 'sent' as const },
      ]),
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
