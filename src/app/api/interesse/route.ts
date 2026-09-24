import { NextResponse, type NextRequest } from 'next/server'
import { exigirCompanyId } from '@/acesso/escopo'
import { responderErro } from '@/shared/http'
import { lerPedido } from '@/features/entrar-na-lista/regras'
import { buscarPedido, salvarPedido } from '@/features/entrar-na-lista/dados'

// GET  /api/interesse — o pedido de vaga desta conta, se já existir.
// POST /api/interesse — grava ou atualiza o pedido.
//
// É a rota da página de beta, que aparece para quem abre a aba sem ter a
// clínica cadastrada. A conta vem do escopo que o proxy verificou — a mesma
// regra das outras rotas do painel: nada do corpo decide qual clínica é.

export async function GET(request: NextRequest) {
  try {
    const pedido = await buscarPedido(exigirCompanyId(request))
    return NextResponse.json({ pedido })
  } catch (err) {
    return responderErro('api/interesse', err)
  }
}

export async function POST(request: NextRequest) {
  try {
    const companyId = exigirCompanyId(request)
    const pedido = lerPedido(await request.json().catch(() => null))
    const salvo = await salvarPedido(companyId, pedido, new Date())
    console.info(`[beta] pedido de vaga de ${companyId} (${salvo.sistemaProntuario})`)
    return NextResponse.json({ pedido: salvo })
  } catch (err) {
    return responderErro('api/interesse', err)
  }
}
