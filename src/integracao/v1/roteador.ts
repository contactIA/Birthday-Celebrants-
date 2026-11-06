import { OpenAPIHono } from '@hono/zod-openapi'
import type { Servicos } from './servicos'

// Todo roteador da API de integração nasce aqui, para todos responderem do
// mesmo jeito quando a requisição não passa na validação dos esquemas (o mesmo
// desenho do CRM, src/api/roteador.ts de lá).
//
// O esquema de cada rota (zod) faz duas coisas ao mesmo tempo: valida a
// requisição e gera o contrato OpenAPI. Rota sem esquema não entra.

export interface Ambiente {
  Variables: { servicos: Servicos }
}

export function novoRoteador() {
  return new OpenAPIHono<Ambiente>({
    defaultHook: (resultado, c) => {
      if (!resultado.success) {
        return c.json(
          {
            erro: 'Requisição inválida',
            codigo: 'REQUISICAO_INVALIDA',
            detalhes: resultado.error.issues.map((problema) => ({
              campo: problema.path.join('.'),
              mensagem: problema.message,
            })),
          },
          400
        )
      }
    },
  })
}
