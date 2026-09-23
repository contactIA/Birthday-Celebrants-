import { NextResponse, type NextRequest } from 'next/server'
import { exigirSessaoDeSetup } from '@/acesso/escopo'
import { assinar, segredoDoAmbiente } from '@/acesso/token'
import { buscarClinicaNoSetup } from '@/shared/clinica/repositorio'
import { responderErro } from '@/shared/http'
import { lerValidade, VALIDADES_DO_LINK } from '@/features/configurar-clinica/regras'

// POST /api/setup/clinicas/:id/link — gera o link assinado do painel.
//
// Corpo: { validade: 'sem' | '30d' | '7d' | '24h' }
//
// O link carrega a clínica no token (ver acesso/token.ts): quem o tiver entra
// no painel DESTA clínica até ele expirar. "Sem expiração" existe para a aba
// fixa da plataforma e não tem como ser revogado sozinho — só trocando o
// LINK_SECRET, o que derruba os links de todas as clínicas.

/**
 * A origem pública do app. Atrás do nginx, `request.nextUrl` enxerga o
 * endereço interno do container; o `Host` e o `X-Forwarded-Proto` que o nginx
 * repassa são o que a pessoa de fato digitou.
 */
function origemPublica(request: NextRequest): string {
  const host = request.headers.get('host') ?? request.nextUrl.host
  const protocolo =
    request.headers.get('x-forwarded-proto') ?? (process.env.NODE_ENV === 'production' ? 'https' : 'http')
  return `${protocolo}://${host}`
}

export async function POST(request: NextRequest, ctx: RouteContext<'/api/setup/clinicas/[id]/link'>) {
  try {
    exigirSessaoDeSetup(request)
    const { id } = await ctx.params
    const corpo = (await request.json().catch(() => null)) as { validade?: unknown } | null
    const validade = lerValidade(corpo?.validade)

    const clinica = await buscarClinicaNoSetup(id)
    const agora = new Date()
    const segundos = VALIDADES_DO_LINK[validade]
    const token = assinar(clinica.companyId, segundos, agora, segredoDoAmbiente())

    console.info(`[setup] link do painel gerado para ${clinica.companyId} (validade: ${validade})`)
    return NextResponse.json({
      url: `${origemPublica(request)}/?t=${token}`,
      expiraEm: segundos === null ? null : new Date(agora.getTime() + segundos * 1000).toISOString(),
    })
  } catch (err) {
    return responderErro('api/setup/clinicas/:id/link', err)
  }
}
