import { NextResponse, type NextRequest } from 'next/server'
import { exigirSessaoDeSetup } from '@/acesso/escopo'
import { listarClinicasNoSetup } from '@/shared/clinica/repositorio'
import { responderErro } from '@/shared/http'
import { listarPedidos } from '@/features/entrar-na-lista/dados'

// GET /api/setup/interessados — pedidos de vaga no beta, mais recentes primeiro.
//
// `cadastrada` diz se a conta já virou clínica: quem já foi cadastrado some da
// lista de pendentes na tela, mas o pedido fica como registro.

export async function GET(request: NextRequest) {
  try {
    exigirSessaoDeSetup(request)
    const [pedidos, clinicas] = await Promise.all([listarPedidos(), listarClinicasNoSetup()])
    const cadastradas = new Set(clinicas.map((c) => c.companyId.toLowerCase()))
    return NextResponse.json({
      interessados: pedidos.map((p) => ({ ...p, cadastrada: cadastradas.has(p.companyId.toLowerCase()) })),
    })
  } catch (err) {
    return responderErro('api/setup/interessados', err)
  }
}
