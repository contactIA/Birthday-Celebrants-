import type { Clinica } from '@/shared/clinica/repositorio'
import { provedorHelena } from './helena'
import type { ProvedorDeMensageria } from './porta'

export * from './porta'

/**
 * O provedor de mensageria da clínica.
 *
 * Um só hoje, e por isso não há `switch` nem coluna `sistema_mensageria`. Somar
 * um segundo é: um arquivo novo aqui, a coluna na tabela, e um `switch` neste
 * ponto — nenhuma fatia muda, porque todas falam com a porta.
 */
export function mensageriaDe(clinica: Clinica): ProvedorDeMensageria {
  return provedorHelena(clinica)
}
