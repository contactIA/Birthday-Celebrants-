import { NextResponse, type NextRequest } from 'next/server'
import { exigirSessaoDeSetup } from '@/acesso/escopo'
import { buscarClinicaPorId } from '@/shared/clinica/repositorio'
import { responderErro } from '@/shared/http'
import { mensageriaDe } from '@/providers/mensageria'

// GET /api/setup/clinicas/:id/campos-de-data: os campos personalizados de data
// do contato, na conta de mensagens desta clínica. Alimenta a escolha de qual
// deles recebe a data de nascimento do paciente ao agendar.
//
// Usa o token SALVO, não o do formulário: o select só aparece para clínica já
// cadastrada, e o token nunca volta para a tela.

export async function GET(request: NextRequest, ctx: RouteContext<'/api/setup/clinicas/[id]/campos-de-data'>) {
  try {
    exigirSessaoDeSetup(request)
    const { id } = await ctx.params
    const campos = await mensageriaDe(await buscarClinicaPorId(id)).listarCamposDeData()
    return NextResponse.json({ campos })
  } catch (err) {
    return responderErro('api/setup/clinicas/:id/campos-de-data', err)
  }
}
