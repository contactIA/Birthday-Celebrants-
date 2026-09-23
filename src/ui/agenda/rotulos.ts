// Rótulos da agenda.
//
// Tudo aqui recebe `hoje` já calculado no fuso da clínica pelo servidor. O
// navegador NÃO faz conta de fuso: a pessoa pode estar num fuso diferente do da
// clínica, e o app anterior usava o fuso do navegador como aproximação — o que
// produzia "Hoje" no dia errado para quem estivesse viajando.

export interface DataDaClinica {
  ano: number
  mes: number
  dia: number
}

const MESES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
]

export const MESES_TITULO = MESES.map((m) => m[0]!.toUpperCase() + m.slice(1))

const DIAS_DA_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

/** "Hoje · 15 de setembro", "Amanhã · 16 de setembro", "Quinta · 18 de setembro". */
export function rotuloDoDia(mes: number, dia: number, hoje: DataDaClinica): string {
  const dataPorExtenso = `${dia} de ${MESES[mes - 1]}`

  if (mes === hoje.mes && dia === hoje.dia) return `Hoje · ${dataPorExtenso}`

  const amanha = new Date(Date.UTC(hoje.ano, hoje.mes - 1, hoje.dia + 1))
  if (mes === amanha.getUTCMonth() + 1 && dia === amanha.getUTCDate()) {
    return `Amanhã · ${dataPorExtenso}`
  }

  const diaDaSemana = new Date(Date.UTC(hoje.ano, mes - 1, dia)).getUTCDay()
  return `${DIAS_DA_SEMANA[diaDaSemana]} · ${dataPorExtenso}`
}

/**
 * Idade que a pessoa completa neste aniversário.
 *
 * `datanascimento` vem como "DD/MM/AAAA" e pode vir vazio — nem todo cadastro
 * tem data completa. Devolve `null` também para idade absurda: erro de
 * digitação no ano ("1694" em vez de "1964") não é sentinela de vazio, então os
 * parsers não pegam, mas mostrar "faz 332 anos" na tela é pior que não mostrar.
 */
export function idadeQueFaz(datanascimento: string, hoje: DataDaClinica): number | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(datanascimento)
  if (!m) return null
  const idade = hoje.ano - Number(m[3])
  return idade > 0 && idade <= 120 ? idade : null
}

/** "09/20" (interno) → "20/09" (como o brasileiro lê). */
export function aniversarioParaExibicao(aniversario: string): string {
  const [mes, dia] = aniversario.split('/')
  return `${dia}/${mes}`
}

/** Junta com vírgulas e um "e" no fim: "3 sem mensagem, 1 agendado e 2 a corrigir". */
export function listaEmPortugues(partes: string[]): string {
  if (partes.length <= 1) return partes[0] ?? ''
  return `${partes.slice(0, -1).join(', ')} e ${partes.at(-1)}`
}
