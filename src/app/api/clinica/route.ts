import { NextResponse, type NextRequest } from 'next/server'
import { exigirCompanyId } from '@/acesso/escopo'
import { buscarClinicaPublica } from '@/shared/clinica/repositorio'
import { responderErro } from '@/shared/http'

// GET /api/clinica — a clínica DESTE acesso. Singular de propósito.
//
// O app anterior tinha `/api/clinicas`, que devolvia todas as clínicas
// cadastradas, sem autenticação. Era o mapa que tornava o resto explorável:
// pegava-se a lista de ids ali e passava qualquer um para as outras rotas.
// Não existe caso de uso legítimo para enumerar clínicas aqui — cada acesso é
// escopado a uma, e o nome plural convidava ao contrário.
//
// Só dados públicos: nenhuma credencial atravessa para o browser.
export async function GET(request: NextRequest) {
  try {
    return NextResponse.json(await buscarClinicaPublica(exigirCompanyId(request)))
  } catch (err) {
    return responderErro('api/clinica', err)
  }
}
