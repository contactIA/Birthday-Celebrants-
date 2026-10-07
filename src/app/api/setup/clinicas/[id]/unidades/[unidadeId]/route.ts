import { NextResponse, type NextRequest } from 'next/server'
import { exigirSessaoDeSetup } from '@/acesso/escopo'
import {
  atualizarUnidade,
  buscarClinicaPorId,
  exigirCadastroLocal,
  removerUnidade,
} from '@/shared/clinica/repositorio'
import { responderErro } from '@/shared/http'
import { lerEntradaDeUnidade, montarUnidade } from '@/features/configurar-clinica/regras'

// PATCH  /api/setup/clinicas/:id/unidades/:unidadeId — edita. Segredo em branco = manter.
// DELETE /api/setup/clinicas/:id/unidades/:unidadeId — remove uma unidade
//   adicional SEM envios no histórico.
//
// Na unidade principal o PATCH só troca o nome: as credenciais dela são as da
// clínica. Com o cadastro comum ligado, os dois recusam: a unidade é do CRM.

type Ctx = RouteContext<'/api/setup/clinicas/[id]/unidades/[unidadeId]'>

export async function PATCH(request: NextRequest, ctx: Ctx) {
  try {
    exigirSessaoDeSetup(request)
    exigirCadastroLocal()
    const { id, unidadeId } = await ctx.params
    const entrada = lerEntradaDeUnidade(await request.json().catch(() => null))

    const antes = await buscarClinicaPorId(id, unidadeId)
    const dados = montarUnidade(entrada, antes)
    const clinica = await atualizarUnidade(id, unidadeId, dados)
    // Só o nome da unidade e o que mudou de nome de campo; nunca valores.
    console.info(`[setup] unidade ${unidadeId} da clínica ${id} (${clinica.companyId}) alterada`)
    return NextResponse.json(clinica)
  } catch (err) {
    return responderErro('api/setup/clinicas/:id/unidades/:unidadeId', err)
  }
}

export async function DELETE(request: NextRequest, ctx: Ctx) {
  try {
    exigirSessaoDeSetup(request)
    exigirCadastroLocal()
    const { id, unidadeId } = await ctx.params
    const clinica = await removerUnidade(id, unidadeId)
    console.info(`[setup] unidade ${unidadeId} removida da clínica ${id} (${clinica.companyId})`)
    return NextResponse.json(clinica)
  } catch (err) {
    return responderErro('api/setup/clinicas/:id/unidades/:unidadeId', err)
  }
}
