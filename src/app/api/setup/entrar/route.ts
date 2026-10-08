import { NextResponse, type NextRequest } from 'next/server'
import { verificarLinkDeSetup } from '@/acesso/link-de-setup'
import { assinarSessao, cookieDaSessaoDeSetup, segredosDoSetup, TTL_SESSAO_SETUP } from '@/acesso/setup'
import { listarClinicasNoSetup } from '@/shared/clinica/repositorio'

// GET /api/setup/entrar?t=<token> — o setup do CRM abre o setup deste app com um
// link curto e assinado (contactIA/CRM-Contact-IA#219; o formato está em
// `src/acesso/link-de-setup.ts`). Abre a MESMA sessão que a senha abre, no mesmo
// cookie, e leva à clínica do link, ou à lista.
//
// Rota pública da área de setup (ver decisao-setup.ts): a credencial é o próprio
// link.

/** A tela de entrar com o aviso de link recusado. Sem o motivo: vencido e forjado dão o mesmo. */
function paraEntrar() {
  // Location relativo: atrás do nginx, a URL do pedido é a interna do container
  // (0.0.0.0:3000), e o navegador resolve o caminho no domínio público.
  return new NextResponse(null, { status: 303, headers: { Location: '/setup/entrar?aviso=link' } })
}

/** O caminho da clínica no setup deste app (o id local), ou a lista quando não há clínica ou ela não está aqui. */
async function destinoDaClinica(companyId: string | null): Promise<string> {
  if (!companyId) return '/setup'
  try {
    const procurado = companyId.toLowerCase()
    const clinica = (await listarClinicasNoSetup()).find((c) => c.companyId.toLowerCase() === procurado)
    return clinica ? `/setup/clinicas/${encodeURIComponent(clinica.id)}` : '/setup'
  } catch (err) {
    // A sessão já vale: sem a lista, abre a lista, que mostra o próprio erro.
    console.error('[setup/entrar] não achei a clínica do link:', err instanceof Error ? err.message : err)
    return '/setup'
  }
}

function escaparHtml(texto: string): string {
  return texto.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
}

/**
 * A ida ao setup, por uma página que navega sozinha, e não por um 302.
 *
 * O cookie da sessão é `SameSite=Strict`, e este pedido chega de outro site (o
 * CRM). Num redirect, o navegador trata a cadeia inteira como vinda de fora e
 * não manda o cookie recém-gravado: o setup mandaria de volta para a tela de
 * entrar. A navegação que sai desta página é do próprio app, e o cookie vai.
 */
function paginaDeIda(destino: string): string {
  const url = escaparHtml(destino)
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="robots" content="noindex">
<meta http-equiv="refresh" content="0;url=${url}">
<title>Abrindo o setup</title>
</head>
<body style="font-family:system-ui,sans-serif;padding:48px 24px;color:#333">
<p>Abrindo o setup. Se não abrir sozinho, <a href="${url}">clique aqui</a>.</p>
</body>
</html>`
}

export async function GET(request: NextRequest) {
  const segredos = segredosDoSetup()
  if (!segredos?.segredoDoLink) {
    console.error('[setup/entrar] SETUP_LINK_SEGREDO ausente: o link do setup do CRM não abre o setup deste app.')
    return NextResponse.json(
      { error: 'Entrada pelo setup do CRM não configurada neste servidor', codigo: 'SETUP_LINK_NAO_CONFIGURADO' },
      { status: 503 }
    )
  }

  const agora = new Date()
  const link = verificarLinkDeSetup(request.nextUrl.searchParams.get('t'), agora, segredos.segredoDoLink)
  if (!link) {
    console.warn(`[setup/entrar] link recusado de ${request.headers.get('x-real-ip') ?? 'desconhecido'}`)
    return paraEntrar()
  }

  const destino = await destinoDaClinica(link.companyId)
  console.info(`[setup/entrar] sessão aberta pelo link do CRM${link.companyId ? ` (${link.companyId})` : ''}`)

  const res = new NextResponse(paginaDeIda(destino), {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      // O token está na URL desta página: não vai no Referer da navegação seguinte.
      'referrer-policy': 'no-referrer',
    },
  })
  res.cookies.set(
    cookieDaSessaoDeSetup(
      assinarSessao(agora, segredos.linkSecret, segredos.ancora),
      TTL_SESSAO_SETUP,
      process.env.NODE_ENV === 'production'
    )
  )
  return res
}
