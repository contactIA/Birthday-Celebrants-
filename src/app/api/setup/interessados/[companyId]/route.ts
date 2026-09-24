import { NextResponse, type NextRequest } from 'next/server'
import { exigirSessaoDeSetup } from '@/acesso/escopo'
import { ParametroInvalidoError, responderErro } from '@/shared/http'
import { definirStatus } from '@/features/entrar-na-lista/dados'
import { lerStatus } from '@/features/entrar-na-lista/fila'

// PATCH /api/setup/interessados/:companyId — muda a etapa que a clínica vê na
// fila ("Pedido recebido" ↔ "Em análise"). "Vaga liberada" não se marca aqui:
// é consequência de cadastrar a clínica.

export async function PATCH(request: NextRequest, ctx: RouteContext<'/api/setup/interessados/[companyId]'>) {
  try {
    exigirSessaoDeSetup(request)
    const { companyId } = await ctx.params
    const status = lerStatus(await request.json().catch(() => null))
    if (!status) throw new ParametroInvalidoError('Etapa inválida. Use "recebido" ou "em_analise"')

    await definirStatus(companyId, status)
    console.info(`[setup] pedido de ${companyId} → ${status}`)
    return NextResponse.json({ status })
  } catch (err) {
    return responderErro('api/setup/interessados/:companyId', err)
  }
}
