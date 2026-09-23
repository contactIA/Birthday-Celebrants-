import { MensagemNaoEstaAgendadaError } from '@/providers/mensageria'
import type { StatusEnvio } from '@/shared/db'

// A regra do cancelamento.
//
// O ponto sutil: "a plataforma recusou o cancelamento" e "o cancelamento
// falhou" NÃO são a mesma coisa. Se a mensagem já não está agendada lá — foi
// enviada, ou foi cancelada direto na plataforma —, o resultado que a pessoa
// queria (não enviar mais) já é verdade. Tratar isso como erro deixava o status
// local dessincronizado para sempre: a tela mostrava "agendado" e todo clique
// em cancelar dava erro de novo.

export interface EnvioParaCancelar {
  id: string
  /** Id na plataforma. `null` quando a criação respondeu sem corpo. */
  mensagemId: string | null
  status: StatusEnvio
}

/** Estados em que ainda faz sentido pedir cancelamento à plataforma. */
const CANCELAVEIS: ReadonlySet<StatusEnvio> = new Set(['scheduled', 'processed'])

/** Já saiu. Cancelar não é possível nem faria diferença. */
const JA_ENTREGUES: ReadonlySet<StatusEnvio> = new Set(['sent', 'delivered', 'read'])

export type ResultadoDoCancelamento =
  /** Cancelado na plataforma e localmente. */
  | { situacao: 'cancelado' }
  /** Já constava cancelado aqui — nada a fazer. */
  | { situacao: 'ja_cancelado' }
  /**
   * A plataforma disse que a mensagem já não estava agendada. Sincronizamos o
   * status local em vez de estourar erro.
   */
  | { situacao: 'sincronizado' }

export class EnvioNaoEncontradoError extends Error {
  readonly status = 404
  readonly codigo = 'ENVIO_NAO_ENCONTRADO' as const
  constructor() {
    // A busca é escopada à clínica: envio de outra clínica é "não encontrado",
    // não "proibido" — não confirmamos que o id existe em outro lugar.
    super('Agendamento não encontrado')
    this.name = 'EnvioNaoEncontradoError'
  }
}

export class EnvioJaEnviadoError extends Error {
  readonly status = 409
  readonly codigo = 'ENVIO_JA_ENVIADO' as const
  constructor() {
    super('Esta mensagem já foi enviada e não pode mais ser cancelada')
    this.name = 'EnvioJaEnviadoError'
  }
}

export class SemMensagemNaPlataformaError extends Error {
  readonly status = 409
  readonly codigo = 'SEM_MENSAGEM_NA_PLATAFORMA' as const
  constructor() {
    // Não marcamos como cancelado: seria mentir. Sem o id não há como pedir o
    // cancelamento, e a mensagem pode sair mesmo assim — quem lê precisa saber
    // que o caso exige ação na própria plataforma.
    super(
      'Não foi possível cancelar: este agendamento não tem identificador na plataforma de mensagens. ' +
        'Verifique diretamente na plataforma.'
    )
    this.name = 'SemMensagemNaPlataformaError'
  }
}

export interface Dependencias {
  buscarEnvio: (envioId: string) => Promise<EnvioParaCancelar | null>
  cancelarNaPlataforma: (mensagemId: string) => Promise<void>
  marcarComoCancelado: (envioId: string) => Promise<void>
}

export async function cancelarEnvio(
  envioId: string,
  deps: Dependencias
): Promise<ResultadoDoCancelamento> {
  const envio = await deps.buscarEnvio(envioId)
  if (!envio) throw new EnvioNaoEncontradoError()

  // Idempotente: pedir de novo o que já está feito responde sucesso. Evita que
  // um duplo clique, ou dois operadores na mesma tela, produzam erro.
  if (envio.status === 'canceled') return { situacao: 'ja_cancelado' }

  if (JA_ENTREGUES.has(envio.status)) throw new EnvioJaEnviadoError()

  // `failed` cai aqui: a mensagem não vai sair, então marcar como cancelada é
  // sincronizar, não cancelar.
  if (!CANCELAVEIS.has(envio.status)) {
    await deps.marcarComoCancelado(envio.id)
    return { situacao: 'sincronizado' }
  }

  if (!envio.mensagemId) throw new SemMensagemNaPlataformaError()

  try {
    await deps.cancelarNaPlataforma(envio.mensagemId)
  } catch (err) {
    // Só este caso é sucesso disfarçado de erro. Qualquer outro sobe — se a
    // plataforma está fora do ar, não podemos afirmar que a mensagem não sai.
    if (!(err instanceof MensagemNaoEstaAgendadaError)) throw err
    await deps.marcarComoCancelado(envio.id)
    return { situacao: 'sincronizado' }
  }

  await deps.marcarComoCancelado(envio.id)
  return { situacao: 'cancelado' }
}
