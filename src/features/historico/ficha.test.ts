import { describe, expect, it } from 'vitest'
import { conversaDoEnvio, EnvioNaoEncontradoError, linhaDoTempo, oQueFazer, SemConversaError, type HorariosDoEnvio } from './ficha'

const base: HorariosDoEnvio = {
  status: 'scheduled',
  criadoEm: '2026-10-20T13:14:00.000Z',
  agendadoPara: '2026-10-21T13:20:00.000Z',
  enviadoEm: null,
  entregueEm: null,
  lidoEm: null,
  falhouEm: null,
  canceladoEm: null,
}

const resumo = (h: HorariosDoEnvio) => linhaDoTempo(h).map((p) => `${p.chave}:${p.estado}:${p.quando ?? '-'}`)

describe('linhaDoTempo', () => {
  it('agendado: o envio fica pendente com o horário previsto', () => {
    expect(resumo(base)).toEqual([
      'agendado:feito:2026-10-20T13:14:00.000Z',
      'enviado:pendente:2026-10-21T13:20:00.000Z',
      'entregue:pendente:-',
      'lido:pendente:-',
    ])
    expect(linhaDoTempo(base)[1]!.detalhe).toBe('Previsto')
  })

  it('lido: os passos anteriores ficam feitos, mesmo sem horário', () => {
    const lido = { ...base, status: 'read' as const, lidoEm: '2026-10-21T13:25:52.000Z' }
    expect(resumo(lido)).toEqual([
      'agendado:feito:2026-10-20T13:14:00.000Z',
      'enviado:feito:-',
      'entregue:feito:-',
      'lido:feito:2026-10-21T13:25:52.000Z',
    ])
  })

  it('entregue: o lido continua pendente', () => {
    const entregue = { ...base, status: 'delivered' as const, enviadoEm: '2026-10-21T13:20:05.000Z', entregueEm: '2026-10-21T13:20:09.000Z' }
    expect(resumo(entregue).slice(1)).toEqual([
      'enviado:feito:2026-10-21T13:20:05.000Z',
      'entregue:feito:2026-10-21T13:20:09.000Z',
      'lido:pendente:-',
    ])
  })

  it('falha encerra a linha', () => {
    const falha = { ...base, status: 'failed' as const, falhouEm: '2026-10-21T13:25:27.000Z' }
    expect(resumo(falha)).toEqual(['agendado:feito:2026-10-20T13:14:00.000Z', 'falhou:falhou:2026-10-21T13:25:27.000Z'])
  })

  it('cancelamento encerra a linha', () => {
    const cancelado = { ...base, status: 'canceled' as const, canceladoEm: '2026-10-20T15:00:00.000Z' }
    expect(resumo(cancelado)).toEqual(['agendado:feito:2026-10-20T13:14:00.000Z', 'cancelado:cancelado:2026-10-20T15:00:00.000Z'])
  })
})

describe('oQueFazer', () => {
  it('traduz o código do começo da frase', () => {
    expect(oQueFazer('131049 - A *Meta* recusou enviar este modelo (Marketing) para manter o engajamento')).toMatch(/em outro dia/)
    expect(oQueFazer('132012 - Os valores de parâmetros variáveis foram formatados incorretamente')).toMatch(/arquivo/)
  })

  it('reconhece a frase sem código', () => {
    expect(oQueFazer('Modelo de mensagem não encontrado.')).toMatch(/apagado/)
  })

  it('não inventa passo para frase desconhecida', () => {
    expect(oQueFazer('Erro inesperado')).toBeNull()
    expect(oQueFazer('999999 - algo novo')).toBeNull()
    expect(oQueFazer(null)).toBeNull()
  })
})

describe('conversaDoEnvio', () => {
  it('usa a conversa da própria mensagem, sem perguntar à plataforma', async () => {
    let perguntou = false
    const id = await conversaDoEnvio({
      buscarContato: async () => ({ conversaId: 's1', telefone: '+5562999990000' }),
      conversaMaisRecente: async () => {
        perguntou = true
        return { id: 's2' }
      },
    })
    expect(id).toBe('s1')
    expect(perguntou).toBe(false)
  })

  it('sem a do lembrete, a mais recente do paciente', async () => {
    const id = await conversaDoEnvio({
      buscarContato: async () => ({ conversaId: null, telefone: '+5562999990000' }),
      conversaMaisRecente: async (telefone) => (telefone === '+5562999990000' ? { id: 's2' } : null),
    })
    expect(id).toBe('s2')
  })

  it('sem conversa nenhuma, diz isso', async () => {
    await expect(
      conversaDoEnvio({ buscarContato: async () => ({ conversaId: null, telefone: 'x' }), conversaMaisRecente: async () => null })
    ).rejects.toBeInstanceOf(SemConversaError)
  })

  it('envio de outra unidade não é encontrado', async () => {
    await expect(
      conversaDoEnvio({ buscarContato: async () => null, conversaMaisRecente: async () => ({ id: 's' }) })
    ).rejects.toBeInstanceOf(EnvioNaoEncontradoError)
  })
})
