import { createCipheriv, randomBytes } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import { chaveDoCadastro, decifrarCredenciaisDoCadastro, decifrarDoCadastro } from './decifrador-do-cadastro'

// O teste do decifrador do cadastro. Vai junto com o arquivo para os apps irmãos
// (Aniversariantes e Lembretes) e não importa nada do CRM: o valor de exemplo
// abaixo precisa abrir igual nos três.

/** A chave de exemplo (32 bytes 0x07) e um valor cifrado com ela. Nunca use em produção. */
const CHAVE_DE_EXEMPLO = 'BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc='
const CIFRADO_DE_EXEMPLO =
  'AAECAwQFBgcICQoL:kuHWF9D4zph+psCAA4MplA==:Y6OcA2hoqyAYkN++gygFuoJQ3+BxARYTOuwX1eWyAyfkTTKN/OIAz8fH75QvgtdAl0I1G7GnrfJTdZb80qVtoCkgbcj1cTSySlTU2WT9R6CQcKOqMk1U2Y/2GWY9G3Et3p59fGFabn+7RD4oFmoS87R4Vr2i'

/** Cifra como o CRM cifra: AES-256-GCM, iv de 12 bytes, "iv:tag:cifrado" em base64. */
function cifrarComo(texto: string, chave: Buffer): string {
  const iv = randomBytes(12)
  const cifra = createCipheriv('aes-256-gcm', chave, iv)
  const cifrado = Buffer.concat([cifra.update(texto, 'utf8'), cifra.final()])
  return [iv.toString('base64'), cifra.getAuthTag().toString('base64'), cifrado.toString('base64')].join(':')
}

const chave = () => chaveDoCadastro(CHAVE_DE_EXEMPLO)
const envAntes = process.env.CADASTRO_CHAVE_CIFRAGEM
afterEach(() => {
  if (envAntes === undefined) delete process.env.CADASTRO_CHAVE_CIFRAGEM
  else process.env.CADASTRO_CHAVE_CIFRAGEM = envAntes
})

describe('o decifrador do cadastro', () => {
  it('abre o valor de exemplo, o mesmo nos três apps', () => {
    expect(decifrarCredenciaisDoCadastro('clinicorp', CIFRADO_DE_EXEMPLO, chave())).toEqual({
      usuario: 'api@clinica',
      token: 'tok-123',
      subscriberId: 'prevodonto',
      baseUrl: 'https://api.clinicorp.com/rest/v1',
    })
  })

  it('abre o que foi cifrado no formato do CRM, inclusive acentos', () => {
    expect(decifrarDoCadastro(cifrarComo('token-da-clínica', chave()), chave())).toBe('token-da-clínica')
  })

  it('lê a chave do .env quando não se passa nenhuma', () => {
    process.env.CADASTRO_CHAVE_CIFRAGEM = CHAVE_DE_EXEMPLO
    expect(decifrarDoCadastro(cifrarComo('abc', chave()))).toBe('abc')
  })

  it('com a chave errada ou o valor adulterado, dá erro, e nunca um texto trocado', () => {
    const outra = randomBytes(32)
    expect(() => decifrarDoCadastro(CIFRADO_DE_EXEMPLO, outra)).toThrow()
    const [iv, tag, cifrado] = CIFRADO_DE_EXEMPLO.split(':') as [string, string, string]
    const adulterado = [iv, tag, Buffer.from(Buffer.from(cifrado, 'base64').map((b, i) => (i === 0 ? b ^ 1 : b))).toString('base64')].join(':')
    expect(() => decifrarDoCadastro(adulterado, chave())).toThrow()
  })

  it('recusa valor fora do formato e chave sem 32 bytes', () => {
    expect(() => decifrarDoCadastro('so-um-pedaco', chave())).toThrow(/formato inesperado/)
    expect(() => decifrarDoCadastro('a::c', chave())).toThrow(/formato inesperado/)
    expect(() => chaveDoCadastro(Buffer.alloc(16).toString('base64'))).toThrow(/32 bytes/)
    delete process.env.CADASTRO_CHAVE_CIFRAGEM
    expect(() => chaveDoCadastro()).toThrow(/CADASTRO_CHAVE_CIFRAGEM ausente/)
  })

  it('as credenciais do eClinica têm token e endereço, e campo que falta é erro', () => {
    const eclinica = cifrarComo(JSON.stringify({ token: 't', baseUrl: 'https://eclinica.app/api/v2' }), chave())
    expect(decifrarCredenciaisDoCadastro('eclinica', eclinica, chave())).toEqual({ token: 't', baseUrl: 'https://eclinica.app/api/v2' })
    expect(() => decifrarCredenciaisDoCadastro('clinicorp', eclinica, chave())).toThrow(/sem o campo usuario/)
    expect(() => decifrarCredenciaisDoCadastro('eclinica', cifrarComo('[1]', chave()), chave())).toThrow(/formato inesperado/)
  })
})
