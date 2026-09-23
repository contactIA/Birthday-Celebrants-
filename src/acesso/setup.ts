import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

// Credencial da tela de setup: senha da equipe e a sessão que ela abre.
//
// É um acesso SEPARADO do escopo de clínica, e a separação é criptográfica, não
// só de rota. A tela de setup lê e grava credenciais de TODAS as clínicas; o
// token de clínica dá acesso a UMA. Se os dois fossem assinados com a mesma
// chave e o mesmo formato, um link de clínica vazado viraria candidato a sessão
// de setup no primeiro descuido de verificação. Por isso a chave da sessão é
// DERIVADA (ver `chaveDaSessao`) e o payload carrega o tipo.
//
// Este arquivo só importa `node:crypto` de propósito: o script que gera o hash
// da senha (`scripts/gerar-hash-setup.mjs`) o importa direto pelo Node, sem
// bundler, e um import com alias `@/` quebraria ali.

// ─── Senha ──────────────────────────────────────────────────────────────────

/**
 * Parâmetros do scrypt. N=2^15 custa ~50ms e 32MB por verificação: lento o
 * bastante contra força bruta, rápido o bastante para um login humano.
 */
const SCRYPT = { N: 32768, r: 8, p: 1 }
const TAMANHO_DO_HASH = 32
/** Teto para parâmetros lidos do hash — um valor absurdo no .env não trava o processo. */
const N_MAXIMO = 2 ** 20
const MEMORIA_MAXIMA = 256 * 1024 * 1024

/**
 * Gera o hash armazenável: `scrypt.N.r.p.sal.hash`.
 *
 * Separado por PONTO, e não por `$` como é costume: o valor vai para o .env, que
 * o `deploy.sh` carrega com `source` e o compose lê com interpolação. Um `$`
 * seria lido como variável nos dois lugares e o hash chegaria truncado.
 */
export function gerarHashDeSenha(senha: string, sal: Buffer = randomBytes(16)): string {
  const hash = scryptSync(senha.normalize('NFKC'), sal, TAMANHO_DO_HASH, {
    ...SCRYPT,
    maxmem: MEMORIA_MAXIMA,
  })
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, sal.toString('base64url'), hash.toString('base64url')].join('.')
}

/** Confere a senha contra o hash armazenado. Hash malformado = não confere. */
export function senhaConfere(senha: string, armazenado: string): boolean {
  const partes = armazenado.split('.')
  if (partes.length !== 6 || partes[0] !== 'scrypt') return false

  const [N, r, p] = partes.slice(1, 4).map(Number) as [number, number, number]
  if (![N, r, p].every(Number.isInteger) || N < 2 || N > N_MAXIMO || r < 1 || p < 1) return false

  const sal = Buffer.from(partes[4]!, 'base64url')
  const esperado = Buffer.from(partes[5]!, 'base64url')
  if (sal.length === 0 || esperado.length === 0) return false

  const obtido = scryptSync(senha.normalize('NFKC'), sal, esperado.length, {
    N,
    r,
    p,
    maxmem: MEMORIA_MAXIMA,
  })
  return timingSafeEqual(esperado, obtido)
}

// ─── Sessão ─────────────────────────────────────────────────────────────────

/** Um turno de trabalho. Depois disso, senha de novo. */
export const TTL_SESSAO_SETUP = 60 * 60 * 8

export const COOKIE_SETUP = 'av_setup'

interface PayloadDaSessao {
  v: 1
  tipo: 'setup'
  exp: number
}

/**
 * A chave que assina a sessão, derivada de LINK_SECRET e do hash da senha.
 *
 * Derivar do LINK_SECRET evita mais um segredo para cadastrar; derivar TAMBÉM
 * do hash da senha faz a troca de senha derrubar toda sessão aberta — que é o
 * que se espera quando a senha vazou.
 */
function chaveDaSessao(linkSecret: string, hashDaSenha: string): Buffer {
  return createHmac('sha256', linkSecret).update(`setup-sessao:${hashDaSenha}`).digest()
}

function assinatura(codificado: string, chave: Buffer): string {
  return createHmac('sha256', chave).update(codificado).digest('base64url')
}

export function assinarSessao(agora: Date, linkSecret: string, hashDaSenha: string): string {
  const payload: PayloadDaSessao = {
    v: 1,
    tipo: 'setup',
    exp: Math.floor(agora.getTime() / 1000) + TTL_SESSAO_SETUP,
  }
  const codificado = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${codificado}.${assinatura(codificado, chaveDaSessao(linkSecret, hashDaSenha))}`
}

/** `true` só para sessão de setup válida e dentro da validade. Nunca lança. */
export function sessaoValida(
  token: string | null | undefined,
  agora: Date,
  linkSecret: string,
  hashDaSenha: string
): boolean {
  if (!token) return false
  const partes = token.split('.')
  if (partes.length !== 2) return false
  const [codificado, recebida] = partes as [string, string]

  // Autenticar antes de interpretar, como no token de clínica.
  const esperada = Buffer.from(assinatura(codificado, chaveDaSessao(linkSecret, hashDaSenha)))
  const informada = Buffer.from(recebida)
  if (esperada.length !== informada.length || !timingSafeEqual(esperada, informada)) return false

  let payload: PayloadDaSessao
  try {
    payload = JSON.parse(Buffer.from(codificado, 'base64url').toString('utf8'))
  } catch {
    return false
  }
  if (payload?.v !== 1 || payload.tipo !== 'setup' || typeof payload.exp !== 'number') return false
  return payload.exp > agora.getTime() / 1000
}

/**
 * Os dois segredos do setup, ou `null` quando falta algum.
 *
 * `null` e não exceção: setup não configurado é estado legítimo (o painel das
 * clínicas funciona sem ele), e quem chama responde 503 em vez de derrubar.
 */
export function segredosDoSetup(): { linkSecret: string; hashDaSenha: string } | null {
  const linkSecret = process.env.LINK_SECRET
  const hashDaSenha = process.env.SETUP_PASSWORD_HASH
  if (!linkSecret || !hashDaSenha) return null
  return { linkSecret, hashDaSenha }
}
