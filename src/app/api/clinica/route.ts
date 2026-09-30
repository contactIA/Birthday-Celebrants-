import { NextResponse, type NextRequest } from 'next/server'
import { COOKIE_UNIDADE, exigirCompanyId, unidadeDaRequisicao } from '@/acesso/escopo'
import { buscarClinicaPublica } from '@/shared/clinica/repositorio'
import { responderErro } from '@/shared/http'

// GET /api/clinica — a clínica DESTA requisição, com as unidades dela.
// Singular de propósito.
//
// O app anterior tinha `/api/clinicas`, que devolvia todas as clínicas
// cadastradas, sem autenticação. Era o mapa que tornava o resto explorável:
// pegava-se a lista de ids ali e passava qualquer um para as outras rotas.
// Não existe caso de uso legítimo para enumerar clínicas aqui — cada acesso é
// escopado a uma, e o nome plural convidava ao contrário. As unidades listadas
// são as da própria clínica, para o seletor.
//
// Só dados públicos: nenhuma credencial atravessa para o browser.
export async function GET(request: NextRequest) {
  try {
    return NextResponse.json(
      await buscarClinicaPublica(exigirCompanyId(request), unidadeDaRequisicao(request))
    )
  } catch (err) {
    return responderErro('api/clinica', err)
  }
}

// POST /api/clinica — escolhe a unidade em vigor. Corpo: { unidadeId }.
//
// Só grava uma preferência em cookie. A unidade é conferida contra as da clínica
// do token AQUI (id de outra clínica é 404) e de novo em toda leitura, porque o
// cookie é do cliente e pode ser editado à mão.
export async function POST(request: NextRequest) {
  try {
    const companyId = exigirCompanyId(request)
    const corpo = (await request.json().catch(() => null)) as { unidadeId?: unknown } | null
    const pedida = typeof corpo?.unidadeId === 'string' ? corpo.unidadeId : ''

    const clinica = await buscarClinicaPublica(companyId, pedida)
    if (clinica.unidadeAtualId !== pedida) {
      return NextResponse.json({ error: 'Unidade não encontrada', codigo: 'UNIDADE_NAO_ENCONTRADA' }, { status: 404 })
    }

    const producao = process.env.NODE_ENV === 'production'
    const res = NextResponse.json(clinica)
    res.cookies.set({
      name: COOKIE_UNIDADE,
      value: pedida,
      httpOnly: true,
      // Mesmos atributos do cookie de escopo (proxy.ts): a página roda em iframe
      // de outro domínio, então `none` + `secure` em produção.
      secure: producao,
      sameSite: producao ? 'none' : 'lax',
      path: '/',
    })
    return res
  } catch (err) {
    return responderErro('api/clinica', err)
  }
}
