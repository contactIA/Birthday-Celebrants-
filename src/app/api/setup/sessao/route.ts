import { NextResponse, type NextRequest } from 'next/server'
import { assinarSessao, cookieDaSessaoDeSetup, segredosDoSetup, senhaConfere, TTL_SESSAO_SETUP } from '@/acesso/setup'
import {
  estaBloqueado,
  limparVencidos,
  minutosParaLiberar,
  registrarFalha,
  type Registro,
} from '@/features/entrar-no-setup/tentativas'

// POST /api/setup/sessao — entra na área de setup com a senha da equipe.
// DELETE /api/setup/sessao — sai.
//
// O POST é rota pública da API de setup, como o GET de /api/setup/entrar, o link
// do setup do CRM (ver decisao-setup.ts). Com SETUP_SENHA_DESLIGADA, o POST
// recusa: só o link abre a sessão.

const falhasPorIp = new Map<string, Registro>()

/**
 * O IP de quem tenta. Vem do `X-Real-IP` que o nginx da VPS grava com o
 * endereço da conexão — confiável porque o container não publica porta: toda
 * requisição passa pelo nginx, que sobrescreve o header.
 */
function ipDe(request: NextRequest): string {
  return (
    request.headers.get('x-real-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'desconhecido'
  )
}

function cookieDaSessao(valor: string, maxAge: number) {
  return cookieDaSessaoDeSetup(valor, maxAge, process.env.NODE_ENV === 'production')
}

export async function POST(request: NextRequest) {
  const segredos = segredosDoSetup()
  if (!segredos) {
    return NextResponse.json({ error: 'Setup não configurado neste servidor' }, { status: 503 })
  }
  // Antes do limite de tentativas e da leitura do corpo: com a senha desligada
  // não há o que tentar. A frase é a que a tela de entrar mostra.
  if (segredos.senhaDesligada) {
    return NextResponse.json(
      { error: 'A entrada por senha está desligada. Abra este setup pelo setup do CRM.', codigo: 'SENHA_DESLIGADA' },
      { status: 403 }
    )
  }
  const { hashDaSenha } = segredos
  if (!hashDaSenha) {
    return NextResponse.json(
      { error: 'Este servidor não tem senha de setup. Abra este setup pelo setup do CRM.', codigo: 'SEM_SENHA' },
      { status: 503 }
    )
  }

  const agora = Date.now()
  const ip = ipDe(request)
  limparVencidos(falhasPorIp, agora)

  const registro = falhasPorIp.get(ip)
  if (estaBloqueado(registro, agora)) {
    return NextResponse.json(
      { error: `Muitas tentativas. Tente de novo em ${minutosParaLiberar(registro!, agora)} min.` },
      { status: 429 }
    )
  }

  const corpo = (await request.json().catch(() => null)) as { senha?: unknown } | null
  const senha = typeof corpo?.senha === 'string' ? corpo.senha : ''

  // Senha vazia também conta como tentativa: não há motivo para ela ser grátis.
  if (!senha || !senhaConfere(senha, hashDaSenha)) {
    falhasPorIp.set(ip, registrarFalha(registro, agora))
    console.warn(`[setup/sessao] senha incorreta de ${ip}`)
    return NextResponse.json({ error: 'Senha incorreta' }, { status: 401 })
  }

  falhasPorIp.delete(ip)
  console.info(`[setup/sessao] sessão aberta de ${ip}`)

  const res = NextResponse.json({ ok: true })
  res.cookies.set(
    cookieDaSessao(assinarSessao(new Date(agora), segredos.linkSecret, segredos.ancora), TTL_SESSAO_SETUP)
  )
  return res
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(cookieDaSessao('', 0))
  return res
}
