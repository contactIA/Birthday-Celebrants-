// Parsers defensivos para as datas que chegam dos prontuários.
//
// Cada guarda aqui corresponde a um valor observado em produção, não a
// paranoia: o e-Clínica devolve "0000-00-00", "0001-01-01" e "00/00" no lugar
// de null quando o cadastro não tem data de nascimento.

export interface DataNascimento {
  /** "MM/DD" — formato interno, escolhido por facilitar comparação. */
  aniversario: string
  /** "DD/MM/AAAA" — formato de exibição. `null` quando só temos o dia/mês. */
  datanascimento: string | null
}

const ANOS_SENTINELA = new Set(['0000', '0001'])

/** Aceita "YYYY-MM-DD" (com ou sem hora depois). */
export function parseDataYMD(bruto: string | null | undefined): DataNascimento | null {
  if (!bruto) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(bruto)
  if (!m) return null
  const [, ano, mes, dia] = m as unknown as [string, string, string, string]
  if (ANOS_SENTINELA.has(ano) || mes === '00' || dia === '00') return null
  if (Number(mes) > 12 || Number(dia) > 31) return null
  return { aniversario: `${mes}/${dia}`, datanascimento: `${dia}/${mes}/${ano}` }
}

/** Alguns registros trazem só "MM/DD" pronto, sem a data completa. */
export function parseAniversarioPronto(bruto: string | null | undefined): DataNascimento | null {
  if (!bruto) return null
  const m = /^(\d{2})\/(\d{2})$/.exec(bruto.trim())
  if (!m) return null
  const [, mes, dia] = m as unknown as [string, string, string]
  if (mes === '00' || dia === '00') return null
  if (Number(mes) > 12 || Number(dia) > 31) return null
  return { aniversario: `${mes}/${dia}`, datanascimento: null }
}

export function mesDiaDe(aniversario: string): { mes: number; dia: number } {
  const [mes, dia] = aniversario.split('/')
  return { mes: Number(mes), dia: Number(dia) }
}

/** "MM/DD" (interno) -> "DD/MM" (como o brasileiro lê). */
export function paraExibicao(aniversario: string): string {
  const [mes, dia] = aniversario.split('/')
  return `${dia}/${mes}`
}
