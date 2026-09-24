import { assinar, verificar } from './token'

// A decisão de acesso, separada do Next de propósito.
//
// Isto é a regra de segurança do app inteiro: quem entra, como a clínica é
// resolvida, e quando recusar. Mantê-la em função pura é o que permite testar
// cada caminho — inclusive os que nasceram de incidente real — sem subir
// servidor nem forjar `NextRequest`. O `proxy.ts` só traduz o resultado em
// `NextResponse`.

/** Token que nós mesmos emitimos a partir do id informado pelo host: 12h. */
export const TTL_ESCOPO_DO_HOST = 60 * 60 * 12

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type MotivoDeRecusa = 'sem-token' | 'escopo-divergente' | 'sem-escopo-na-url'

export type Decisao =
  | { tipo: 'negar'; motivo: MotivoDeRecusa }
  | {
      tipo: 'seguir'
      companyId: string
      /** Token a gravar no cookie. `null` = o cookie atual já serve. */
      novoToken: string | null
      /**
       * Trocar `?t=` por `?clinica=` na URL, por redirect — só quando o token
       * veio na URL. A clínica fica na URL (sem segredo) para o F5 e a
       * navegação de entrada seguinte continuarem com escopo explícito.
       */
      limparTokenDaUrl: boolean
    }

export interface Entrada {
  /** `?t=` — token assinado pelo Clinic Control. */
  tokenDaUrl: string | null
  /** `?clinica=` — id da conta que o host monta por espectador. Não assinado. */
  companyIdDaUrl: string | null
  referer: string | null
  tokenDoCookie: string | null
  /** Hosts do white label autorizados a informar a clínica pela URL. */
  hostsPermitidos: string[]
  agora: Date
  segredo: string
  /**
   * A requisição é uma NAVEGAÇÃO DE ENTRADA: o documento chegando de fora do
   * app — outro site, a plataforma, a barra de endereço, um link colado. O
   * proxy deriva isto dos cabeçalhos `Sec-Fetch-*`, que a página não forja.
   * Navegação interna do app e chamadas de API da tela são `false`.
   */
  navegacaoDeEntrada: boolean
}

/**
 * A clínica que o host informou na URL, se for aceitável.
 *
 * TROCA ACEITA, registrada para quem ler depois: o id não vem assinado, então
 * quem conhecer o id de OUTRA clínica e conseguir apresentar um Referer do host
 * entra no lugar dela. É um passo atrás do link assinado por clínica, e foi
 * aceito porque a plataforma tem uma única configuração de aba para todas —
 * sem isso a feature não funciona para ninguém.
 *
 * O que segura o risco: os ids não são enumeráveis (a rota de clínicas devolve
 * só a do escopo). É preciso obter o id por fora.
 *
 * O que resolveria de verdade: a plataforma assinar o valor, ou permitir
 * configuração de aba por clínica — aí volta o link assinado.
 *
 * Referer é falsificável por quem monta a requisição à mão. É barreira, não
 * garantia, e está aqui escrito para não ser confundido com uma.
 */
function companyIdDoHost(e: Entrada): string | null {
  // Placeholder não substituído (`{idaccount}` literal) e lixo não passam: um
  // id inválido viraria consulta ao banco com valor arbitrário.
  if (!e.companyIdDaUrl || !UUID.test(e.companyIdDaUrl)) return null
  if (!e.referer) return null

  try {
    const host = new URL(e.referer).hostname.toLowerCase()
    const autorizado = e.hostsPermitidos.some((h) => host === h || host.endsWith(`.${h}`))
    return autorizado ? e.companyIdDaUrl : null
  } catch {
    return null
  }
}

export function decidir(e: Entrada): Decisao {
  // Entrada SEM clínica na URL: recusa, mesmo com cookie válido.
  //
  // Isto existe por causa de um vazamento observado: abrir o endereço sem
  // parâmetro mostrava a última clínica vista naquele navegador — o cookie
  // vencia sozinho. Para a recepção de uma clínica só, era a clínica certa;
  // para quem entra em várias contas (a equipe, uma agência), era a clínica
  // ERRADA, sem aviso nenhum. O cookie continua valendo para o que acontece
  // DENTRO do app (navegação interna e chamadas da tela), onde a clínica já
  // foi decidida na entrada.
  if (e.navegacaoDeEntrada && !e.tokenDaUrl && !e.companyIdDaUrl) {
    return { tipo: 'negar', motivo: 'sem-escopo-na-url' }
  }

  // Token novo na URL tem prioridade sobre o cookie: é assim que se troca de
  // clínica, e é o caminho do primeiro acesso, quando cookie ainda não existe.
  let escopo = verificar(e.tokenDaUrl, e.agora, e.segredo)
  let novoToken = escopo ? e.tokenDaUrl : null
  let veioDaUrl = escopo !== null

  // Caminho do white label: emitimos NOSSO token a partir do id informado, para
  // que tudo rio acima continue lendo um token verificado — a decisão de
  // confiança fica num lugar só, em vez de espalhada por rota.
  if (!escopo) {
    const doHost = companyIdDoHost(e)
    if (doHost) {
      novoToken = assinar(doHost, TTL_ESCOPO_DO_HOST, e.agora, e.segredo)
      escopo = verificar(novoToken, e.agora, e.segredo)
    }
  }

  if (!escopo) {
    escopo = verificar(e.tokenDoCookie, e.agora, e.segredo)
    if (escopo) {
      novoToken = null
      veioDaUrl = false
    }
  }

  if (!escopo) return { tipo: 'negar', motivo: 'sem-token' }

  // A URL declara uma clínica e o escopo resolvido é OUTRA: recusa.
  //
  // Isto existe por causa de um vazamento real. Um link específico de clínica
  // foi colado numa configuração de aba que vale para TODAS, então toda clínica
  // que abria recebia o cookie daquela e via os pacientes dela. O agravante: o
  // cookie continuava vencendo depois, mesmo quando a URL já declarava a
  // clínica certa — a comparação abaixo não existia.
  //
  // Cobre também o placeholder não substituído: ele não bate com company id
  // nenhum, então recusa em vez de servir a clínica do último cookie.
  //
  // Servir a clínica errada é pior que não servir nada: é silencioso, e quem vê
  // não tem como saber que está olhando dado de outra pessoa.
  if (e.companyIdDaUrl && e.companyIdDaUrl !== escopo.companyId) {
    return { tipo: 'negar', motivo: 'escopo-divergente' }
  }

  return {
    tipo: 'seguir',
    companyId: escopo.companyId,
    novoToken,
    // Só redireciona quando o token veio em `?t=`. No caminho do host não há
    // nada a remover — redirecionar apontaria para a própria URL e entraria em
    // loop infinito.
    limparTokenDaUrl: veioDaUrl && e.tokenDaUrl !== null,
  }
}
