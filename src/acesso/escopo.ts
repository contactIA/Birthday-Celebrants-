import type { NextRequest } from 'next/server'
import { HEADER_COMPANY_ID } from './token'

/**
 * A clínica desta requisição.
 *
 * A ÚNICA fonte legítima é o header que o proxy grava depois de verificar o
 * token. As fatias NÃO leem `?clinica=` nem nada do corpo: era exatamente isso
 * que deixava o chamador escolher a clínica. Os parâmetros continuam podendo
 * chegar na URL — eles simplesmente não decidem nada.
 *
 * Lança quando o header não vem, e o modo de falha é deliberado: se alguém
 * mudar o `matcher` do proxy e tirar uma rota da cobertura, ela passa a
 * responder erro em vez de voltar silenciosamente a confiar no request.
 */
export function exigirCompanyId(request: NextRequest): string {
  const companyId = request.headers.get(HEADER_COMPANY_ID)
  if (!companyId) throw new SemEscopoError()
  return companyId
}

export class SemEscopoError extends Error {
  readonly status = 401
  readonly codigo = 'SEM_ESCOPO' as const
  constructor() {
    super('Requisição sem escopo de clínica')
    this.name = 'SemEscopoError'
  }
}
