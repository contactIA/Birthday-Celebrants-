import { createDecipheriv } from 'node:crypto'

// O decifrador dos segredos do cadastro comum (ADR 0014, issue #210).
//
// É o arquivo que os Aniversariantes e os Lembretes copiam como está, para ler o
// que as visões do esquema `cadastro` trazem cifrado: o token da plataforma
// (cadastro.clinicas.token_plataforma_cifrado) e as credenciais do prontuário
// (cadastro.unidades.prontuario_credenciais_cifradas). Por isso não importa nada
// além do node:crypto, e roda só no servidor.
//
//   · O formato: AES-256-GCM, "iv:tag:cifrado", as três partes em base64 (iv de
//     12 bytes, tag de 16). É o mesmo do CRM (src/infra/cripto/cripto.ts).
//   · A chave: CADASTRO_CHAVE_CIFRAGEM, 32 bytes em base64, a mesma nos três .env.
//     Não é a CRM_CHAVE_CIFRAGEM, que abre também as chaves da API e os segredos
//     dos webhooks.
//   · As credenciais são um JSON: no Clinicorp, { usuario, token, subscriberId,
//     baseUrl }; no eClinica, { token, baseUrl }.
//
// Mudou aqui, muda nas cópias: o teste ao lado (decifrador-do-cadastro.test.ts)
// vai junto, e o valor de exemplo dele precisa abrir igual nos três apps.

/** As credenciais do Clinicorp, como saem de `prontuario_credenciais_cifradas`. */
export interface CredenciaisDoClinicorpNoCadastro {
  usuario: string
  token: string
  subscriberId: string
  baseUrl: string
}

/** As credenciais do eClinica, como saem de `prontuario_credenciais_cifradas`. */
export interface CredenciaisDoEclinicaNoCadastro {
  token: string
  baseUrl: string
}

/** A chave do cadastro, do .env (ou do texto dado), conferida: 32 bytes em base64. */
export function chaveDoCadastro(texto: string | undefined = process.env.CADASTRO_CHAVE_CIFRAGEM): Buffer {
  if (!texto) throw new Error('CADASTRO_CHAVE_CIFRAGEM ausente: configure a chave do cadastro no .env')
  const chave = Buffer.from(texto, 'base64')
  if (chave.length !== 32) throw new Error('CADASTRO_CHAVE_CIFRAGEM precisa ter 32 bytes em base64')
  return chave
}

/** Abre um valor "iv:tag:cifrado". Chave errada ou valor adulterado: erro, nunca texto trocado. */
export function decifrarDoCadastro(guardado: string, chave: Buffer = chaveDoCadastro()): string {
  const partes = guardado.split(':')
  if (partes.length !== 3 || partes.some((p) => !p)) throw new Error('valor cifrado do cadastro em formato inesperado')
  const [iv, tag, cifrado] = partes as [string, string, string]
  const decifra = createDecipheriv('aes-256-gcm', chave, Buffer.from(iv, 'base64'))
  decifra.setAuthTag(Buffer.from(tag, 'base64'))
  return Buffer.concat([decifra.update(Buffer.from(cifrado, 'base64')), decifra.final()]).toString('utf8')
}

const CAMPOS_DAS_CREDENCIAIS = {
  clinicorp: ['usuario', 'token', 'subscriberId', 'baseUrl'],
  eclinica: ['token', 'baseUrl'],
} as const

/**
 * Abre as credenciais do prontuário de uma unidade (o JSON cifrado), pelo sistema
 * que vem junto na visão (`prontuario_sistema`). Falta um campo: erro.
 */
export function decifrarCredenciaisDoCadastro(sistema: 'clinicorp', guardado: string, chave?: Buffer): CredenciaisDoClinicorpNoCadastro
export function decifrarCredenciaisDoCadastro(sistema: 'eclinica', guardado: string, chave?: Buffer): CredenciaisDoEclinicaNoCadastro
export function decifrarCredenciaisDoCadastro(
  sistema: 'clinicorp' | 'eclinica',
  guardado: string,
  chave: Buffer = chaveDoCadastro()
): CredenciaisDoClinicorpNoCadastro | CredenciaisDoEclinicaNoCadastro {
  const campos = CAMPOS_DAS_CREDENCIAIS[sistema]
  if (!campos) throw new Error(`sistema de prontuário desconhecido: ${String(sistema)}`)
  const lidas: unknown = JSON.parse(decifrarDoCadastro(guardado, chave))
  if (typeof lidas !== 'object' || lidas === null || Array.isArray(lidas)) throw new Error('credenciais do cadastro em formato inesperado')
  const registro = lidas as Record<string, unknown>
  const credenciais: Record<string, string> = {}
  for (const campo of campos) {
    const valor = registro[campo]
    if (typeof valor !== 'string' || !valor) throw new Error(`credenciais do ${sistema} sem o campo ${campo}`)
    credenciais[campo] = valor
  }
  return credenciais as unknown as CredenciaisDoClinicorpNoCadastro | CredenciaisDoEclinicaNoCadastro
}
