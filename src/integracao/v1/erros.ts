import type { Context } from 'hono'
import { HTTPException } from 'hono/http-exception'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { ehErroDeDominio } from '@/shared/http'

// Tradução de erro para resposta, num lugar só: `{ erro, codigo }`.
//
// Os erros de domínio deste app já sabem o status e o código (`shared/http.ts`):
// sobem com a frase deles, escrita para quem lê. Qualquer outra coisa vira 500
// genérico, com o detalhe só no log: a mensagem de uma exceção inesperada pode
// ter credencial, consulta ou dado de paciente. A resposta que não bate com o
// próprio esquema também cai aqui, como 500: o contrato não deixa passar campo
// a mais nem forma errada.

export function erroDoApp(codigo: string, erro: string, status: number): Error & { status: number; codigo: string } {
  return Object.assign(new Error(erro), { status, codigo })
}

export function tratarErro(erro: Error, c: Context) {
  if (ehErroDeDominio(erro)) {
    if (erro.status >= 500) console.error('[integracao/v1]', erro)
    return c.json({ erro: erro.message, codigo: erro.codigo }, erro.status as ContentfulStatusCode)
  }
  // A do Hono: o corpo que não é JSON, por exemplo. Mesmo formato das outras.
  if (erro instanceof HTTPException) {
    return c.json({ erro: 'Requisição inválida', codigo: 'REQUISICAO_INVALIDA' }, erro.status as ContentfulStatusCode)
  }

  console.error('[integracao/v1]', erro)
  return c.json({ erro: 'Não foi possível completar a operação', codigo: 'ERRO_INTERNO' }, 500)
}
