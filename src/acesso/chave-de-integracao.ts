import { createHash, timingSafeEqual } from 'node:crypto'

// A chave das rotas de integração (`/api/integracao/*`): quem chama é outro
// sistema nosso, não uma clínica. Hoje, só a Mensageria, que lê o resumo de uso
// do app (ADR 0008 da Mensageria, docs/adr/0006-resumo-de-uso-para-a-mensageria.md).
//
// Chave PRÓPRIA, não o CRON_SECRET: o cron executa e esta lê dados de todas as
// clínicas. Trocar uma não pode derrubar a outra, e quem tem uma não ganha a outra.

/** O nome da variável no `.env`. */
export const VARIAVEL_DA_CHAVE_DE_USO = 'INTEGRACAO_USO_CHAVE'

/**
 * - `nao-configurada`: a variável está vazia. É configuração, não ataque, e a
 *   rota responde 503, não 401 (a mesma distinção do CRON_SECRET).
 * - `negar`: sem `Authorization: Bearer`, ou com outra chave.
 * - `liberar`: a chave confere.
 */
export type DecisaoDaChave = 'nao-configurada' | 'negar' | 'liberar'

function resumo(texto: string): Buffer {
  return createHash('sha256').update(texto, 'utf8').digest()
}

/**
 * Confere o header `Authorization` contra a chave do ambiente.
 *
 * A comparação é em tempo constante sobre o SHA-256 dos dois lados: o
 * `timingSafeEqual` exige o mesmo tamanho, e comparar o tamanho antes vazaria o
 * comprimento da chave. Vazio conta como ausente (`||`, não `??`), e o espaço
 * em volta da chave do `.env` não conta.
 */
export function conferirChaveDeIntegracao(authorization: string | null, chave: string | undefined): DecisaoDaChave {
  const esperada = (chave || '').trim()
  if (!esperada) return 'nao-configurada'

  const informada = /^Bearer (.+)$/.exec(authorization ?? '')?.[1]
  if (!informada) return 'negar'

  return timingSafeEqual(resumo(informada), resumo(esperada)) ? 'liberar' : 'negar'
}
