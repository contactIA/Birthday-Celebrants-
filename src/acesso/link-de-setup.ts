import { createHmac, timingSafeEqual } from 'node:crypto'

// O link curto e assinado com que o setup do CRM abre o setup deste app
// (contactIA/CRM-Contact-IA#219, ADR 0014 do CRM).
//
// ─────────────────────────────────────────────────────────────────────────────
// CONTRATO DE REDE — A REGRA VIVE EM DOIS REPOS
//
// O emissor é o setup do CRM, que assina com ANIVERSARIANTES_SETUP_SEGREDO; aqui
// o mesmo valor se chama SETUP_LINK_SEGREDO. O formato é o do token de painel
// (`token.ts`): base64url do JSON do payload, HMAC-SHA256 sobre o payload JÁ
// CODIFICADO, juntos por ".". O payload:
//
//   { "v": 1, "tipo": "setup", "companyId": "<uuid>" | null, "exp": <unix s> }
//
// `companyId` abre direto a clínica; `null` abre a lista. A validade é de 120 s.
// ─────────────────────────────────────────────────────────────────────────────
//
// Três segredos, três acessos, de propósito (ver o topo de `setup.ts`):
// - LINK_SECRET assina os links de painel, que dão UMA clínica;
// - a sessão do setup assina com uma chave DERIVADA do LINK_SECRET e da senha;
// - SETUP_LINK_SEGREDO assina só este link, e só o CRM o tem.
// Um link de painel vazado não abre o setup (outro segredo, e falta o `tipo`), e
// o cookie da sessão não serve de link (outra chave, e falta o `companyId`).
//
// Só importa `node:crypto`, como `setup.ts` e `token.ts`.

/** A validade que o CRM dá ao link. */
export const VALIDADE_DO_LINK_DE_SETUP = 120

/**
 * Até onde no futuro o `exp` pode estar. O CRM manda agora + 120 s; a folga cobre
 * relógio adiantado. Um `exp` além disso não é deste contrato e não vale, mesmo
 * assinado: um link de setup não pode durar horas.
 */
const ALCANCE_MAXIMO = VALIDADE_DO_LINK_DE_SETUP + 180

interface PayloadDoLinkDeSetup {
  v: 1
  tipo: 'setup'
  companyId: string | null
  exp: number
}

export interface LinkDeSetup {
  /** A clínica para abrir no setup, ou `null` para a lista. */
  companyId: string | null
}

function assinatura(codificado: string, segredo: string): string {
  return createHmac('sha256', segredo).update(codificado).digest('base64url')
}

/** Assina um link, como o CRM faz. Aqui serve aos testes e à conferência manual. */
export function assinarLinkDeSetup(companyId: string | null, agora: Date, segredo: string): string {
  const payload: PayloadDoLinkDeSetup = {
    v: 1,
    tipo: 'setup',
    companyId,
    exp: Math.floor(agora.getTime() / 1000) + VALIDADE_DO_LINK_DE_SETUP,
  }
  const codificado = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${codificado}.${assinatura(codificado, segredo)}`
}

/**
 * Confere a assinatura (tempo constante), o `v`, o `tipo`, o `companyId` e a
 * validade. Devolve o link ou `null`, nunca lança.
 *
 * Quem chama não conta ao cliente o motivo da recusa: assinatura errada e link
 * vencido dão a mesma resposta.
 */
export function verificarLinkDeSetup(
  token: string | null | undefined,
  agora: Date,
  segredo: string
): LinkDeSetup | null {
  if (!token || !segredo) return null
  const partes = token.split('.')
  if (partes.length !== 2) return null
  const [codificado, recebida] = partes as [string, string]

  // Autenticar ANTES de interpretar.
  const esperada = Buffer.from(assinatura(codificado, segredo), 'utf8')
  const informada = Buffer.from(recebida, 'utf8')
  if (esperada.length !== informada.length || !timingSafeEqual(esperada, informada)) return null

  let payload: PayloadDoLinkDeSetup
  try {
    payload = JSON.parse(Buffer.from(codificado, 'base64url').toString('utf8'))
  } catch {
    return null
  }
  if (payload?.v !== 1 || payload.tipo !== 'setup') return null
  if (!('companyId' in payload)) return null
  const { companyId } = payload
  if (companyId !== null && (typeof companyId !== 'string' || !companyId)) return null
  if (typeof payload.exp !== 'number' || !Number.isFinite(payload.exp)) return null

  const agoraEmSegundos = agora.getTime() / 1000
  if (payload.exp <= agoraEmSegundos) return null
  if (payload.exp - agoraEmSegundos > ALCANCE_MAXIMO) return null

  return { companyId }
}
