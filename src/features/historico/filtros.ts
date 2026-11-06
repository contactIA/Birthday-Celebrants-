import { offsetDe } from '@/shared/data/fuso'
import type { StatusEnvio } from '@/shared/db'

// Os filtros do histórico, lidos da URL. Função pura: a rota só repassa os
// parâmetros, e a regra (o que é aceito, o que cada grupo de situação inclui)
// fica testável sem banco.

/** Grupos de situação, como a pessoa pensa neles, e os status que cada um junta. */
export const SITUACOES = {
  agendadas: ['scheduled', 'processed'],
  /** As agendadas que passaram do horário sem sair (shared/data/envio-que-nao-saiu.ts): o horário separa das `agendadas`. */
  nao_sairam: ['scheduled', 'processed'],
  enviadas: ['sent', 'delivered', 'read'],
  canceladas: ['canceled'],
  falhas: ['failed'],
} as const satisfies Record<string, readonly StatusEnvio[]>

export type Situacao = keyof typeof SITUACOES
export type Ordem = 'envio' | 'criacao'

/**
 * O período do histórico pela data do envio (o horário marcado para sair), em
 * dias de calendário DA CLÍNICA ("AAAA-MM-DD", inclusive). A tela não manda
 * período; a API de integração manda.
 */
export interface PeriodoDoHistorico {
  de: string | null
  ate: string | null
}

export interface FiltrosDoHistorico {
  /** Texto já saneado para o filtro do banco, ou `null`. */
  busca: string | null
  /** Só os dígitos da busca, para achar pelo telefone. `null` se tiver menos de 3. */
  buscaDigitos: string | null
  situacao: Situacao | null
  ordem: Ordem
  crescente: boolean
  /** `null` = sem período: todo o histórico. */
  periodo: PeriodoDoHistorico | null
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
    periodo: lerPeriodo(params),
  }
}

const DATA_ISO = /^(\d{4})-(\d{2})-(\d{2})$/

/** "AAAA-MM-DD" que existe no calendário, ou `null` quando ausente. */
function lerData(bruto: string | null): string | null {
  if (bruto === null || bruto === '') return null
  const m = DATA_ISO.exec(bruto)
  const [ano, mes, dia] = m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [0, 0, 0]
  const d = new Date(Date.UTC(ano, mes - 1, dia))
  if (!m || d.getUTCFullYear() !== ano || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) {
    throw new FiltroInvalidoError('Data inválida')
  }
  return bruto
}

function lerPeriodo(params: URLSearchParams): PeriodoDoHistorico | null {
  const de = lerData(params.get('de'))
  const ate = lerData(params.get('ate'))
  if (de === null && ate === null) return null
  if (de !== null && ate !== null && ate < de) throw new FiltroInvalidoError('A data final vem antes da inicial')
  return { de, ate }
}

/** O período como o banco filtra `scheduled_for`: desde (inclusive) e antes de (exclusivo), em ISO. */
export interface LimitesDoPeriodo {
  desde: string | null
  antesDe: string | null
}

/** A meia-noite de um dia de calendário no fuso da clínica, `somarDias` dias depois. */
function meiaNoiteLocal(data: string, timezone: string, somarDias = 0): string {
  const [ano, mes, dia] = data.split('-').map(Number) as [number, number, number]
  return new Date(Date.UTC(ano, mes - 1, dia + somarDias, -offsetDe(timezone))).toISOString()
}

/**
 * Os limites do período no banco. O dia vai da meia-noite da clínica até a
 * meia-noite do dia seguinte, no fuso dela, e não no UTC (senão o envio das
 * 21h cairia no dia seguinte).
 */
export function limitesDoPeriodo(periodo: PeriodoDoHistorico, timezone: string): LimitesDoPeriodo {
  return {
    desde: periodo.de === null ? null : meiaNoiteLocal(periodo.de, timezone),
    antesDe: periodo.ate === null ? null : meiaNoiteLocal(periodo.ate, timezone, 1),
  }
}
