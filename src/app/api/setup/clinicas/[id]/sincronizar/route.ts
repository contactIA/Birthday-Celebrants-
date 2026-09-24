import { NextResponse, type NextRequest } from 'next/server'
import { exigirSessaoDeSetup } from '@/acesso/escopo'
import { buscarClinicaPorId } from '@/shared/clinica/repositorio'
import { responderErro } from '@/shared/http'
import { resumoDoCache } from '@/features/sincronizar-clinicorp/dados'
import {
  estaSincronizando,
  executarSincronizacao,
  SincronizacaoEmAndamentoError,
  ultimaExecucao,
} from '@/features/sincronizar-clinicorp/executar'

// POST /api/setup/clinicas/:id/sincronizar — dispara a sincronização da
//   clínica com a Clinicorp e responde na hora (202).
// GET  /api/setup/clinicas/:id/sincronizar — andamento e estado do cache.
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

async function estado(clinicaId: string) {
  const clinica = await buscarClinicaPorId(clinicaId)
  return {
    emAndamento: estaSincronizando(clinica.id),
    ultimaExecucao: ultimaExecucao(clinica.id),
    cache: await resumoDoCache(clinica),
  }
}

export async function GET(request: NextRequest, ctx: RouteContext<'/api/setup/clinicas/[id]/sincronizar'>) {
  try {
    exigirSessaoDeSetup(request)
    const { id } = await ctx.params
    return NextResponse.json(await estado(id))
  } catch (err) {
    return responderErro('api/setup/clinicas/:id/sincronizar', err)
  }
}

export async function POST(request: NextRequest, ctx: RouteContext<'/api/setup/clinicas/[id]/sincronizar'>) {
  try {
    exigirSessaoDeSetup(request)
    const { id } = await ctx.params
    const clinica = await buscarClinicaPorId(id)
    if (clinica.sistemaProntuario !== 'clinicorp') throw new SemSincronizacaoError()
    if (estaSincronizando(clinica.id)) throw new SincronizacaoEmAndamentoError()

    console.info(`[setup] sincronização manual iniciada: ${clinica.companyId}`)
    // Sem `await`, de propósito (ver o topo). A trava é tomada dentro da
    // chamada antes do primeiro `await`, então o estado abaixo já a enxerga.
    void executarSincronizacao(clinica).then((r) => {
      console.info(
        `[setup] sincronização manual de ${clinica.companyId}: ${r.pacientes} pacientes, ${r.erros.length} erros`
      )
      for (const erro of r.erros.slice(0, 20)) console.error(`[setup/sincronizar] ${clinica.companyId}: ${erro}`)
    })

    return NextResponse.json(await estado(id), { status: 202 })
  } catch (err) {
    return responderErro('api/setup/clinicas/:id/sincronizar', err)
  }
}
