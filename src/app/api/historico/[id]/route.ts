import { NextResponse, type NextRequest } from 'next/server'
import { exigirCompanyId, unidadeDaRequisicao } from '@/acesso/escopo'
import { buscarClinica } from '@/shared/clinica/repositorio'
import { responderErro } from '@/shared/http'
import { buscarFicha } from '@/features/historico/dados'
import { EnvioNaoEncontradoError } from '@/features/historico/ficha'

// GET /api/historico/{id} — a ficha do envio, para a gaveta do Histórico.
//
// Só o banco: nenhuma chamada à plataforma nem ao prontuário. O que a ficha
// mostra a mais (texto, linha do tempo, conversa) foi gravado no agendamento e
// pela reconciliação.
export async function GET(request: NextRequest, ctx: RouteContext<'/api/historico/[id]'>) {
  try {
    const { id } = await ctx.params
    const clinica = await buscarClinica(exigirCompanyId(request), unidadeDaRequisicao(request))
    const ficha = await buscarFicha(clinica, id)
    if (!ficha) throw new EnvioNaoEncontradoError()
    return NextResponse.json(ficha)
  } catch (err) {
    return responderErro('api/historico/ficha', err)
  }
}
