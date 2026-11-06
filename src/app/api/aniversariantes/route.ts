import { NextResponse, type NextRequest } from 'next/server'
import { exigirCompanyId, unidadeDaRequisicao } from '@/acesso/escopo'
import { buscarClinica } from '@/shared/clinica/repositorio'
import { lerMes, responderErro } from '@/shared/http'
import { aniversariantesDoMes } from '@/features/listar-aniversariantes/servico'

// GET /api/aniversariantes?mes=MM
//
// A rota é fina de propósito: ela traduz HTTP para a fatia e de volta. A regra
// está em `features/listar-aniversariantes/consulta.ts` (montada em
// `servico.ts`, o mesmo que a API de integração chama), o switch entre
// prontuários em `providers/prontuario`.
//
// Esta é a rota mais sensível do app — devolve nome, telefone e data de
// nascimento de paciente. A clínica vem do header que o proxy gravou depois de
// verificar o token; `?clinica=` chega e é ignorado.
//
// Sem `?mes=`, o mês corrente NO FUSO DA CLÍNICA — não o do servidor. E `hoje`
// no fuso DA CLÍNICA vai junto para a tela poder dizer "Hoje" e "Amanhã" e
// calcular idade sem refazer conta de fuso no navegador — que é de onde vinham
// os erros de um dia. O browser só compara números.
export async function GET(request: NextRequest) {
  try {
    const clinica = await buscarClinica(exigirCompanyId(request), unidadeDaRequisicao(request))
    const mes = lerMes(request.nextUrl.searchParams.get('mes'))
    return NextResponse.json(await aniversariantesDoMes(clinica, mes, new Date()))
  } catch (err) {
    return responderErro('api/aniversariantes', err)
  }
}
