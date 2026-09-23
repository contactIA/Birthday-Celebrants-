import { NextResponse, type NextRequest } from 'next/server'
import { exigirCompanyId } from '@/acesso/escopo'
import { buscarClinica } from '@/shared/clinica/repositorio'
import { responderErro } from '@/shared/http'
import { mensageriaDe } from '@/providers/mensageria'
import { cancelarEnvio } from '@/features/cancelar-envio/cancelamento'
import { buscarEnvio, marcarComoCancelado } from '@/features/cancelar-envio/dados'

// POST /api/agendamentos/{id}/cancelar
//
// `{id}` é o id da NOSSA linha de envio, não o da mensagem na plataforma — o
// segundo pode nem existir, e quem opera a tela só conhece o primeiro.
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const clinica = await buscarClinica(exigirCompanyId(request))
    const mensageria = mensageriaDe(clinica)

    const resultado = await cancelarEnvio(id, {
      buscarEnvio: (envioId) => buscarEnvio(clinica, envioId),
      cancelarNaPlataforma: (mensagemId) => mensageria.cancelar(mensagemId),
      marcarComoCancelado: (envioId) => marcarComoCancelado(clinica, envioId),
    })

    return NextResponse.json(resultado)
  } catch (err) {
    return responderErro('api/agendamentos/cancelar', err)
  }
}
