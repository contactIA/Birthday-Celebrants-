import { handle } from 'hono/vercel'
import { criarApiDeIntegracao } from '@/integracao/v1/app'

// A API de integração (/api/integracao/v1/*) é um app Hono, montado aqui. Esta
// rota só entrega a requisição: a chave, o escopo da clínica, a validação, o
// contrato e os erros ficam em src/integracao/v1 (docs/adr/0007-api-de-integracao.md).
//
// Fica fora do gate de clínica do `proxy.ts` (o matcher exclui `api/integracao`):
// quem chama é outro sistema nosso, com a chave própria, e a clínica vem no caminho.

export const maxDuration = 60

const api = criarApiDeIntegracao()

export const GET = handle(api)
export const POST = handle(api)
export const PUT = handle(api)
