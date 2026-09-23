import { anoDoAniversario, aniversarioAgendavel, aniversarioJaPassou } from '@/shared/data/agendamento'
import { mesDiaDe } from '@/shared/data/parse'
import type { StatusEnvio } from '@/shared/db'
import type { Aniversariante } from '@/providers/prontuario'

// A regra da tela de aniversariantes, separada de onde os dados vêm.
//
// As dependências entram por parâmetro para que cada caminho seja testável sem
// rede e sem banco: o provedor de prontuário e a consulta de envios são as
// duas únicas coisas que esta fatia não faz sozinha.

/** O que a tela precisa saber sobre um agendamento já feito. */
export interface EnvioResumo {
  pacienteId: string
  status: StatusEnvio
  scheduledFor: string | null
}

export interface ItemDaLista extends Aniversariante {
  /** Aniversário anterior a hoje no fuso da clínica. */
  jaPassou: boolean
  /**
   * Dá para agendar: aniversário DEPOIS de hoje. Não é o contrário de
   * `jaPassou` — o de hoje não passou e também não é agendável. A MESMA regra
   * que o agendamento aplica (shared/data/agendamento.ts), para a tela não
   * oferecer o que o servidor vai recusar.
   */
  agendavel: boolean
  /** O agendamento deste ano, se existir. */
  envio: EnvioResumo | null
}

export interface Dependencias {
  listarDoProntuario: (mes: number) => Promise<Aniversariante[]>
  buscarEnvios: (ano: number) => Promise<EnvioResumo[]>
}

export interface Consulta {
  mes: number
  timezone: string
  agora: Date
}

export async function listarAniversariantes(
  consulta: Consulta,
  deps: Dependencias
): Promise<ItemDaLista[]> {
  // O MESMO ano que o agendamento usa para gravar a chave única. Se as duas
  // fatias divergirem, a tela mostra "sem mensagem" para quem acabou de ser
  // agendado — por isso a regra mora em `shared`.
  const ano = anoDoAniversario(consulta.mes, consulta.timezone, consulta.agora)

  // As duas buscas são independentes — não há razão para esperar uma para
  // começar a outra. A do prontuário costuma ser a lenta.
  const [doProntuario, envios] = await Promise.all([
    deps.listarDoProntuario(consulta.mes),
    deps.buscarEnvios(ano),
  ])

  const envioPorPaciente = new Map(envios.map((e) => [e.pacienteId, e]))

  return doProntuario
    .map((paciente) => {
      const { mes, dia } = mesDiaDe(paciente.aniversario)
      return {
        ...paciente,
        jaPassou: aniversarioJaPassou(mes, dia, consulta.timezone, consulta.agora),
        agendavel: aniversarioAgendavel(mes, dia, consulta.timezone, consulta.agora),
        envio: envioPorPaciente.get(paciente.id) ?? null,
      }
    })
    // Ordenado por dia aqui, e não na tela: é a ordem em que a lista faz
    // sentido para qualquer consumidor, não uma preferência de layout.
    .sort((a, b) => {
      const diff = mesDiaDe(a.aniversario).dia - mesDiaDe(b.aniversario).dia
      return diff !== 0 ? diff : a.nome.localeCompare(b.nome, 'pt-BR')
    })
}

/**
 * A lista veio vazia porque o prontuário ainda não tem dado desta clínica?
 *
 * Só pergunta ao provedor quando a lista está vazia: com itens, a resposta é
 * óbvia e a consulta extra seria desperdício. Sem a pergunta, "clínica
 * recém-cadastrada" e "ninguém faz aniversário" chegavam iguais à tela.
 */
export async function aguardandoPrimeiraSincronizacao(
  itens: ItemDaLista[],
  verificar: (() => Promise<boolean>) | undefined
): Promise<boolean> {
  if (itens.length > 0 || !verificar) return false
  return verificar()
}
