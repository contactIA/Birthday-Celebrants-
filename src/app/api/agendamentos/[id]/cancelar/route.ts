import { NextResponse, type NextRequest } from 'next/server'
import { exigirCompanyId, unidadeDaRequisicao } from '@/acesso/escopo'
import { buscarClinica } from '@/shared/clinica/repositorio'
import { responderErro } from '@/shared/http'
import { cancelarEnvioDaUnidade } from '@/features/cancelar-envio/servico'

// POST /api/agendamentos/{id}/cancelar
//
// `{id}` é o id da NOSSA linha de envio, não o da mensagem na plataforma — o
// segundo pode nem existir, e quem opera a tela só conhece o primeiro.
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const clinica = await buscarClinica(exigirCompanyId(request), unidadeDaRequisicao(request))
    return NextResponse.json(await cancelarEnvioDaUnidade(clinica, id))
  } catch (err) {
    return responderErro('api/agendamentos/cancelar', err)
  }
}
