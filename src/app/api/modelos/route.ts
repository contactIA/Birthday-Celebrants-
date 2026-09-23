import { NextResponse, type NextRequest } from 'next/server'
import { exigirCompanyId } from '@/acesso/escopo'
import { buscarClinica } from '@/shared/clinica/repositorio'
import { ParametroInvalidoError, responderErro } from '@/shared/http'
import { mensageriaDe } from '@/providers/mensageria'
import { listarModelos, salvarConfiguracao } from '@/features/configurar-modelo/modelos'
import {
  buscarConfiguracoes,
  gravarConfiguracao,
  limparPadrao,
} from '@/features/configurar-modelo/dados'

// GET  /api/modelos — modelos aprovados na plataforma + a configuração salva
// POST /api/modelos — salva a configuração de um modelo
export async function GET(request: NextRequest) {
  try {
    const clinica = await buscarClinica(exigirCompanyId(request))
    const mensageria = mensageriaDe(clinica)

    return NextResponse.json(
      await listarModelos({
        listarDaPlataforma: () => mensageria.listarModelos(),
        buscarConfiguracoes: () => buscarConfiguracoes(clinica),
      })
    )
  } catch (err) {
    return responderErro('api/modelos', err)
  }
}

interface CorpoRecebido {
  modeloId?: unknown
  nome?: unknown
  parametros?: unknown
  diaEnvio?: unknown
  horarioEnvio?: unknown
  ehPadrao?: unknown
  ativo?: unknown
}

function lerCorpo(corpo: CorpoRecebido) {
  if (typeof corpo.modeloId !== 'string' || !corpo.modeloId) {
    throw new ParametroInvalidoError('Modelo não informado')
  }
  if (typeof corpo.nome !== 'string') {
    throw new ParametroInvalidoError('Nome do modelo não informado')
  }
  const parametros = corpo.parametros ?? {}
  if (
    typeof parametros !== 'object' ||
    parametros === null ||
    Array.isArray(parametros) ||
    Object.values(parametros).some((v) => typeof v !== 'string')
  ) {
    throw new ParametroInvalidoError('Mapeamento de variáveis inválido')
  }

  // `diaEnvio` e `horarioEnvio` chegam como string e são validados pela fatia,
  // que é dona da regra — aqui só garantimos o tipo.
  return {
    modeloId: corpo.modeloId,
    nome: corpo.nome,
    parametros: parametros as Record<string, string>,
    diaEnvio: String(corpo.diaEnvio ?? 'aniversario') as never,
    horarioEnvio: String(corpo.horarioEnvio ?? '09:00'),
    ehPadrao: corpo.ehPadrao === true,
    ativo: corpo.ativo !== false,
  }
}

export async function POST(request: NextRequest) {
  try {
    const clinica = await buscarClinica(exigirCompanyId(request))
    const corpo = await request.json().catch(() => {
      throw new ParametroInvalidoError('Corpo da requisição inválido')
    })

    await salvarConfiguracao(lerCorpo(corpo as CorpoRecebido), {
      limparPadrao: () => limparPadrao(clinica),
      gravar: (config) => gravarConfiguracao(clinica, config),
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    return responderErro('api/modelos', err)
  }
}
