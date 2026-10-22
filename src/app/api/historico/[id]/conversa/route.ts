import { NextResponse, type NextRequest } from 'next/server'
import { exigirCompanyId, unidadeDaRequisicao } from '@/acesso/escopo'
import { buscarClinica } from '@/shared/clinica/repositorio'
import { responderErro } from '@/shared/http'
import { mensageriaDe } from '@/providers/mensageria'
import { buscarContatoDoEnvio } from '@/features/historico/dados'
import { conversaDoEnvio } from '@/features/historico/ficha'

// GET /api/historico/{id}/conversa — o id da conversa do "Abrir conversa".
//
// Devolve só o id: o endereço da conversa é montado no navegador, com a origem
// da plataforma que abriu o app (white label: cada cliente pode ter a sua).
// Chama a plataforma apenas quando o envio não tem a conversa gravada.
export async function GET(request: NextRequest, ctx: RouteContext<'/api/historico/[id]/conversa'>) {
  try {
    const { id } = await ctx.params
    const clinica = await buscarClinica(exigirCompanyId(request), unidadeDaRequisicao(request))
    const conversaId = await conversaDoEnvio({
      buscarContato: () => buscarContatoDoEnvio(clinica, id),
      conversaMaisRecente: (telefone) => mensageriaDe(clinica).conversaMaisRecente(telefone),
    })
    return NextResponse.json({ conversaId })
  } catch (err) {
    return responderErro('api/historico/conversa', err)
  }
}
