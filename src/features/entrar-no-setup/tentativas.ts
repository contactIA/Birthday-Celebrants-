// Limite de tentativas de senha na área de setup, por IP.
//
// A área é protegida por UMA senha compartilhada e fica na internet aberta. O
// scrypt deixa cada tentativa cara, mas sem limite um script testaria senhas
// indefinidamente. Cinco erros em quinze minutos bloqueiam aquele IP até a
// janela passar.
//
// O estado vive em memória, no processo: há um container só, e um restart que
// zere a contagem é aceitável — quem ataca não controla o restart.

export const MAXIMO_DE_FALHAS = 5
export const JANELA_MS = 15 * 60 * 1000

export interface Registro {
  falhas: number
  /** Instante (ms) da primeira falha da janela. */
  desde: number
}

function janelaVenceu(registro: Registro, agora: number): boolean {
  return agora - registro.desde >= JANELA_MS
}

export function estaBloqueado(registro: Registro | undefined, agora: number): boolean {
  if (!registro || janelaVenceu(registro, agora)) return false
  return registro.falhas >= MAXIMO_DE_FALHAS
}

export function registrarFalha(registro: Registro | undefined, agora: number): Registro {
  if (!registro || janelaVenceu(registro, agora)) return { falhas: 1, desde: agora }
  return { falhas: registro.falhas + 1, desde: registro.desde }
}

/** Minutos até liberar, arredondado para cima — para a frase da tela. */
export function minutosParaLiberar(registro: Registro, agora: number): number {
  return Math.max(1, Math.ceil((registro.desde + JANELA_MS - agora) / 60_000))
}

/**
 * Remove registros vencidos. Chamado a cada tentativa: sem isso o mapa só
 * cresceria com cada IP que já errou uma vez.
 */
export function limparVencidos(registros: Map<string, Registro>, agora: number): void {
  for (const [ip, registro] of registros) {
    if (janelaVenceu(registro, agora)) registros.delete(ip)
  }
}
