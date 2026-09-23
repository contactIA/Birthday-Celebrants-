import { describe, it, expect, vi } from 'vitest'
import {
  cancelarEnvio,
  EnvioNaoEncontradoError,
  EnvioJaEnviadoError,
  SemMensagemNaPlataformaError,
  type Dependencias,
  type EnvioParaCancelar,
} from './cancelamento'
import { MensagemNaoEstaAgendadaError, MensageriaIndisponivelError } from '@/providers/mensageria'

function envio(over: Partial<EnvioParaCancelar> = {}): EnvioParaCancelar {
  return { id: 'e1', mensagemId: 'msg-1', status: 'scheduled', ...over }
}

function deps(over: Partial<Dependencias> = {}) {
  const d = {
    buscarEnvio: vi.fn(async () => envio() as EnvioParaCancelar | null),
    cancelarNaPlataforma: vi.fn(async () => {}),
    marcarComoCancelado: vi.fn(async () => {}),
    ...over,
  }
  return d as Dependencias & typeof d
}

describe('caminho feliz', () => {
  it('cancela na plataforma e marca localmente', async () => {
    const d = deps()
    await expect(cancelarEnvio('e1', d)).resolves.toEqual({ situacao: 'cancelado' })
    expect(d.cancelarNaPlataforma).toHaveBeenCalledWith('msg-1')
    expect(d.marcarComoCancelado).toHaveBeenCalledWith('e1')
  })
})

describe('a plataforma diz que já não está agendada', () => {
  // O caso que o app anterior transformava em 500: o cancelamento dava certo
  // lá, o status local nunca sincronizava, e a tela ficava travada em
  // "agendado" com erro a cada clique.
  it('é sucesso, e sincroniza o status local', async () => {
    const d = deps({
      cancelarNaPlataforma: vi.fn(async () => {
        throw new MensagemNaoEstaAgendadaError()
      }),
    })
    await expect(cancelarEnvio('e1', d)).resolves.toEqual({ situacao: 'sincronizado' })
    expect(d.marcarComoCancelado).toHaveBeenCalledWith('e1')
  })

  it('mas plataforma fora do ar NÃO é sucesso', async () => {
    // Não dá para afirmar que a mensagem não vai sair — marcar como cancelada
    // seria mentir para quem lê a tela.
    const d = deps({
      cancelarNaPlataforma: vi.fn(async () => {
        throw new MensageriaIndisponivelError('não respondeu')
      }),
    })
    await expect(cancelarEnvio('e1', d)).rejects.toThrow(MensageriaIndisponivelError)
    expect(d.marcarComoCancelado).not.toHaveBeenCalled()
  })
})

describe('idempotência', () => {
  it('cancelar o que já está cancelado é sucesso, sem tocar a plataforma', async () => {
    const d = deps({ buscarEnvio: vi.fn(async () => envio({ status: 'canceled' })) })
    await expect(cancelarEnvio('e1', d)).resolves.toEqual({ situacao: 'ja_cancelado' })
    expect(d.cancelarNaPlataforma).not.toHaveBeenCalled()
    expect(d.marcarComoCancelado).not.toHaveBeenCalled()
  })
})

describe('recusas', () => {
  it('envio inexistente ou de outra clínica', async () => {
    const d = deps({ buscarEnvio: vi.fn(async () => null) })
    await expect(cancelarEnvio('e1', d)).rejects.toThrow(EnvioNaoEncontradoError)
  })

  it.each(['sent', 'delivered', 'read'] as const)('%s já saiu: não cancela', async (status) => {
    const d = deps({ buscarEnvio: vi.fn(async () => envio({ status })) })
    await expect(cancelarEnvio('e1', d)).rejects.toThrow(EnvioJaEnviadoError)
    expect(d.cancelarNaPlataforma).not.toHaveBeenCalled()
  })

  it('sem id na plataforma não marca como cancelado', async () => {
    // Marcar seria mentir: sem o id não há como pedir o cancelamento, e a
    // mensagem pode sair mesmo assim.
    const d = deps({ buscarEnvio: vi.fn(async () => envio({ mensagemId: null })) })
    await expect(cancelarEnvio('e1', d)).rejects.toThrow(SemMensagemNaPlataformaError)
    expect(d.marcarComoCancelado).not.toHaveBeenCalled()
  })
})

describe('estados que não vão sair', () => {
  it('failed vira sincronizado, sem chamar a plataforma', async () => {
    const d = deps({ buscarEnvio: vi.fn(async () => envio({ status: 'failed' })) })
    await expect(cancelarEnvio('e1', d)).resolves.toEqual({ situacao: 'sincronizado' })
    expect(d.cancelarNaPlataforma).not.toHaveBeenCalled()
    expect(d.marcarComoCancelado).toHaveBeenCalledWith('e1')
  })

  it('processed ainda tenta cancelar', async () => {
    const d = deps({ buscarEnvio: vi.fn(async () => envio({ status: 'processed' })) })
    await expect(cancelarEnvio('e1', d)).resolves.toEqual({ situacao: 'cancelado' })
    expect(d.cancelarNaPlataforma).toHaveBeenCalled()
  })
})
