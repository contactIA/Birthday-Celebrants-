import type { NextConfig } from 'next'

// O painel vive dentro de um iframe da plataforma white label. `frame-ancestors`
// restringe QUEM pode embutir — a mesma lista que o proxy usa para aceitar a
// clínica pela URL. Sem isso, qualquer site pode enquadrar o painel, e o cookie
// de escopo é `SameSite=None` justamente para funcionar em iframe de terceiro.
// `||`, não `??`: `EMBED_HOSTS=` vazio no .env chega como string vazia, e com
// `??` a CSP saía só com `'self'` — a plataforma não conseguia embutir o painel.
const EMBED_HOSTS = (process.env.EMBED_HOSTS || 'app.fluxodonto.com')
  .split(',')
  .map((h) => h.trim())
  .filter(Boolean)

const frameAncestors = ["'self'", ...EMBED_HOSTS.flatMap((h) => [`https://${h}`, `https://*.${h}`])]

const nextConfig: NextConfig = {
  // Deploy por Docker na VPS: gera `.next/standalone` com um `server.js` e só as
  // dependências rastreadas, sem precisar de `node_modules` na imagem final.
  output: 'standalone',
  // ATENÇÃO: `headers()` é avaliado no `next build`, não a cada request. Mudar
  // EMBED_HOSTS no ambiente do container altera o proxy, mas a CSP só muda com
  // um novo build (o Dockerfile aceita EMBED_HOSTS como build arg).
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: `frame-ancestors ${frameAncestors.join(' ')};` },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
        ],
      },
      // Área de setup: NINGUÉM embute — nem a plataforma. Ela grava credenciais
      // de todas as clínicas, e em iframe alheio vira alvo de clickjacking.
      // Vem DEPOIS da regra geral: com a mesma chave, a última que casa vence.
      {
        source: '/setup/:path*',
        headers: [{ key: 'Content-Security-Policy', value: "frame-ancestors 'none';" }],
      },
      {
        source: '/setup',
        headers: [{ key: 'Content-Security-Policy', value: "frame-ancestors 'none';" }],
      },
      {
        source: '/api/setup/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none';" },
          // Respostas com dados de todas as clínicas não ficam em cache nenhum.
          { key: 'Cache-Control', value: 'no-store' },
        ],
      },
    ]
  },
}

export default nextConfig
