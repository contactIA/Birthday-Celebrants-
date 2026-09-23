import { NextResponse, type NextRequest } from 'next/server'
import { exigirCompanyId } from '@/acesso/escopo'
import { buscarClinica } from '@/shared/clinica/repositorio'
import { ParametroInvalidoError, responderErro } from '@/shared/http'
import {
  buscarHistorico,
  POR_PAGINA_PADRAO,
  POR_PAGINA_MAXIMO,
} from '@/features/historico/dados'

// GET /api/historico?pagina=1&porPagina=50
//
// Paginado desde o começo: a tabela cresce um registro por paciente por ano e
// não para. O app anterior devolvia tudo, sem limite.
function lerInteiro(bruto: string | null, padrao: number, minimo: number, maximo: number): number {
  if (bruto === null || bruto === '') return padrao
  const valor = Number(bruto)
  if (!Number.isInteger(valor) || valor < minimo || valor > maximo) {
    throw new ParametroInvalidoError('Parâmetro de paginação inválido')
  }
  return valor
}

export async function GET(request: NextRequest) {
  try {
    const clinica = await buscarClinica(exigirCompanyId(request))
    const params = request.nextUrl.searchParams

    const pagina = lerInteiro(params.get('pagina'), 1, 1, 10_000)
    const porPagina = lerInteiro(
      params.get('porPagina'),
      POR_PAGINA_PADRAO,
      1,
      POR_PAGINA_MAXIMO
    )

    return NextResponse.json(await buscarHistorico(clinica, pagina, porPagina))
  } catch (err) {
    return responderErro('api/historico', err)
  }
}
