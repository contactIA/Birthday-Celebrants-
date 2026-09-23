import type { Clinica } from '@/shared/clinica/repositorio'
import { clienteClinicorp } from '@/providers/prontuario/clinicorp-api'
import { gravarLote, removerObsoletos } from './dados'
import { sincronizarClinica, type RelatorioDaClinica } from './sincronizacao'

// Executa a sincronização de UMA clínica, com as dependências de verdade.
//
// Dois chamadores: o cron diário (todas as clínicas) e o botão "Sincronizar
// agora" da área de setup (uma). Os dois passam por aqui para dividir a TRAVA:
// duas execuções simultâneas da mesma clínica disputariam a cota da Clinicorp
// e, pior, a limpeza por carimbo de uma poderia apagar o que a outra acabou de
// gravar.
//
// Estado em memória, no processo: há um container só. Um restart zera a trava
// e o histórico — o que é correto, porque também mata a execução em curso.

export interface Execucao {
  inicio: string
  /** `null` enquanto roda. */
  fim: string | null
  relatorio: RelatorioDaClinica | null
}

const emAndamento = new Set<string>()
const ultimas = new Map<string, Execucao>()

export class SincronizacaoEmAndamentoError extends Error {
  readonly status = 409
  readonly codigo = 'SINCRONIZACAO_EM_ANDAMENTO' as const
  constructor() {
    super('Já existe uma sincronização desta clínica em andamento')
    this.name = 'SincronizacaoEmAndamentoError'
  }
}

export function estaSincronizando(clinicaId: string): boolean {
  return emAndamento.has(clinicaId)
}

export function ultimaExecucao(clinicaId: string): Execucao | null {
  return ultimas.get(clinicaId) ?? null
}

export type Rodar = (clinica: Clinica, agora: Date, carimbo: string) => Promise<RelatorioDaClinica>

const rodarDeVerdade: Rodar = (clinica, agora, carimbo) => {
  const api = clienteClinicorp(clinica)
  return sincronizarClinica(clinica, agora, {
    buscarAniversariantesDoDia: (data) => api.aniversariantesDoDia(data),
    buscarStatus: (id) => api.statusDoPaciente(id),
    gravarLote: (linhas) => gravarLote(clinica, linhas, carimbo),
    removerObsoletos: () => removerObsoletos(clinica, carimbo),
  })
}

/**
 * Sincroniza a clínica. Nunca lança por falha de integração — ela vira erro no
 * relatório, para uma clínica quebrada não derrubar o cron das outras. Lança
 * SÓ `SincronizacaoEmAndamentoError`.
 *
 * A trava é tomada ANTES do primeiro `await`: quem chama sem esperar (o botão
 * do setup) já está protegido contra um segundo clique no mesmo instante.
 */
export async function executarSincronizacao(
  clinica: Clinica,
  agora: Date = new Date(),
  carimbo: string = agora.toISOString(),
  rodar: Rodar = rodarDeVerdade
): Promise<RelatorioDaClinica> {
  if (emAndamento.has(clinica.id)) throw new SincronizacaoEmAndamentoError()
  emAndamento.add(clinica.id)

  const execucao: Execucao = { inicio: new Date().toISOString(), fim: null, relatorio: null }
  ultimas.set(clinica.id, execucao)

  let relatorio: RelatorioDaClinica
  try {
    relatorio = await rodar(clinica, agora, carimbo)
  } catch (err) {
    relatorio = {
      companyId: clinica.companyId,
      diasConsultados: 0,
      pacientes: 0,
      erros: [(err as Error).message],
      obsoletosRemovidos: false,
    }
  } finally {
    emAndamento.delete(clinica.id)
  }

  execucao.fim = new Date().toISOString()
  execucao.relatorio = relatorio
  return relatorio
}
