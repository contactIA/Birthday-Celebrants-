import { hojeNoTimezone } from '@/shared/data/fuso'
import { parseDataYMD, mesDiaDe } from '@/shared/data/parse'
import type { PacienteBruto } from '@/providers/prontuario/clinicorp-api'

// O cron diário que reconstrói o cache de aniversariantes da Clinicorp.
//
// POR QUE EXISTE: a API deles só lista aniversariantes de UM dia. Montar "o
// mês" ao vivo custaria ~31 requests a cada carregamento de tela.
//
// SEM CONSULTA DE STATUS POR PACIENTE — e por quê, porque ela já existiu.
// A versão anterior chamava `/patient/get` para cada paciente encontrado, para
// esconder INACTIVE/DELETED. Em 2026-09-23 os dados mostraram que isso é
// redundante: `/patient/birthdays` já devolve SÓ pacientes ativos (o próprio
// 400 de dia vazio diz "Nenhum paciente ATIVO faz aniversário"), e das 527
// consultas de status que funcionaram em produção, 527 voltaram ACTIVE. A
// etapa custava uma chamada por paciente (600 numa clínica grande, contra 61
// da lista de dias), estourava a cota da Clinicorp e levava a sincronização de
// segundos para dezenas de minutos — sem esconder ninguém.
//
// ┌──────────────────────────────────────────────────────────────────────────┐
// │ Esta fatia ESCREVE a tabela que `providers/prontuario/clinicorp.ts` LÊ.   │
// │ É a única dependência entre fatias do sistema, e a tabela é a interface.  │
// └──────────────────────────────────────────────────────────────────────────┘

/**
 * Consultas de dia simultâneas por clínica.
 *
 * Era 6, e a Clinicorp respondeu 429 em massa já na primeira execução na VPS
 * (duas clínicas em paralelo = 12 chamadas ao mesmo tempo). O 6 vinha do teto
 * de 300s da Vercel; na VPS não há teto, e ir devagar é mais barato que
 * retentar. As retentativas de 429 ficam no cliente HTTP
 * (`providers/prontuario/clinicorp-api.ts`).
 */
export const CONCORRENCIA = 2

/**
 * O status gravado no cache. Constante porque `/patient/birthdays` só devolve
 * pacientes ativos (ver o topo). Gravar o valor, e não `null`, mantém a coluna
 * dizendo a verdade — e sobrescreve os `null` que a versão antiga deixou
 * quando a consulta de status tomava 429.
 */
export const SITUACAO_DA_LISTAGEM = 'ACTIVE'

export type { PacienteBruto }

export interface LinhaDeCache {
  pacienteId: string
  nome: string
  telefone: string | null
  /** "YYYY-MM-DD" */
  datanascimento: string
  mes: number
  dia: number
  situacao: string
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
        situacao: SITUACAO_DA_LISTAGEM,
      })
    }
  }

  const linhas = [...encontrados.values()]
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
