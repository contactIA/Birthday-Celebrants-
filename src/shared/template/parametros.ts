import { paraExibicao } from '@/shared/data/parse'

/** Os campos do paciente que um template pode referenciar. */
export type CampoDoPaciente = 'nome' | 'primeiro_nome' | 'data_nascimento' | 'aniversario'

export const CAMPOS_DISPONIVEIS: { valor: CampoDoPaciente; rotulo: string }[] = [
  { valor: 'nome', rotulo: 'Nome completo' },
  { valor: 'primeiro_nome', rotulo: 'Primeiro nome' },
  { valor: 'data_nascimento', rotulo: 'Data de nascimento' },
  { valor: 'aniversario', rotulo: 'Dia/mês de aniversário' },
]

export const CAMPOS_VALIDOS: ReadonlySet<string> = new Set(CAMPOS_DISPONIVEIS.map((c) => c.valor))

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

// ── As variáveis do texto ───────────────────────────────────────────────────
//
// O texto do modelo chega em dois formatos: `{{1}}`, o do WhatsApp, e `[NOME]`,
// o da plataforma — que é como as clínicas escrevem os modelos lá. Até
// 2026-10-19 o app só lia o primeiro, e nenhum modelo em uso tinha variável
// ligada. No agendamento as duas vão em `parameters` pelo nome, sem chaves nem
// colchetes (`{ "NOME": "Maria" }`), o formato que a tela da própria
// plataforma usa.

/** `{{1}}`, ou `[NOME]` com cara de nome: letras, números, espaço, `_`, `-`, `.`. */
const VARIAVEL = /\{\{\s*(\w+)\s*\}\}|\[\s*([\p{L}\p{N}][\p{L}\p{N} _.-]{0,39}?)\s*\]/gu

export interface Variavel {
  /** A chave no mapeamento e em `parameters`: "1", "NOME". */
  nome: string
  /** Como está no texto, para a tela: "{{1}}", "[NOME]". */
  marcacao: string
  /**
   * `false` no formato da plataforma. Ela preenche as variáveis dela (o
   * `[Nome]` sai com o nome do contato) e não diz quais são: sem campo, a
   * variável fica com a plataforma e não impede de usar o modelo.
   */
  obrigatoria: boolean
}

/** As variáveis do texto, na ordem em que aparecem, sem repetir. */
export function variaveisDoTemplate(conteudo: string): Variavel[] {
  const vistas = new Map<string, Variavel>()
  for (const [, chaves, colchetes] of conteudo.matchAll(VARIAVEL)) {
    const nome = (chaves ?? colchetes)!
    if (vistas.has(nome)) continue
    vistas.set(
      nome,
      chaves !== undefined
        ? { nome, marcacao: `{{${nome}}}`, obrigatoria: true }
        : { nome, marcacao: `[${nome}]`, obrigatoria: false }
    )
  }
  return [...vistas.values()]
}

/**
 * O campo que o NOME da variável já diz. Só nome sem dúvida: `[DATA]` pode ser
 * o aniversário ou o nascimento, e `{{1}}` não diz nada — esses a clínica
 * escolhe.
 */
const CAMPO_PELO_NOME: ReadonlyMap<string, CampoDoPaciente> = new Map(
  (
    [
      ['primeiro_nome', ['nome', 'primeiro nome', 'paciente', 'nome do paciente', 'cliente', 'nome do cliente', 'aniversariante']],
      ['nome', ['nome completo']],
      ['data_nascimento', ['nascimento', 'data de nascimento', 'data nascimento']],
      ['aniversario', ['aniversario', 'data do aniversario', 'dia do aniversario']],
    ] satisfies [CampoDoPaciente, string[]][]
  ).flatMap(([campo, nomes]) => nomes.map((n) => [n, campo] as const))
)

/** "Aniversário" → "aniversario"; "Data_de-Nascimento" → "data de nascimento". */
function chaveDoNome(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[\s_.-]+/g, ' ')
    .trim()
}

export function campoPeloNome(nome: string): CampoDoPaciente | null {
  return CAMPO_PELO_NOME.get(chaveDoNome(nome)) ?? null
}

/**
 * O mapeamento que vale: o que a clínica salvou, e cada variável que ela não
 * ligou com o campo que o nome diz. A tela de Modelos começa daqui e o lote
 * envia daqui — os modelos salvos antes de o app ler `[NOME]` passam a sair com
 * o nome sem ninguém salvar de novo.
 */
export function completarMapeamento(conteudo: string, salvo: MapeamentoDeParametros): MapeamentoDeParametros {
  const completo: MapeamentoDeParametros = {}
  for (const { nome } of variaveisDoTemplate(conteudo)) {
    const campo = campoPeloNome(nome)
    if (campo) completo[nome] = campo
  }
  for (const [nome, campo] of Object.entries(salvo)) {
    if (CAMPOS_VALIDOS.has(campo)) completo[nome] = campo
  }
  return completo
}

/** Um pedaço do texto final: fixo do modelo, ou o valor de uma variável. */
export interface Trecho {
  texto: string
  /** O nome da variável de onde o texto veio. Ausente = texto fixo do modelo. */
  variavel?: string
  /** `false` = variável sem campo: o texto é a própria marcação ("[NOME]"). */
  ligada?: boolean
}

/**
 * O texto final em pedaços, para a prévia mostrar o que veio de cada variável.
 * `renderizar` é a junção destes pedaços: a prévia não tem como divergir do envio.
 */
export function trechosDoTexto(
  conteudo: string,
  mapeamento: MapeamentoDeParametros,
  paciente: DadosDoPaciente
): Trecho[] {
  const valores = resolverParametros(mapeamento, paciente)
  const trechos: Trecho[] = []
  let depoisDaUltima = 0
  for (const m of conteudo.matchAll(VARIAVEL)) {
    if (m.index > depoisDaUltima) trechos.push({ texto: conteudo.slice(depoisDaUltima, m.index) })
    const variavel = (m[1] ?? m[2])!
    const valor = valores[variavel]
    trechos.push(valor === undefined ? { texto: m[0], variavel, ligada: false } : { texto: valor, variavel, ligada: true })
    depoisDaUltima = m.index + m[0].length
  }
  if (depoisDaUltima < conteudo.length) trechos.push({ texto: conteudo.slice(depoisDaUltima) })
  return trechos
}

/** O texto final. A prévia da tela monta exatamente isto, com os mesmos dados. */
export function renderizar(
  conteudo: string,
  mapeamento: MapeamentoDeParametros,
  paciente: DadosDoPaciente
): string {
  return trechosDoTexto(conteudo, mapeamento, paciente)
    .map((t) => t.texto)
    .join('')
}
