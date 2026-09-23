import { NextResponse } from 'next/server'

// Tradução de erro de domínio para resposta HTTP, num lugar só.
//
// No app anterior cada rota repetia `(err as { status?: number }).status ?? 500`
// e devolvia `err.message` cru no corpo. Dois problemas: qualquer erro
// inesperado virava texto de exceção na tela da clínica, e o código do erro
// (que o frontend usa para escolher a tela) dependia de cada rota lembrar de
// repassá-lo.

/** Erro que sabe como quer ser respondido. */
interface ErroDeDominio {
  status: number
  codigo: string
  message: string
}

function ehErroDeDominio(err: unknown): err is ErroDeDominio {
  return (
    typeof err === 'object' &&
    err !== null &&
    typeof (err as ErroDeDominio).status === 'number' &&
    typeof (err as ErroDeDominio).codigo === 'string'
  )
}

/**
 * Responde o erro.
 *
 * Erro de domínio sobe mensagem e código — são frases escritas para quem lê a
 * tela. Qualquer outra coisa vira 500 genérico com o detalhe só no log: a
 * mensagem de uma exceção inesperada pode conter credencial, query ou dado de
 * paciente, e nada disso tem por que chegar ao browser.
 */
export function responderErro(contexto: string, err: unknown) {
  if (ehErroDeDominio(err)) {
    return NextResponse.json(
      { error: err.message, codigo: err.codigo },
      { status: err.status }
    )
  }

  console.error(`[${contexto}]`, err)
  return NextResponse.json(
    { error: 'Não foi possível completar a operação', codigo: 'ERRO_INTERNO' },
    { status: 500 }
  )
}

export class ParametroInvalidoError extends Error {
  readonly status = 400
  readonly codigo = 'PARAMETRO_INVALIDO' as const
  constructor(mensagem: string) {
    super(mensagem)
    this.name = 'ParametroInvalidoError'
  }
}

/** Mês de 1 a 12, ou `null` quando ausente. Lança em valor fora da faixa. */
export function lerMes(bruto: string | null): number | null {
  if (bruto === null || bruto === '') return null
  const mes = Number(bruto)
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) {
    throw new ParametroInvalidoError('Mês inválido')
  }
  return mes
}
