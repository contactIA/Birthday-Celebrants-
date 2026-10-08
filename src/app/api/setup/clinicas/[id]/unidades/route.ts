import { NextResponse, type NextRequest } from 'next/server'
import { exigirSessaoDeSetup } from '@/acesso/escopo'
import { buscarClinicaNoSetup, criarUnidade, exigirCadastroLocal } from '@/shared/clinica/repositorio'
import { responderErro } from '@/shared/http'
import { lerEntradaDeUnidade, montarUnidade } from '@/features/configurar-clinica/regras'

// GET  /api/setup/clinicas/:id/unidades — as unidades da clínica, sem segredos.
// POST /api/setup/clinicas/:id/unidades — cadastra uma unidade ADICIONAL.
//
// A principal não é cadastrada aqui: nasce com a clínica (trigger no banco) e
// suas credenciais são as da clínica, editadas no formulário dela. Com o
// cadastro comum ligado, o POST recusa: as unidades se cadastram no CRM.

export async function GET(request: NextRequest, ctx: RouteContext<'/api/setup/clinicas/[id]/unidades'>) {
  try {
    exigirSessaoDeSetup(request)
    const { id } = await ctx.params
    return NextResponse.json({ unidades: (await buscarClinicaNoSetup(id)).unidades })
  } catch (err) {
    return responderErro('api/setup/clinicas/:id/unidades', err)
  }
}

export async function POST(request: NextRequest, ctx: RouteContext<'/api/setup/clinicas/[id]/unidades'>) {
  try {
    exigirSessaoDeSetup(request)
    exigirCadastroLocal()
    const { id } = await ctx.params
    const dados = montarUnidade(lerEntradaDeUnidade(await request.json().catch(() => null)), null)
    const clinica = await criarUnidade(id, dados)
    console.info(`[setup] unidade cadastrada na clínica ${id} (${clinica.companyId}): ${dados.nome}`)
    return NextResponse.json(clinica, { status: 201 })
  } catch (err) {
    return responderErro('api/setup/clinicas/:id/unidades', err)
  }
}
