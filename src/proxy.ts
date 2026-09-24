import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { decidir, type MotivoDeRecusa } from '@/acesso/decisao'
import { decidirSetup, ehRotaDeSetup } from '@/acesso/decisao-setup'
import { COOKIE_SETUP, segredosDoSetup } from '@/acesso/setup'
import { HEADER_COMPANY_ID, segredoDoAmbiente } from '@/acesso/token'

// Gate de acesso do app. Toda a REGRA vive em `@/acesso/decisao` — este arquivo
// só traduz a decisão em `NextResponse`. É de propósito: a regra é testável, a
// plumbing não precisa ser.
//
// `proxy.ts`, NÃO `middleware.ts`: no Next 16 a convenção `middleware` está
// deprecada e foi renomeada. Escrever `middleware.ts` aqui não daria erro —
// simplesmente não rodaria, que é o pior modo de falha possível para um gate de
// segurança.
//
// Roda no runtime Node.js, default do Proxy no Next 16. É o que permite
// `node:crypto` no token em vez de WebCrypto.

const COOKIE = 'av_escopo'

// `||`, não `??`: `EMBED_HOSTS=` vazio no .env chega como string vazia e, com
// `??`, virava lista vazia — nenhum host autorizado a informar a clínica.
const HOSTS_PERMITIDOS = (process.env.EMBED_HOSTS || 'app.fluxodonto.com')
  .split(',')
  .map((h) => h.trim().toLowerCase())
  .filter(Boolean)

// Cobre tudo menos assets e a rota de cron. O negative match é obrigatório: sem
// `matcher`, o gate rodaria em `_next/static` e derrubaria o CSS e o JS da
// própria página de erro.
//
// `api/cron` fica fora porque tem autenticação própria (CRON_SECRET) e roda para
// todas as clínicas de uma vez, não no escopo de uma.
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/cron).*)'],
}

/**
 * Navegação de entrada: o documento chegando de FORA do app. `Sec-Fetch-Mode:
 * navigate` separa documento de fetch/RSC; `Sec-Fetch-Site` diferente de
 * `same-origin` separa "veio de fora" (outro site, barra de endereço) de
 * "clicou num link do próprio app". O navegador preenche os dois e a página
 * não consegue alterá-los.
 *
 * Navegador sem esses cabeçalhos (versões muito antigas) cai em `false` — o
 * comportamento anterior, com o cookie decidindo. É degradação, não furo: a
 * checagem de escopo divergente continua valendo.
 */
function ehNavegacaoDeEntrada(request: NextRequest): boolean {
  const modo = request.headers.get('sec-fetch-mode')
  const origem = request.headers.get('sec-fetch-site')
  return modo === 'navigate' && origem !== null && origem !== 'same-origin'
}

function ehApi(request: NextRequest): boolean {
  return request.nextUrl.pathname.startsWith('/api/')
}

/**
 * Nenhuma string aqui pode citar o fornecedor da plataforma de mensagens: ela é
 * white label, e a clínica a conhece pela marca do host. Este texto é lido por
 * quem abrir a URL sem token.
 */
function negar(request: NextRequest, motivo: MotivoDeRecusa) {
  if (ehApi(request)) {
    return NextResponse.json({ error: 'Acesso não autorizado', motivo }, { status: 401 })
  }

  // A UI vive dentro de um iframe. Redirecionar para uma tela de login não
  // ajuda (não há login), então responde texto curto — quem abriu sem token não
  // tem ação possível a não ser pedir o link certo.
  const texto =
    motivo === 'escopo-divergente'
      ? 'Este link não corresponde à sua clínica. Peça a quem administra a conta o link correto do painel.'
      : 'Acesso não autorizado. Abra o painel pela aba da sua clínica na plataforma.'

  return new NextResponse(texto, {
    status: 401,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  })
}

/**
 * Segredo ausente é configuração, não ataque — e responder 401 confunde os dois.
 * Foi essa confusão que deixou o cron do app anterior parado por 9 dias sem
 * ninguém notar: o log dizia "não autorizado" e era variável faltando.
 */
function naoConfigurado(request: NextRequest) {
  console.error(
    '[proxy] LINK_SECRET ausente: o app rejeita TODO acesso, de propósito. ' +
      'Cadastrar no .env do servidor (ver docs/deploy-vps.md); o .env.local não vale em produção. ' +
      'O MESMO valor precisa estar no Clinic Control, que emite os links.'
  )
  const corpo = { error: 'Painel não configurado', motivo: 'sem-segredo' }
  return ehApi(request)
    ? NextResponse.json(corpo, { status: 503 })
    : new NextResponse('Painel temporariamente indisponível.', {
        status: 503,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      })
}

