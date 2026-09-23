import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { assinar, verificar } from './token'

const SEGREDO = 'segredo-de-teste'
const OUTRO_SEGREDO = 'segredo-diferente'
const COMPANY = 'b2489455-9691-43bd-a130-6e84296dad9c'
const AGORA = new Date('2026-09-15T17:00:00Z')

/** Monta um token com payload arbitrário, assinado corretamente. */
function tokenCom(payload: unknown, segredo = SEGREDO): string {
  const codificado = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = createHmac('sha256', segredo).update(codificado).digest('base64url')
  return `${codificado}.${sig}`
}

describe('ida e volta', () => {
  it('aceita o token que acabou de assinar', () => {
    const t = assinar(COMPANY, 3600, AGORA, SEGREDO)
    expect(verificar(t, AGORA, SEGREDO)).toEqual({
      companyId: COMPANY,
      expiraEm: Math.floor(AGORA.getTime() / 1000) + 3600,
    })
  })

  it('sem expiração devolve expiraEm null', () => {
    const t = assinar(COMPANY, null, AGORA, SEGREDO)
    expect(verificar(t, AGORA, SEGREDO)).toEqual({ companyId: COMPANY, expiraEm: null })
  })

  it('token sem expiração continua válido muito depois', () => {
    const t = assinar(COMPANY, null, AGORA, SEGREDO)
    const daquiADezAnos = new Date('2036-09-15T17:00:00Z')
    expect(verificar(t, daquiADezAnos, SEGREDO)?.companyId).toBe(COMPANY)
  })
})

describe('formato do payload na rede', () => {
  // O conjunto de campos é contrato com o Clinic Control. Se este teste
  // quebrar, o link emitido lá para de ser aceito aqui.
  it('trafega { v, slug, exp } — slug, não companyId', () => {
    const [codificado] = assinar(COMPANY, 600, AGORA, SEGREDO).split('.')
    const payload = JSON.parse(Buffer.from(codificado!, 'base64url').toString('utf8'))
    expect(Object.keys(payload).sort()).toEqual(['exp', 'slug', 'v'])
    expect(payload.v).toBe(1)
    expect(payload.slug).toBe(COMPANY)
  })

  it('aceita um token montado à mão no formato do emissor externo', () => {
    const t = tokenCom({ v: 1, slug: COMPANY, exp: null })
    expect(verificar(t, AGORA, SEGREDO)?.companyId).toBe(COMPANY)
  })
})

describe('expiração', () => {
  it('recusa token expirado', () => {
    const t = assinar(COMPANY, 600, AGORA, SEGREDO)
    const depois = new Date(AGORA.getTime() + 601_000)
    expect(verificar(t, depois, SEGREDO)).toBeNull()
  })

  it('aceita até o último instante', () => {
    const t = assinar(COMPANY, 600, AGORA, SEGREDO)
    const quaseLa = new Date(AGORA.getTime() + 599_000)
    expect(verificar(t, quaseLa, SEGREDO)).not.toBeNull()
  })
})

describe('recusa de token inválido', () => {
  it('recusa assinatura de outro segredo', () => {
    const t = assinar(COMPANY, 600, AGORA, OUTRO_SEGREDO)
    expect(verificar(t, AGORA, SEGREDO)).toBeNull()
  })

  it('recusa payload adulterado mantendo a assinatura antiga', () => {
    const t = assinar(COMPANY, 600, AGORA, SEGREDO)
    const [, sig] = t.split('.')
    const outro = Buffer.from(
      JSON.stringify({ v: 1, slug: 'outra-clinica', exp: null })
    ).toString('base64url')
    expect(verificar(`${outro}.${sig}`, AGORA, SEGREDO)).toBeNull()
  })

  it.each([
    ['', 'vazio'],
    ['sem-ponto', 'sem separador'],
    ['a.b.c', 'partes demais'],
    ['.', 'duas partes vazias'],
  ])('recusa %s (%s)', (token) => {
    expect(verificar(token, AGORA, SEGREDO)).toBeNull()
  })

  it.each([null, undefined])('recusa token ausente', (token) => {
    expect(verificar(token, AGORA, SEGREDO)).toBeNull()
  })

  it('não lança quando a assinatura tem tamanho diferente', () => {
    // timingSafeEqual lança com buffers de tamanhos distintos — o guarda de
    // tamanho precisa vir antes da comparação.
    const [codificado] = assinar(COMPANY, 600, AGORA, SEGREDO).split('.')
    expect(() => verificar(`${codificado}.curta`, AGORA, SEGREDO)).not.toThrow()
    expect(verificar(`${codificado}.curta`, AGORA, SEGREDO)).toBeNull()
  })
})

describe('assinatura válida, payload inaceitável', () => {
  // Estes só passam pelo HMAC porque são assinados com o segredo certo. O
  // ponto é não deixar um escopo vazio ou inesperado passar silenciosamente.
  const inaceitaveis: [unknown, string][] = [
    [{ v: 2, slug: COMPANY, exp: null }, 'versão desconhecida'],
    [{ v: 1, exp: null }, 'sem slug'],
    [{ v: 1, slug: '', exp: null }, 'slug vazio'],
    [{ v: 1, slug: 42, exp: null }, 'slug não é string'],
    [{ v: 1, slug: COMPANY, exp: 'amanhã' }, 'exp não é número'],
    [{ slug: COMPANY, exp: null }, 'sem versão'],
  ]

  it.each(inaceitaveis)('recusa %j (%s)', (payload) => {
    expect(verificar(tokenCom(payload), AGORA, SEGREDO)).toBeNull()
  })

  it('recusa payload que não é JSON', () => {
    const codificado = Buffer.from('nao sou json').toString('base64url')
    const sig = createHmac('sha256', SEGREDO).update(codificado).digest('base64url')
    expect(verificar(`${codificado}.${sig}`, AGORA, SEGREDO)).toBeNull()
  })

  it('recusa payload que é JSON mas não é objeto', () => {
    expect(verificar(tokenCom('so uma string'), AGORA, SEGREDO)).toBeNull()
    expect(verificar(tokenCom(null), AGORA, SEGREDO)).toBeNull()
  })
})
