import type { Clinica } from '@/shared/clinica/repositorio'
import { provedorHelena, type CredenciaisDeMensageria } from './helena'
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
  return provedorHelena(clinica.credenciais.mensageria)
}

/**
 * Com credenciais avulsas — para a área de setup listar canais e equipes com o
 * token digitado no formulário, antes de a clínica existir.
 */
export function mensageriaComCredenciais(credenciais: CredenciaisDeMensageria): ProvedorDeMensageria {
  return provedorHelena(credenciais)
}
