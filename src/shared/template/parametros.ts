import { paraExibicao } from '@/shared/data/parse'

/** Os campos do paciente que um template pode referenciar. */
export type CampoDoPaciente = 'nome' | 'primeiro_nome' | 'data_nascimento' | 'aniversario'

export const CAMPOS_DISPONIVEIS: { valor: CampoDoPaciente; rotulo: string }[] = [
  { valor: 'nome', rotulo: 'Nome completo' },
  { valor: 'primeiro_nome', rotulo: 'Primeiro nome' },
  { valor: 'data_nascimento', rotulo: 'Data de nascimento' },
  { valor: 'aniversario', rotulo: 'Dia/mês de aniversário' },
]

/** `{{1}} -> "primeiro_nome"`, como fica salvo em `param_mapping`. */
export type MapeamentoDeParametros = Record<string, string>

export interface DadosDoPaciente {
  nome: string
  /** "DD/MM/AAAA" */
  datanascimento: string
  /** "MM/DD" — formato interno */
  aniversario: string
}

function valoresDe(p: DadosDoPaciente): Record<CampoDoPaciente, string> {
  return {
    nome: p.nome,
    primeiro_nome: p.nome.split(' ')[0] ?? p.nome,
    data_nascimento: p.datanascimento,
    aniversario: paraExibicao(p.aniversario),
  }
}

/**
 * Os valores que vão nos parâmetros do template, prontos para envio.
 *
 * ESTA é a única implementação do mapeamento. No app anterior existiam três —
 * uma no envio, uma na prévia da tela e uma terceira sem uso — e as duas ativas
 * já divergiam no campo ausente: o envio preenchia vazio, a prévia mantinha o
 * `{{n}}` literal. A prévia mentia sobre o que seria enviado.
 */
export function resolverParametros(
  mapeamento: MapeamentoDeParametros,
  paciente: DadosDoPaciente
): Record<string, string> {
  const fonte = valoresDe(paciente)
  const saida: Record<string, string> = {}
  for (const [parametro, campo] of Object.entries(mapeamento)) {
    saida[parametro] = fonte[campo as CampoDoPaciente] ?? ''
  }
  return saida
}

/** O texto final. A prévia da tela chama exatamente isto, com os mesmos dados. */
export function renderizar(
  conteudo: string,
  mapeamento: MapeamentoDeParametros,
  paciente: DadosDoPaciente
): string {
  const valores = resolverParametros(mapeamento, paciente)
  let saida = conteudo
  for (const [parametro, valor] of Object.entries(valores)) {
    saida = saida.replaceAll(`{{${parametro}}}`, valor)
  }
  return saida
}

/** Extrai `{{1}}`, `{{nome}}`... do corpo do template. */
export function parametrosDoTemplate(conteudo: string): string[] {
  return [...new Set(Array.from(conteudo.matchAll(/\{\{\s*(\w+)\s*\}\}/g), (m) => m[1] as string))]
}
