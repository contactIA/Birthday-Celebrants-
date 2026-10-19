import type { Trecho } from '@/shared/template/parametros'

// A prévia como o paciente lê no WhatsApp: `*negrito*`, `_itálico_` e
// `~riscado~` aplicados, sem os marcadores. Os valores das variáveis seguem
// marcados, para a tela mostrar o que o app preencheu.
//
// Só a exibição muda: o texto vem de `trechosDoTexto`, a mesma conta do envio.

export interface Pedaco {
  texto: string
  negrito: boolean
  italico: boolean
  riscado: boolean
  /** De uma variável: `ligada` (o app preenche) ou `solta` (fica a marcação). `null` = texto do modelo. */
  variavel: 'ligada' | 'solta' | null
}

type Estilo = 'negrito' | 'italico' | 'riscado'

/**
 * As regras do WhatsApp: o marcador encosta no texto por dentro (`* oi*` não
 * vale), não encosta em letra por fora (`a*b*c` não vale) e não atravessa linha.
 */
function formato(marcador: '*' | '_' | '~'): RegExp {
  // Com a flag `u`, só caractere de sintaxe aceita escape: `\*` sim, `\_` não.
  const m = marcador === '*' ? '\\*' : marcador
  return new RegExp(`(?<![\\p{L}\\p{N}])${m}(?=\\S)[^${m}\\n]*?\\S${m}(?![\\p{L}\\p{N}])`, 'gu')
}
const FORMATOS: [RegExp, Estilo][] = [
  [formato('*'), 'negrito'],
  [formato('_'), 'italico'],
  [formato('~'), 'riscado'],
]

export function pedacosDaPrevia(trechos: Trecho[]): Pedaco[] {
  const texto = trechos.map((t) => t.texto).join('')

  // De qual trecho vem cada posição: dois valores vizinhos não viram um só.
  const origem = new Array<number>(texto.length)
  let inicio = 0
  trechos.forEach((t, i) => {
    origem.fill(i, inicio, inicio + t.texto.length)
    inicio += t.texto.length
  })
  const doModelo = (posicao: number) => trechos[origem[posicao]!]!.variavel === undefined

  const estilos = Array.from({ length: texto.length }, () => new Set<Estilo>())
  const marcador = new Array<boolean>(texto.length).fill(false)
  for (const [regra, estilo] of FORMATOS) {
    for (const m of texto.matchAll(regra)) {
      const abre = m.index
      const fecha = abre + m[0].length - 1
      // Marcador que veio de um valor (um nome com "_") não formata nada.
      if (!doModelo(abre) || !doModelo(fecha)) continue
      marcador[abre] = marcador[fecha] = true
      for (let k = abre + 1; k < fecha; k++) estilos[k]!.add(estilo)
    }
  }

  const pedacos: Pedaco[] = []
  let trechoDoUltimo = -2
  for (let k = 0; k < texto.length; k++) {
    if (marcador[k]) continue
    const trecho = trechos[origem[k]!]!
    // Texto do modelo se junta com texto do modelo; valor, só com o mesmo valor.
    const deQual = trecho.variavel === undefined ? -1 : origem[k]!
    const atual: Pedaco = {
      texto: texto[k]!,
      negrito: estilos[k]!.has('negrito'),
      italico: estilos[k]!.has('italico'),
      riscado: estilos[k]!.has('riscado'),
      variavel: trecho.variavel === undefined ? null : trecho.ligada ? 'ligada' : 'solta',
    }
    const ultimo = pedacos.at(-1)
    if (
      ultimo &&
      trechoDoUltimo === deQual &&
      ultimo.negrito === atual.negrito &&
      ultimo.italico === atual.italico &&
      ultimo.riscado === atual.riscado
    ) {
      ultimo.texto += atual.texto
    } else {
      pedacos.push(atual)
      trechoDoUltimo = deQual
    }
  }
  return pedacos
}
