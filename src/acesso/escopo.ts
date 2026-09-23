import type { NextRequest } from 'next/server'
import { HEADER_COMPANY_ID } from './token'
import { COOKIE_SETUP, segredosDoSetup, sessaoValida } from './setup'

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

/**
 * Exige sessão de setup válida. Segunda barreira, depois do proxy.
 *
 * Redundante com o gate de propósito, pelo mesmo motivo de `exigirCompanyId`:
 * se o `matcher` do proxy mudar e uma rota de setup sair da cobertura, ela
 * passa a responder 401 em vez de abrir as credenciais de todas as clínicas.
 */
export function exigirSessaoDeSetup(request: NextRequest): void {
  const segredos = segredosDoSetup()
  const token = request.cookies.get(COOKIE_SETUP)?.value
  if (!segredos || !sessaoValida(token, new Date(), segredos.linkSecret, segredos.hashDaSenha)) {
    throw new SemSessaoDeSetupError()
  }
}

export class SemSessaoDeSetupError extends Error {
  readonly status = 401
  readonly codigo = 'SEM_SESSAO_SETUP' as const
  constructor() {
    super('Sessão de setup ausente ou expirada')
    this.name = 'SemSessaoDeSetupError'
  }
}

export class SemEscopoError extends Error {
  readonly status = 401
  readonly codigo = 'SEM_ESCOPO' as const
  constructor() {
    super('Requisição sem escopo de clínica')
    this.name = 'SemEscopoError'
  }
}
