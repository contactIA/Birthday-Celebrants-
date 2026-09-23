import { NextResponse, type NextRequest } from 'next/server'
import { exigirSessaoDeSetup } from '@/acesso/escopo'
import { atualizarClinica, buscarClinicaNoSetup, buscarClinicaPorId } from '@/shared/clinica/repositorio'
import { responderErro } from '@/shared/http'
import { camposAlterados, lerEntrada, montarClinica } from '@/features/configurar-clinica/regras'

// GET   /api/setup/clinicas/:id — uma clínica, sem o valor dos segredos.
// PATCH /api/setup/clinicas/:id — edita. Segredo em branco = manter.

export async function GET(request: NextRequest, ctx: RouteContext<'/api/setup/clinicas/[id]'>) {
  try {
    exigirSessaoDeSetup(request)
    const { id } = await ctx.params
    return NextResponse.json(await buscarClinicaNoSetup(id))
  } catch (err) {
    return responderErro('api/setup/clinicas/:id', err)
  }
}

export async function PATCH(request: NextRequest, ctx: RouteContext<'/api/setup/clinicas/[id]'>) {
  try {
    exigirSessaoDeSetup(request)
    const { id } = await ctx.params
    const entrada = lerEntrada(await request.json().catch(() => null))

    const antes = await buscarClinicaPorId(id)
    const depois = montarClinica(entrada, antes)
    const alterados = camposAlterados(antes, depois)

    // Nada mudou: não escreve. Evita um `update` que só mexeria em nada.
    if (alterados.length === 0) return NextResponse.json(await buscarClinicaNoSetup(id))

    const salva = await atualizarClinica(id, depois)
    // Nomes dos campos, nunca valores — ver camposAlterados.
    console.info(`[setup] clínica ${id} (${salva.companyId}) alterada: ${alterados.join(', ')}`)
    return NextResponse.json(salva)
  } catch (err) {
    return responderErro('api/setup/clinicas/:id', err)
  }
}
