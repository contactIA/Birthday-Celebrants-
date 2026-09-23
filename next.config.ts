import type { NextConfig } from 'next'

// O painel vive dentro de um iframe da plataforma white label. `frame-ancestors`
// restringe QUEM pode embutir — a mesma lista que o proxy usa para aceitar a
// clínica pela URL. Sem isso, qualquer site pode enquadrar o painel, e o cookie
// de escopo é `SameSite=None` justamente para funcionar em iframe de terceiro.
const EMBED_HOSTS = (process.env.EMBED_HOSTS ?? 'app.fluxodonto.com')
  .split(',')
  .map((h) => h.trim())
  .filter(Boolean)

const frameAncestors = ["'self'", ...EMBED_HOSTS.flatMap((h) => [`https://${h}`, `https://*.${h}`])]

const nextConfig: NextConfig = {
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
    ]
  },
}

export default nextConfig
