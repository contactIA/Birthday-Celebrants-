import { NextResponse, type NextRequest } from 'next/server'
import { exigirCompanyId } from '@/acesso/escopo'
import { companyIdsCadastrados } from '@/shared/clinica/repositorio'
import { responderErro } from '@/shared/http'
import { lerPedido } from '@/features/entrar-na-lista/regras'
import { buscarPedido, listarOrdemDaFila, salvarPedido, type Interessado } from '@/features/entrar-na-lista/dados'
import { etapaDoPedido, posicaoNaFila, situacaoDaTurma } from '@/features/entrar-na-lista/fila'

// GET  /api/interesse: o pedido de vaga desta conta, a fila e a turma.
// POST /api/interesse: grava ou atualiza o pedido; devolve o mesmo formato.
//
// É a rota da página de beta, que aparece para quem abre a aba sem ter a
// clínica cadastrada. A conta vem do escopo que o proxy verificou — a mesma
// regra das outras rotas do painel: nada do corpo decide qual clínica é.
//
// A resposta NUNCA carrega dado de outra clínica: só a posição desta conta e
// um total. Nome, telefone e modelo dos outros pedidos não saem daqui.

async function comFila(companyId: string, pedido: Interessado | null) {
  const [ordem, cadastradas] = await Promise.all([listarOrdemDaFila(), companyIdsCadastrados()])
  const { posicao, naFrente } = posicaoNaFila(ordem, cadastradas, companyId)
  return {
    pedido,
    fila: pedido
      ? { etapa: etapaDoPedido(pedido.status, cadastradas.has(companyId.toLowerCase())), posicao, naFrente }
      : null,
    // Quem ainda não pediu vê em que lugar entraria: os que esperam + 1.
    posicaoAoEntrar: pedido ? null : naFrente + 1,
    turma: situacaoDaTurma(ordem.length),
  }
}

export async function GET(request: NextRequest) {
  try {
    const companyId = exigirCompanyId(request)
    return NextResponse.json(await comFila(companyId, await buscarPedido(companyId)))
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
    return NextResponse.json(await comFila(companyId, salvo))
  } catch (err) {
    return responderErro('api/interesse', err)
  }
}
