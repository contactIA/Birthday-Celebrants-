import { createMiddleware } from 'hono/factory'
import { conferirChavePeloHash, VARIAVEL_DO_HASH_DA_API } from '@/acesso/chave-de-integracao'
import { erroDoApp } from './erros'
import type { Ambiente } from './roteador'

// A chave da integração: `Authorization: Bearer <chave>`, conferida contra o
// SHA-256 guardado em INTEGRACAO_API_CHAVE_HASH (docs/adr/0007-api-de-integracao.md).
//
// A chave diz QUEM chama (a Mensageria), não a clínica: a clínica vem explícita
// no caminho de toda rota, e é ela que filtra cada leitura e escrita
// (`escopo.ts`). Sem a variável, 503: configuração ausente não é acesso negado
// (a mesma lição do CRON_SECRET).

export const exigirChave = createMiddleware<Ambiente>(async (c, next) => {
  const decisao = conferirChavePeloHash(c.req.header('authorization') ?? null, process.env[VARIAVEL_DO_HASH_DA_API])
  if (decisao === 'nao-configurada') {
    console.error(
      `[integracao/v1] ${VARIAVEL_DO_HASH_DA_API} ausente ou fora do formato (SHA-256 em hexadecimal): ` +
        'a API rejeita toda chamada. Cadastrar no .env do servidor (ver docs/deploy-vps.md).'
    )
    throw erroDoApp('INTEGRACAO_NAO_CONFIGURADA', 'Integração não configurada neste servidor', 503)
  }
  if (decisao === 'negar') {
    throw erroDoApp('NAO_AUTORIZADO', 'Envie a chave da integração no cabeçalho Authorization: Bearer <chave>', 401)
  }
  await next()
})
