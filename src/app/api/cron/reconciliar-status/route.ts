import { NextResponse, type NextRequest } from 'next/server'
import { listarTodasAsClinicas } from '@/shared/clinica/repositorio'
import { mensageriaDe } from '@/providers/mensageria'
import {
  reconciliarStatus,
  type RelatorioDeReconciliacao,
} from '@/features/reconciliar-status/reconciliacao'
import { atualizarStatus, buscarPendentes } from '@/features/reconciliar-status/dados'

// GET /api/cron/reconciliar-status
//
// Traz de volta o status real das mensagens já agendadas. Roda para TODAS as
// clínicas — ao contrário do sync de cache, que só toca as de um provedor.
//
// Fica fora do gate de acesso (ver o matcher em `proxy.ts`): tem autenticação
// própria e não roda no escopo de uma clínica.
export const maxDuration = 300

export async function GET(request: NextRequest) {
  const segredo = process.env.CRON_SECRET
  if (!segredo) {
    // Configuração ausente NÃO é acesso negado — confundir as duas já custou
    // nove dias de job parado sem ninguém notar.
    console.error(
      '[cron/reconciliar-status] CRON_SECRET ausente — a rota rejeita TODA chamada, ' +
        'inclusive a do próprio Cron. Cadastrar no .env do servidor (ver docs/deploy-vps.md).'
    )
    return NextResponse.json({ error: 'Cron não configurado' }, { status: 503 })
  }

  if (request.headers.get('authorization') !== `Bearer ${segredo}`) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  let clinicas
  try {
    clinicas = await listarTodasAsClinicas()
  } catch (err) {
    console.error('[cron/reconciliar-status] falha ao listar clínicas:', err)
    return NextResponse.json({ error: 'Falha ao listar clínicas' }, { status: 500 })
  }

  const agora = new Date()

  // Em paralelo: cada clínica fala com a própria conta na plataforma, e a
  // maioria não terá pendente nenhum — nesse caso nem chega a fazer requisição.
  const relatorios = await Promise.all(
    clinicas.map(async (clinica): Promise<RelatorioDeReconciliacao> => {
      const mensageria = mensageriaDe(clinica)
      return reconciliarStatus(clinica.companyId, agora, {
        buscarPendentes: () => buscarPendentes(clinica, agora),
        listarNaPlataforma: (janela) => mensageria.listarAgendadas(janela),
        atualizarStatus: (envioId, status) => atualizarStatus(clinica, envioId, status),
      })
    })
  )

  // O corpo é descartado pelo Cron: o log é o único leitor.
  for (const r of relatorios) {
    if (r.erro) console.error(`[cron/reconciliar-status] ${r.companyId}: ${r.erro}`)
    if (r.naoEncontrados > 0) {
      console.warn(
        `[cron/reconciliar-status] ${r.companyId}: ${r.naoEncontrados} de ${r.pendentes} ` +
          'não foram encontrados na plataforma — pode ser mensagem apagada por lá, ' +
          'mas se persistir revise a janela de consulta ou o casamento de ids.'
      )
    }
  }

  const comErro = relatorios.filter((r) => r.erro).length
  const totalmenteQuebrado = clinicas.length > 0 && comErro === clinicas.length

  return NextResponse.json(
    {
      clinicas: clinicas.length,
      atualizados: relatorios.reduce((soma, r) => soma + r.atualizados, 0),
      comErro,
      relatorios,
    },
    { status: totalmenteQuebrado ? 500 : 200 }
  )
}
