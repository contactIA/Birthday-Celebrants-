import { NextResponse, type NextRequest } from 'next/server'
import { exigirSessaoDeSetup } from '@/acesso/escopo'
import { buscarClinicaPorId, rotuloDaClinica } from '@/shared/clinica/repositorio'
import { responderErro } from '@/shared/http'
import { resumoDoCache } from '@/features/sincronizar-clinicorp/dados'
import {
  estaSincronizando,
  executarSincronizacao,
  SincronizacaoEmAndamentoError,
  ultimaExecucao,
} from '@/features/sincronizar-clinicorp/executar'

// POST /api/setup/clinicas/:id/sincronizar — dispara a sincronização de uma
//   UNIDADE da clínica com a Clinicorp e responde na hora (202).
// GET  /api/setup/clinicas/:id/sincronizar — andamento e estado do cache.
//
// Ambos aceitam `?unidade=<id>`; sem ele, a unidade principal. Cada unidade
// tem credencial e cache próprios, e uma unidade de OUTRA clínica é 404.
//
// POR QUE DISPARAR E ACOMPANHAR, e não esperar a resposta: a sincronização faz
// ~61 chamadas à Clinicorp, e com o limite de taxa deles (429, com espera e
// retentativa) pode passar de minuto. Segurar a requisição esbarraria no
// timeout do nginx e deixaria a tela congelada. O container é um processo Node
// que continua vivo depois da resposta, então a execução segue; a tela
// consulta o GET.

class SemSincronizacaoError extends Error {
  readonly status = 400
  readonly codigo = 'SEM_SINCRONIZACAO' as const
  constructor() {
    super('Só clínicas Clinicorp usam sincronização. A e-Clínica é consultada ao vivo')
    this.name = 'SemSincronizacaoError'
  }
}

function unidadeDaQuery(request: NextRequest): string | null {
  return request.nextUrl.searchParams.get('unidade') || null
}

async function estado(clinicaId: string, unidadeId: string | null) {
  const clinica = await buscarClinicaPorId(clinicaId, unidadeId)
  return {
    emAndamento: estaSincronizando(clinica.unidade.id),
    ultimaExecucao: ultimaExecucao(clinica.unidade.id),
    cache: await resumoDoCache(clinica),
  }
}

export async function GET(request: NextRequest, ctx: RouteContext<'/api/setup/clinicas/[id]/sincronizar'>) {
  try {
    exigirSessaoDeSetup(request)
    const { id } = await ctx.params
    return NextResponse.json(await estado(id, unidadeDaQuery(request)))
  } catch (err) {
    return responderErro('api/setup/clinicas/:id/sincronizar', err)
  }
}

export async function POST(request: NextRequest, ctx: RouteContext<'/api/setup/clinicas/[id]/sincronizar'>) {
  try {
    exigirSessaoDeSetup(request)
    const { id } = await ctx.params
    const unidadeId = unidadeDaQuery(request)
    const clinica = await buscarClinicaPorId(id, unidadeId)
    if (clinica.sistemaProntuario !== 'clinicorp') throw new SemSincronizacaoError()
    if (estaSincronizando(clinica.unidade.id)) throw new SincronizacaoEmAndamentoError()

    const rotulo = rotuloDaClinica(clinica)
    console.info(`[setup] sincronização manual iniciada: ${rotulo}`)
    // Sem `await`, de propósito (ver o topo). A trava é tomada dentro da
    // chamada antes do primeiro `await`, então o estado abaixo já a enxerga.
    void executarSincronizacao(clinica).then((r) => {
      console.info(
        `[setup] sincronização manual de ${rotulo}: ${r.pacientes} pacientes, ${r.erros.length} erros`
      )
      for (const erro of r.erros.slice(0, 20)) console.error(`[setup/sincronizar] ${rotulo}: ${erro}`)
    })

    return NextResponse.json(await estado(id, unidadeId), { status: 202 })
  } catch (err) {
    return responderErro('api/setup/clinicas/:id/sincronizar', err)
  }
}
