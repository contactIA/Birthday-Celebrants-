import { NextResponse, type NextRequest } from 'next/server'
import { sincronizarClinica, type RelatorioDaClinica } from '@/features/sincronizar-clinicorp/sincronizacao'
import { clienteClinicorp } from '@/features/sincronizar-clinicorp/api'
import {
  clinicasClinicorp,
  gravarLote,
  removerObsoletos,
} from '@/features/sincronizar-clinicorp/dados'

// GET /api/cron/sincronizar-clinicorp — 1x/dia pelo crontab da VPS
// (ver docs/deploy-vps.md).
//
// Fica FORA do gate de acesso (ver o matcher em `proxy.ts`): tem autenticação
// própria e roda para todas as clínicas, não no escopo de uma.

// O app anterior usava 60s e sincronizava as clínicas EM SÉRIE. Com duas
// clínicas Clinicorp em produção isso já estava no limite. Aqui elas rodam em
// paralelo e o teto é o máximo da plataforma.
export const maxDuration = 300

function naoConfigurado() {
  // Segredo AUSENTE e segredo ERRADO eram a mesma resposta (401) no app
  // anterior, e isso custou 9 dias de sync parado sem ninguém notar: a variável
  // nunca foi cadastrada, a rota rejeitava a própria plataforma, e o log dizia
  // "não autorizado" — indistinguível de alguém batendo na URL.
  console.error(
    '[cron/sincronizar-clinicorp] CRON_SECRET ausente — a rota rejeita TODA chamada, ' +
      'inclusive a do próprio Cron. Cadastrar nas variáveis do serviço (console do TurboCloud).'
  )
  return NextResponse.json({ error: 'Cron não configurado' }, { status: 503 })
}

export async function GET(request: NextRequest) {
  const segredo = process.env.CRON_SECRET
  if (!segredo) return naoConfigurado()

  if (request.headers.get('authorization') !== `Bearer ${segredo}`) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  let clinicas
  try {
    clinicas = await clinicasClinicorp()
  } catch (err) {
    console.error('[cron/sincronizar-clinicorp] falha ao listar clínicas:', err)
    return NextResponse.json({ error: 'Falha ao listar clínicas' }, { status: 500 })
  }

  const agora = new Date()
  // Um carimbo por execução, compartilhado por todas as clínicas: é o que
  // separa "renovado agora" de "sobrou da execução anterior".
  const carimbo = agora.toISOString()

  // Em PARALELO. Em série, cada clínica somava ~61 chamadas de aniversário mais
  // uma por paciente encontrado, e a segunda já arriscava o corte por tempo.
  const relatorios = await Promise.all(
    clinicas.map(async (clinica): Promise<RelatorioDaClinica> => {
      try {
        const api = clienteClinicorp(clinica)
        return await sincronizarClinica(clinica, agora, {
          buscarAniversariantesDoDia: (data) => api.aniversariantesDoDia(data),
          buscarStatus: (id) => api.statusDoPaciente(id),
          gravarLote: (linhas) => gravarLote(clinica, linhas, carimbo),
          removerObsoletos: () => removerObsoletos(clinica, carimbo),
        })
      } catch (err) {
        // Uma clínica mal configurada não derruba o cron das outras.
        return {
          companyId: clinica.companyId,
          diasConsultados: 0,
          pacientes: 0,
          erros: [(err as Error).message],
          obsoletosRemovidos: false,
        }
      }
    })
  )

  // O corpo da resposta é descartado pelo Cron — o log é o único leitor que
  // existe. O app anterior acumulava os erros e só os devolvia no JSON,
  // respondendo `ok: true` mesmo quando TUDO falhou.
  for (const relatorio of relatorios) {
    for (const erro of relatorio.erros) {
      console.error(`[cron/sincronizar-clinicorp] ${relatorio.companyId}: ${erro}`)
    }
    if (!relatorio.obsoletosRemovidos && relatorio.diasConsultados > 0) {
      console.warn(
        `[cron/sincronizar-clinicorp] ${relatorio.companyId}: limpeza adiada — ` +
          'algum dia falhou e os pacientes dele não foram renovados.'
      )
    }
  }

  const comFalha = relatorios.filter((r) => r.erros.length > 0).length
  const totalmenteQuebrado = clinicas.length > 0 && comFalha === clinicas.length

  // Status honesto: uma execução em que nada sincronizou não é sucesso. É o que
  // permite o alerta da plataforma disparar em vez de esperar alguém reparar.
  return NextResponse.json(
    { clinicas: clinicas.length, comFalha, relatorios },
    { status: totalmenteQuebrado ? 500 : 200 }
  )
}
