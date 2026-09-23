import { createHmac, timingSafeEqual } from 'node:crypto'

// Token de escopo de clínica: assinado pelo Clinic Control, verificado aqui.
//
// POR QUE EXISTE. Este app não tem login. A URL é pública, e antes do token toda
// rota recebia a clínica no próprio request (`?clinica=` ou no corpo) sem
// verificar direito de acesso — com a rota de clínicas entregando a lista
// completa de bandeja. Eram dois furos independentes: nenhum gate, e nenhum
// isolamento entre clínicas. Um token que CARREGA a clínica fecha os dois de uma
// vez, porque ela deixa de ser escolha do chamador e passa a ser parte da
// credencial. "Embutido num iframe" nunca foi controle de acesso — um `<iframe>`
// não impede ninguém de abrir a URL direto.
//
// ─────────────────────────────────────────────────────────────────────────────
// CONTRATO DE REDE — A REGRA VIVE EM DOIS REPOS
//
// O emissor é `Clinic-Control/src/lib/clinics/aniversariantes-link.ts`. Este
// verificador precisa concordar byte a byte: conjunto de campos do payload,
// base64url do JSON, HMAC-SHA256 sobre o payload JÁ CODIFICADO, juntos por ".".
//
// Mudar um lado sem o outro não quebra build nenhum — quebra o acesso ao painel
// em runtime, para todas as clínicas de uma vez.
//
// É a terceira instância da mesma armadilha no ecossistema: a constraint de
// credenciais duplicada em SQL e TypeScript, o contrato de colunas, e agora o
// formato do token. Todas com a mesma saída definitiva (código único, garantido
// pelo compilador) e o mesmo paliativo enquanto isso: PR nos dois repos.
//
// Por isso o campo na rede se chama `slug` e não `companyId`. É o mesmo nome
// legado da coluna, e renomear exigiria mudança coordenada sem ganho algum.
// A tradução para o vocabulário deste repositório acontece aqui, num lugar só.
// ─────────────────────────────────────────────────────────────────────────────
//
// NÃO é JWT de propósito: não há claim para negociar nem biblioteca para
// versionar. O que não existe no formato não pode ser mal interpretado depois.
//
// Header interno, do proxy para as rotas. Este não é contrato com ninguém —
// o proxy o sobrescreve sempre, então nada que o cliente mande sobrevive.
export const HEADER_COMPANY_ID = 'x-company-id'

/** O formato que trafega. Não mudar sem PR no Clinic Control. */
interface PayloadNaRede {
  v: 1
  slug: string
  exp: number | null
}

/** O mesmo dado, no vocabulário deste repositório. */
export interface EscopoDeAcesso {
  /** `company_id` da plataforma de mensagens. Na rede e no banco: `slug`. */
  companyId: string
  /** Unix seconds. `null` = sem expiração (link da aba da plataforma). */
  expiraEm: number | null
}

function assinatura(payloadCodificado: string, segredo: string): string {
  return createHmac('sha256', segredo).update(payloadCodificado).digest('base64url')
}

/**
 * Assina um token de escopo.
 *
 * Usado só no caminho do white label, onde a plataforma informa a clínica pela
 * URL sem assinar: emitimos NOSSO token a partir dela para que tudo rio acima
 * continue lendo um token verificado — a decisão de confiança fica num lugar,
 * em vez de espalhada por rota.
 *
 * `expiraEmSegundos: null` = sem expiração.
 */
export function assinar(
  companyId: string,
  expiraEmSegundos: number | null,
  agora: Date,
  segredo: string
): string {
  const payload: PayloadNaRede = {
    v: 1,
    slug: companyId,
    exp: expiraEmSegundos === null ? null : Math.floor(agora.getTime() / 1000) + expiraEmSegundos,
  }
  const codificado = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${codificado}.${assinatura(codificado, segredo)}`
}

/**
 * Verifica assinatura e expiração. Devolve o escopo ou `null` — nunca lança por
 * token inválido.
 *
 * Quem chama NÃO deve distinguir "assinatura errada" de "expirado" para o
 * cliente: as duas respostas são 401. Contar qual foi ajuda quem está sondando.
 */
export function verificar(
  token: string | undefined | null,
  agora: Date,
  segredo: string
): EscopoDeAcesso | null {
  if (!token) return null

  const partes = token.split('.')
  if (partes.length !== 2) return null
  const [codificado, recebida] = partes as [string, string]

  // Autenticar ANTES de interpretar: nada de `JSON.parse` em dado que ainda não
  // provou ter vindo de quem tem o segredo.
  const esperada = Buffer.from(assinatura(codificado, segredo), 'utf8')
  const informada = Buffer.from(recebida, 'utf8')
  // `timingSafeEqual` lança quando os tamanhos diferem — comparar antes.
  if (esperada.length !== informada.length) return null
  if (!timingSafeEqual(esperada, informada)) return null

  let payload: PayloadNaRede
  try {
    payload = JSON.parse(Buffer.from(codificado, 'base64url').toString('utf8'))
  } catch {
    return null
  }

  // Assinatura válida mas formato inesperado é inválido, não "quase válido":
  // seguir com `slug` undefined viraria um escopo vazio silencioso.
  if (payload?.v !== 1) return null
  if (typeof payload.slug !== 'string' || !payload.slug) return null

  if (payload.exp !== null) {
    if (typeof payload.exp !== 'number') return null
    if (payload.exp < agora.getTime() / 1000) return null
  }

  return { companyId: payload.slug, expiraEm: payload.exp }
}

/**
 * O segredo, ou erro.
 *
 * Falha fechado, de propósito: sem segredo não há como distinguir token válido
 * de forjado, e o modo de falha correto é ninguém entrar — não todos entrarem.
 */
export function segredoDoAmbiente(): string {
  const s = process.env.LINK_SECRET
  if (!s) throw new Error('LINK_SECRET não configurada')
  return s
}
