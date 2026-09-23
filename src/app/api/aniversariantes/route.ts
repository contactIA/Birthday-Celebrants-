import { NextResponse, type NextRequest } from 'next/server'
import { exigirCompanyId } from '@/acesso/escopo'
import { buscarClinica } from '@/shared/clinica/repositorio'
import { hojeNoTimezone } from '@/shared/data/fuso'
import { lerMes, responderErro } from '@/shared/http'
import { provedorDe } from '@/providers/prontuario'
import { listarAniversariantes } from '@/features/listar-aniversariantes/consulta'
import { buscarEnviosDoAno } from '@/features/listar-aniversariantes/dados'

// GET /api/aniversariantes?mes=MM
//
// A rota é fina de propósito: ela traduz HTTP para a fatia e de volta. A regra
// está em `features/listar-aniversariantes/consulta.ts`, o switch entre
// prontuários em `providers/prontuario`.
//
// Esta é a rota mais sensível do app — devolve nome, telefone e data de
// nascimento de paciente. A clínica vem do header que o proxy gravou depois de
// verificar o token; `?clinica=` chega e é ignorado.
export async function GET(request: NextRequest) {
  try {
    const clinica = await buscarClinica(exigirCompanyId(request))
    const agora = new Date()

    // Sem `?mes=`, o mês corrente NO FUSO DA CLÍNICA — não o do servidor.
    const hoje = hojeNoTimezone(clinica.timezone, agora)
    const mes = lerMes(request.nextUrl.searchParams.get('mes')) ?? hoje.mes

    const itens = await listarAniversariantes(
      { mes, timezone: clinica.timezone, agora },
      {
        listarDoProntuario: (m) => provedorDe(clinica).listarDoMes(m),
        buscarEnvios: (ano) => buscarEnviosDoAno(clinica, ano),
      }
    )

    // `hoje` no fuso DA CLÍNICA vai junto para a tela poder dizer "Hoje" e
    // "Amanhã" e calcular idade sem refazer conta de fuso no navegador — que é
    // de onde vinham os erros de um dia. O browser só compara números.
    return NextResponse.json({ itens, mes, hoje })
  } catch (err) {
    return responderErro('api/aniversariantes', err)
  }
}
