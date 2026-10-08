import { sessaoValida } from './setup'

// A decisão de acesso da área de setup, separada do Next como a de clínica
// (`decisao.ts`). O `proxy.ts` só traduz o resultado em resposta.

export type DecisaoDeSetup =
  /** Rota pública da área: a tela de entrar, o POST da senha e o link do CRM. */
  | { tipo: 'publica' }
  | { tipo: 'seguir' }
  /** Página sem sessão: mandar para a tela de entrar. */
  | { tipo: 'entrar' }
  /** API sem sessão: 401. */
  | { tipo: 'negar' }

/**
 * A rota pertence à área de setup?
 *
 * Comparação por segmento, não por prefixo de string: `/setupX` e
 * `/api/setup-algo` NÃO são setup, e tratá-los como tal tiraria a rota do gate
 * de clínica sem colocá-la em gate nenhum.
 */
export function ehRotaDeSetup(caminho: string): boolean {
  return (
    caminho === '/setup' ||
    caminho.startsWith('/setup/') ||
    caminho === '/api/setup' ||
    caminho.startsWith('/api/setup/')
  )
}

export function decidirSetup(e: {
  caminho: string
  metodo: string
  tokenDoCookie: string | null
  agora: Date
  linkSecret: string
  /** A âncora da chave da sessão (`SegredosDoSetup.ancora`). */
  ancora: string
}): DecisaoDeSetup {
  // O GET do link do CRM é público como o POST da senha: os dois SÃO a entrada,
  // e cada um confere a própria credencial (a senha, ou a assinatura do link).
  const publica =
    e.caminho === '/setup/entrar' ||
    (e.caminho === '/api/setup/sessao' && e.metodo === 'POST') ||
    (e.caminho === '/api/setup/entrar' && e.metodo === 'GET')
  if (publica) return { tipo: 'publica' }

  if (sessaoValida(e.tokenDoCookie, e.agora, e.linkSecret, e.ancora)) return { tipo: 'seguir' }

  return e.caminho.startsWith('/api/') ? { tipo: 'negar' } : { tipo: 'entrar' }
}
