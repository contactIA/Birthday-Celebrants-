// A navegação por teclado do `Seletor`, sem React: setas pulam as opções
// desativadas, e uma letra leva à próxima opção que começa com ela.

export interface OpcaoNavegavel {
  rotulo: string
  desativada?: boolean
}

/**
 * A próxima opção ativa a partir de `de`, andando `passo` (1 ou -1), sem dar a
 * volta: no fim da lista, fica onde está. `de = -1` com passo 1 é a primeira.
 */
export function proximaAtiva(opcoes: OpcaoNavegavel[], de: number, passo: 1 | -1): number {
  for (let i = de + passo; i >= 0 && i < opcoes.length; i += passo) {
    if (!opcoes[i]!.desativada) return i
  }
  return de
}

/** A primeira (ou a última) opção ativa; -1 se nenhuma. */
export function pontaAtiva(opcoes: OpcaoNavegavel[], ponta: 'inicio' | 'fim'): number {
  return ponta === 'inicio' ? proximaAtiva(opcoes, -1, 1) : proximaAtiva(opcoes, opcoes.length, -1)
}

const semAcento = (texto: string) =>
  texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

/**
 * A próxima opção ativa, depois de `de`, cujo rótulo começa com `letra` — dando
 * a volta, para "d" repetido passar por "Data" e "Dia da semana". -1 se nenhuma.
 */
export function porLetra(opcoes: OpcaoNavegavel[], de: number, letra: string): number {
  const alvo = semAcento(letra)
  for (let n = 1; n <= opcoes.length; n++) {
    const i = (de + n + opcoes.length) % opcoes.length
    const opcao = opcoes[i]!
    if (!opcao.desativada && semAcento(opcao.rotulo).startsWith(alvo)) return i
  }
  return -1
}
