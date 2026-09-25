import type { StatusEnvio } from '@/shared/db'

// Os filtros do histórico, lidos da URL. Função pura: a rota só repassa os
// parâmetros, e a regra (o que é aceito, o que cada grupo de situação inclui)
// fica testável sem banco.

/** Grupos de situação, como a pessoa pensa neles, e os status que cada um junta. */
export const SITUACOES = {
  agendadas: ['scheduled', 'processed'],
  enviadas: ['sent', 'delivered', 'read'],
  canceladas: ['canceled'],
  falhas: ['failed'],
} as const satisfies Record<string, readonly StatusEnvio[]>

export type Situacao = keyof typeof SITUACOES
export type Ordem = 'envio' | 'criacao'

export interface FiltrosDoHistorico {
  /** Texto já saneado para o filtro do banco, ou `null`. */
  busca: string | null
  /** Só os dígitos da busca, para achar pelo telefone. `null` se tiver menos de 3. */
  buscaDigitos: string | null
  situacao: Situacao | null
  ordem: Ordem
  crescente: boolean
}

export const TAMANHO_MAXIMO_DA_BUSCA = 60

export class FiltroInvalidoError extends Error {
  readonly status = 400
  readonly codigo = 'FILTRO_INVALIDO' as const
  constructor(mensagem: string) {
    super(mensagem)
    this.name = 'FiltroInvalidoError'
  }
}

/**
 * Lê os filtros. Parâmetro ausente ou vazio vale o padrão: mais recentes
 * primeiro pela data de envio, todas as situações, sem busca.
 *
 * A busca perde vírgula, parênteses, % e _: são sintaxe do filtro do banco, e
 * deixá-los passar permitiria montar outra condição pela URL.
 */
export function lerFiltros(params: URLSearchParams): FiltrosDoHistorico {
  const bruta = (params.get('busca') ?? '').slice(0, TAMANHO_MAXIMO_DA_BUSCA)
  const limpa = bruta.replace(/[,()%_*\\]/g, ' ').replace(/\s+/g, ' ').trim()
  const digitos = limpa.replace(/\D/g, '')

  const situacao = params.get('situacao') || null
  if (situacao !== null && !(situacao in SITUACOES)) throw new FiltroInvalidoError('Situação inválida')

  const ordem = params.get('ordem') || 'envio'
  if (ordem !== 'envio' && ordem !== 'criacao') throw new FiltroInvalidoError('Ordenação inválida')

  const direcao = params.get('direcao') || 'desc'
  if (direcao !== 'asc' && direcao !== 'desc') throw new FiltroInvalidoError('Direção inválida')

  return {
    busca: limpa || null,
    buscaDigitos: digitos.length >= 3 ? digitos : null,
    situacao: situacao as Situacao | null,
    ordem,
    crescente: direcao === 'asc',
  }
}