/**
 * Gate da área de setup — um acesso à parte, que NÃO passa pelo escopo de
 * clínica. A área grava credenciais de todas as clínicas, então o que a abre é
 * a senha da equipe, nunca o link ou o cookie de uma clínica.
 */
function proxySetup(request: NextRequest) {
  const segredos = segredosDoSetup()
  if (!segredos) {
    // Configuração, não ataque — mesma distinção do LINK_SECRET acima.
    console.error(
      '[proxy] SETUP_PASSWORD_HASH ou LINK_SECRET ausente: a área de setup fica fechada. ' +
        'Gerar o hash com `npm run setup:senha` e cadastrar no .env do servidor.'
    )
    return ehApi(request)
      ? NextResponse.json({ error: 'Setup não configurado', codigo: 'SETUP_NAO_CONFIGURADO' }, { status: 503 })
      : new NextResponse('Setup não configurado neste servidor.', {
          status: 503,
          headers: { 'content-type': 'text/plain; charset=utf-8' },
        })
  }

  const decisao = decidirSetup({
    caminho: request.nextUrl.pathname,
    metodo: request.method,
    tokenDoCookie: request.cookies.get(COOKIE_SETUP)?.value ?? null,
    agora: new Date(),
    ...segredos,
  })

  if (decisao.tipo === 'negar') {
    return NextResponse.json({ error: 'Sessão de setup ausente ou expirada', codigo: 'SEM_SESSAO_SETUP' }, { status: 401 })
  }
  if (decisao.tipo === 'entrar') {
    const entrar = request.nextUrl.clone()
    entrar.pathname = '/setup/entrar'
    entrar.search = ''
    entrar.searchParams.set('volta', request.nextUrl.pathname)
    return NextResponse.redirect(entrar)
  }

  // Tira o header de escopo de clínica, se o cliente mandou um: nenhuma rota de
  // setup deve decidir nada por ele, e deixá-lo passar seria convite a usar.
  const headers = new Headers(request.headers)
  headers.delete(HEADER_COMPANY_ID)
  return NextResponse.next({ request: { headers } })
}

export function proxy(request: NextRequest) {
  if (ehRotaDeSetup(request.nextUrl.pathname)) return proxySetup(request)

  let segredo: string
  try {
    segredo = segredoDoAmbiente()
  } catch {
    return naoConfigurado(request)
  }

  const tokenDaUrl = request.nextUrl.searchParams.get('t')
  const decisao = decidir({
    tokenDaUrl,
    companyIdDaUrl: request.nextUrl.searchParams.get('clinica'),
    referer: request.headers.get('referer'),
    tokenDoCookie: request.cookies.get(COOKIE)?.value ?? null,
    hostsPermitidos: HOSTS_PERMITIDOS,
    agora: new Date(),
    segredo,
    navegacaoDeEntrada: ehNavegacaoDeEntrada(request),
  })

  if (decisao.tipo === 'negar') return negar(request, decisao.motivo)

  const headers = new Headers(request.headers)
  // `set`, não `append`: sobrescreve qualquer valor que o cliente tenha mandado.
  // É o que torna o header confiável rio acima — sem isto, um curl com o header
  // definido escolheria a própria clínica.
  headers.set(HEADER_COMPANY_ID, decisao.companyId)

  const producao = process.env.NODE_ENV === 'production'
  const cookie = {
    name: COOKIE,
    value: decisao.novoToken ?? '',
    httpOnly: true,
    // `none` porque a página roda em iframe de outro domínio — com `lax` o
    // cookie não acompanharia a navegação dentro do iframe. Mas o browser
    // REJEITA `none` sem `secure`, e em dev o host é http://, então lá cai para
    // `lax` (onde não há iframe de todo modo).
    secure: producao,
    sameSite: (producao ? 'none' : 'lax') as 'none' | 'lax',
    path: '/',
    // Sem `maxAge`: cookie de sessão. O token emitido a partir do host já
    // expira sozinho em 12h.
  }

  // Tira o `?t=` da URL por redirect. Sem isso o token fica no histórico do
  // browser, no Referer das requisições que saem da página e em qualquer log de
  // query string.
  if (decisao.limparTokenDaUrl && !ehApi(request)) {
    const limpa = request.nextUrl.clone()
    limpa.searchParams.delete('t')
    // A clínica (sem segredo) fica na URL: a navegação de entrada seguinte e o
    // F5 exigem escopo explícito — ver `navegacaoDeEntrada` em decisao.ts.
    limpa.searchParams.set('clinica', decisao.companyId)
    const redirect = NextResponse.redirect(limpa)
    redirect.cookies.set(cookie)
    return redirect
  }

  const res = NextResponse.next({ request: { headers } })
  if (decisao.novoToken) res.cookies.set(cookie)
  return res
}
