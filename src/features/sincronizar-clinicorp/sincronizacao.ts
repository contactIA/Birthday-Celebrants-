import { hojeNoTimezone } from '@/shared/data/fuso'
import { parseDataYMD, mesDiaDe } from '@/shared/data/parse'

// O cron diário que reconstrói o cache de aniversariantes da Clinicorp.
//
// POR QUE EXISTE: a API deles só lista aniversariantes de UM dia, e o status do
// paciente vem em outra chamada, uma por paciente. Montar "o mês" ao vivo
// custaria ~31 requests mais um por paciente, a cada carregamento de tela.
//
// ┌──────────────────────────────────────────────────────────────────────────┐
// │ Esta fatia ESCREVE a tabela que `providers/prontuario/clinicorp.ts` LÊ.   │
// │ É a única dependência entre fatias do sistema, e a tabela é a interface.  │
// └──────────────────────────────────────────────────────────────────────────┘

/**
 * Chamadas simultâneas por clínica, em cada fase.
 *
 * Era 6, e a Clinicorp respondeu 429 em massa já na primeira execução na VPS
 * (duas clínicas em paralelo = 12 chamadas ao mesmo tempo). O 6 vinha do teto
 * de 300s da Vercel; na VPS não há teto, e ir devagar é mais barato que
 * retentar. As retentativas de 429 ficam no cliente HTTP (`api.ts`).
 */
export const CONCORRENCIA = 2

/** Um paciente como a API de aniversariantes o devolve. */
export interface PacienteBruto {
  PatientId: number | string
  Name: string
  BirthDate: string | null
  MobilePhone: string | null
}

export interface LinhaDeCache {
  pacienteId: string
  nome: string
  telefone: string | null
  /** "YYYY-MM-DD" */
  datanascimento: string
  mes: number
  dia: number
  situacao: string | null
  /**
   * `false` quando a consulta de status FALHOU nesta execução.
   *
   * Não é o mesmo que `situacao: null`. Sem esta distinção a gravação escrevia
   * `null` por cima do status que o cache já tinha — e como a tela só esconde
   * INACTIVE/DELETED, um 429 da Clinicorp fazia paciente excluído reaparecer
   * como agendável. Quem grava só escreve `situacao` quando isto é `true`.
   */
  situacaoVerificada: boolean
}

export interface RelatorioDaClinica {
  companyId: string
  diasConsultados: number
  pacientes: number
  erros: string[]
  /** `false` quando houve erro de dia e a limpeza foi adiada — ver abaixo. */
  obsoletosRemovidos: boolean
}

export interface DependenciasDoSync {
  buscarAniversariantesDoDia: (data: string) => Promise<PacienteBruto[]>
  /**
   * Lança quando não deu para verificar. `null` = a Clinicorp respondeu, sem
   * status. Os dois viram "não esconder o paciente", mas só o segundo pode
   * sobrescrever o que o cache já sabia.
   */
  buscarStatus: (pacienteId: string) => Promise<string | null>
  gravarLote: (linhas: LinhaDeCache[]) => Promise<void>
  /** Remove do cache desta clínica o que não foi tocado nesta execução. */
  removerObsoletos: () => Promise<void>
}

async function comConcorrenciaLimitada<T, R>(
  itens: T[],
  limite: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const resultados: R[] = new Array(itens.length)
  let proximo = 0
  async function trabalhador() {
    while (proximo < itens.length) {
      const indice = proximo++
      resultados[indice] = await fn(itens[indice]!)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limite, itens.length) }, trabalhador))
  return resultados
}

/**
 * Os dias a consultar: mês atual + o seguinte, no fuso da clínica.
 *
 * Escopo deliberadamente limitado: é o que a tela precisa. Aniversário passado
 * não é agendável, e não há caso de uso para navegar meses distantes.
 */
export function diasParaSincronizar(timezone: string, agora: Date): string[] {
  const { ano, mes } = hojeNoTimezone(timezone, agora)
  const inicio = Date.UTC(ano, mes - 1, 1)
  const fim = Date.UTC(ano, mes + 1, 0) // último dia do mês seguinte
  const dias: string[] = []
  for (let t = inicio; t <= fim; t += 86_400_000) {
    dias.push(new Date(t).toISOString().slice(0, 10))
  }
  return dias
}

export async function sincronizarClinica(
  clinica: { companyId: string; timezone: string },
  agora: Date,
  deps: DependenciasDoSync
): Promise<RelatorioDaClinica> {
  const dias = diasParaSincronizar(clinica.timezone, agora)
  const erros: string[] = []

  const porDia = await comConcorrenciaLimitada(dias, CONCORRENCIA, async (data) => {
    try {
      return await deps.buscarAniversariantesDoDia(data)
    } catch (err) {
      erros.push(`aniversariantes de ${data}: ${(err as Error).message}`)
      return null
    }
  })

  const algumDiaFalhou = porDia.some((r) => r === null)

  const encontrados = new Map<string, LinhaDeCache>()
  for (const doDia of porDia) {
    if (!doDia) continue
    for (const p of doDia) {
      // `parseDataYMD`, e não um regex local: um `/^(\d{4})-(\d{2})-(\d{2})/`
      // aceita "0000-00-00" e produz mes=0, que a check constraint da tabela
      // rejeita — o lote inteiro falha por causa de um cadastro vazio. O parser
      // compartilhado já conhece as datas sentinela.
      const data = parseDataYMD(p.BirthDate)
      if (!data) continue

      const { mes, dia } = mesDiaDe(data.aniversario)
      encontrados.set(String(p.PatientId), {
        pacienteId: String(p.PatientId),
        nome: p.Name,
        telefone: p.MobilePhone ?? null,
        datanascimento: p.BirthDate!.slice(0, 10),
        mes,
        dia,
        situacao: null,
        situacaoVerificada: false,
      })
    }
  }

  const linhas = [...encontrados.values()]

  // O status só existe numa chamada por paciente — e só dos encontrados, não
  // da base inteira.
  const situacoes = await comConcorrenciaLimitada(linhas, CONCORRENCIA, async (linha) => {
    try {
      return { verificada: true, valor: await deps.buscarStatus(linha.pacienteId) }
    } catch (err) {
      erros.push(`status de ${linha.pacienteId}: ${(err as Error).message}`)
      return { verificada: false, valor: null }
    }
  })
  linhas.forEach((linha, i) => {
    linha.situacao = situacoes[i]!.valor
    linha.situacaoVerificada = situacoes[i]!.verificada
  })

  if (linhas.length > 0) await deps.gravarLote(linhas)

  // A LIMPEZA VEM DEPOIS DA GRAVAÇÃO, e é condicional.
  //
  // O app anterior fazia o contrário: apagava o cache da clínica e só então
  // reinseria. Uma falha no meio — ou o corte por tempo de execução — deixava a
  // clínica com cache vazio, e a tela dizia "ninguém faz aniversário este mês".
  //
  // Gravar primeiro e remover o que sobrou inverte o modo de falha: o pior caso
  // passa a ser dado velho, não dado ausente. E se ALGUM dia falhou, nem
  // removemos: os pacientes daquele dia não foram renovados e seriam
  // confundidos com obsoletos.
  const podeRemover = !algumDiaFalhou
  if (podeRemover) await deps.removerObsoletos()

  return {
    companyId: clinica.companyId,
    diasConsultados: dias.length,
    pacientes: linhas.length,
    erros,
    obsoletosRemovidos: podeRemover,
  }
}
