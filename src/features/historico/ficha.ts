import type { StatusEnvio } from '@/shared/db'

// A ficha de um envio do Histórico: as regras que não dependem de banco nem de
// tela. A linha do tempo sai do status e dos horários que a reconciliação
// grava; o "o que fazer" traduz a frase de falha da plataforma em um passo que
// a recepção consegue dar. A mesma ficha do app de lembretes.

/** Os horários do envio, como estão na linha (ISO ou nulo). */
export interface HorariosDoEnvio {
  status: StatusEnvio
  criadoEm: string
  agendadoPara: string | null
  enviadoEm: string | null
  entregueEm: string | null
  lidoEm: string | null
  falhouEm: string | null
  canceladoEm: string | null
}

export type EstadoDoPasso = 'feito' | 'pendente' | 'falhou' | 'cancelado'

export interface PassoDaLinhaDoTempo {
  chave: 'agendado' | 'enviado' | 'entregue' | 'lido' | 'falhou' | 'cancelado'
  rotulo: string
  estado: EstadoDoPasso
  /** ISO. `null` = o passo aconteceu (ou vai acontecer) sem horário conhecido. */
  quando: string | null
  /** Uma linha a mais, quando ajuda ("Previsto"). */
  detalhe?: string
}

/** Até onde a mensagem chegou: cada passo cumprido implica os anteriores. */
const ALCANCE: Record<StatusEnvio, number> = {
  scheduled: 0,
  processed: 0,
  sent: 1,
  delivered: 2,
  read: 3,
  failed: 0,
  canceled: 0,
}

/**
 * A linha do tempo do envio, do agendamento até onde ele chegou.
 *
 * Falha e cancelamento encerram a linha: os passos seguintes não aparecem.
 * Passo cumprido sem horário (pulado entre duas reconciliações, ou de antes de
 * 2026-10-21) aparece feito, sem hora.
 */
export function linhaDoTempo(h: HorariosDoEnvio): PassoDaLinhaDoTempo[] {
  const passos: PassoDaLinhaDoTempo[] = [{ chave: 'agendado', rotulo: 'Agendado', estado: 'feito', quando: h.criadoEm }]

  if (h.status === 'canceled') {
    passos.push({ chave: 'cancelado', rotulo: 'Cancelado', estado: 'cancelado', quando: h.canceladoEm })
    return passos
  }

  if (h.status === 'failed') {
    passos.push({ chave: 'falhou', rotulo: 'Não enviado', estado: 'falhou', quando: h.falhouEm })
    return passos
  }

  const alcance = ALCANCE[h.status]
  passos.push({
    chave: 'enviado',
    rotulo: 'Enviado',
    estado: alcance >= 1 ? 'feito' : 'pendente',
    quando: alcance >= 1 ? h.enviadoEm : h.agendadoPara,
    ...(alcance < 1 ? { detalhe: 'Previsto' } : {}),
  })
  passos.push({ chave: 'entregue', rotulo: 'Entregue', estado: alcance >= 2 ? 'feito' : 'pendente', quando: h.entregueEm })
  passos.push({ chave: 'lido', rotulo: 'Lido', estado: alcance >= 3 ? 'feito' : 'pendente', quando: h.lidoEm })
  return passos
}

// ── O que fazer com uma falha ──────────────────────────────────────────────
//
// A frase da plataforma começa, quase sempre, pelo código de erro do WhatsApp
// ("131049 - A Meta recusou..."). Cada código vira um passo concreto. Código
// que não está aqui fica só com a frase da plataforma, que a ficha mostra
// inteira de qualquer jeito.

const POR_CODIGO: Record<string, string> = {
  '131049':
    'O WhatsApp limita mensagens de marketing para quem já recebe muitas, e segurou esta. Não há o que corrigir no app: em outro dia ela costuma passar.',
  '131050': 'O paciente pediu para não receber mensagens de marketing deste número.',
  '132012':
    'O modelo pede um arquivo (imagem, vídeo ou documento) ou uma variável em outro formato. Confira o arquivo e as variáveis do modelo em Modelos.',
  '132000': 'A quantidade de variáveis não bate com o modelo. Abra o modelo em Modelos e salve as variáveis de novo.',
  '132001': 'O modelo foi apagado ou não está aprovado. Escolha outro em Modelos.',
  '132015': 'O modelo foi pausado pelo WhatsApp por baixa qualidade. Use outro modelo em Modelos.',
  '132016': 'O modelo foi desativado pelo WhatsApp por baixa qualidade. Use outro modelo em Modelos.',
  '131026':
    'Este número não recebe mensagens pelo WhatsApp: pode não ter WhatsApp ou estar desatualizado. Confirme o celular com o paciente.',
  '131056': 'Muitas mensagens para o mesmo número em pouco tempo. A próxima tentativa costuma passar.',
  '131048': 'O WhatsApp limitou o número da clínica por bloqueios ou denúncias recentes. Vale revisar o texto do modelo.',
  '130472': 'O WhatsApp deixou de entregar por um teste interno dele com este número. Não há o que corrigir.',
  '131053': 'O arquivo do modelo não pôde ser enviado. Envie o arquivo de novo em Modelos.',
  '131042': 'Há uma pendência de pagamento na conta do WhatsApp da clínica. Avise quem administra a conta.',
  '131031': 'A conta do WhatsApp da clínica está bloqueada. Avise quem administra a conta.',
  '133010': 'O número da clínica não está registrado no WhatsApp. Avise quem administra a conta.',
}

const POR_FRASE: [RegExp, string][] = [
  [/modelo de mensagem n[aã]o encontrado/i, POR_CODIGO['132001']!],
]

/** O passo que resolve a falha, ou `null` quando a frase não é conhecida. */
export function oQueFazer(motivo: string | null): string | null {
  if (!motivo) return null
  const codigo = motivo.match(/^\s*(\d{6})\b/)?.[1]
  if (codigo && POR_CODIGO[codigo]) return POR_CODIGO[codigo]!
  for (const [frase, passo] of POR_FRASE) if (frase.test(motivo)) return passo
  return null
}

// ── Erros e a conversa ─────────────────────────────────────────────────────

export class EnvioNaoEncontradoError extends Error {
  readonly status = 404
  readonly codigo = 'ENVIO_NAO_ENCONTRADO' as const
  constructor() {
    super('Este envio não foi encontrado nesta unidade')
    this.name = 'EnvioNaoEncontradoError'
  }
}

export class SemConversaError extends Error {
  readonly status = 404
  readonly codigo = 'SEM_CONVERSA' as const
  constructor() {
    super('Ainda não há conversa com este paciente na plataforma de mensagens.')
    this.name = 'SemConversaError'
  }
}

export interface DependenciasDaConversa {
  buscarContato: () => Promise<{ conversaId: string | null; telefone: string } | null>
  conversaMaisRecente: (telefone: string) => Promise<{ id: string } | null>
}

/**
 * A conversa do "Abrir conversa": a da própria mensagem, que a reconciliação
 * grava; sem ela (envios de antes de 2026-10-21, ou ainda não enviados), a
 * conversa mais recente do paciente, pelo telefone.
 */
export async function conversaDoEnvio(deps: DependenciasDaConversa): Promise<string> {
  const contato = await deps.buscarContato()
  if (!contato) throw new EnvioNaoEncontradoError()
  if (contato.conversaId) return contato.conversaId
  const conversa = await deps.conversaMaisRecente(contato.telefone)
  if (!conversa) throw new SemConversaError()
  return conversa.id
}
