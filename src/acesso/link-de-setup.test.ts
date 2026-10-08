import { createHmac } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { assinarLinkDeSetup, VALIDADE_DO_LINK_DE_SETUP, verificarLinkDeSetup } from './link-de-setup'
import { assinar } from './token'
import { assinarSessao, gerarHashDeSenha, segredosDoSetup, senhaDesligadaPor, sessaoValida } from './setup'
import { decidirSetup } from './decisao-setup'

// O link com que o setup do CRM abre o setup deste app (CRM#219).

const SEGREDO_DO_LINK = 'segredo-so-do-link-de-setup'
const LINK_SECRET = 'segredo-dos-links-de-painel'
const AGORA = new Date('2026-10-08T12:00:00Z')
const CLINICA = '7b1a1c2e-0000-4000-8000-000000000000'
const HASH = gerarHashDeSenha('senha forte da equipe', Buffer.alloc(16, 7))

/** Assina um payload qualquer, como um emissor que erra o formato faria. */
function assinarPayload(payload: unknown, segredo = SEGREDO_DO_LINK): string {
  const codificado = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${codificado}.${createHmac('sha256', segredo).update(codificado).digest('base64url')}`
}

const emSegundos = (d: Date) => Math.floor(d.getTime() / 1000)

describe('verificarLinkDeSetup', () => {
  it('o formato do contrato: base64url do JSON e HMAC-SHA256 sobre o payload codificado', () => {
    const exp = emSegundos(AGORA) + VALIDADE_DO_LINK_DE_SETUP
    const feito = assinarPayload({ v: 1, tipo: 'setup', companyId: CLINICA, exp })
    expect(assinarLinkDeSetup(CLINICA, AGORA, SEGREDO_DO_LINK)).toBe(feito)
    expect(verificarLinkDeSetup(feito, AGORA, SEGREDO_DO_LINK)).toEqual({ companyId: CLINICA })
  })

  it('companyId null abre a lista', () => {
    const t = assinarLinkDeSetup(null, AGORA, SEGREDO_DO_LINK)
    expect(verificarLinkDeSetup(t, AGORA, SEGREDO_DO_LINK)).toEqual({ companyId: null })
  })

  it('vale por 120 segundos, e não depois', () => {
    const t = assinarLinkDeSetup(CLINICA, AGORA, SEGREDO_DO_LINK)
    expect(verificarLinkDeSetup(t, new Date(AGORA.getTime() + 119_000), SEGREDO_DO_LINK)).not.toBeNull()
    expect(verificarLinkDeSetup(t, new Date(AGORA.getTime() + 120_000), SEGREDO_DO_LINK)).toBeNull()
    expect(verificarLinkDeSetup(t, new Date(AGORA.getTime() + 3_600_000), SEGREDO_DO_LINK)).toBeNull()
  })

  it('um exp longe demais no futuro não vale, mesmo assinado', () => {
    const t = assinarPayload({ v: 1, tipo: 'setup', companyId: CLINICA, exp: emSegundos(AGORA) + 3600 })
    expect(verificarLinkDeSetup(t, AGORA, SEGREDO_DO_LINK)).toBeNull()
  })

  it('o segredo errado não vale', () => {
    const t = assinarLinkDeSetup(CLINICA, AGORA, 'outro-segredo')
    expect(verificarLinkDeSetup(t, AGORA, SEGREDO_DO_LINK)).toBeNull()
  })

  it('assinatura adulterada, ou payload trocado com a assinatura antiga, não vale', () => {
    const t = assinarLinkDeSetup(CLINICA, AGORA, SEGREDO_DO_LINK)
    const [payload, assinatura] = t.split('.') as [string, string]
    expect(verificarLinkDeSetup(`${payload}.${assinatura.slice(0, -2)}xx`, AGORA, SEGREDO_DO_LINK)).toBeNull()
    const outro = assinarLinkDeSetup('11111111-0000-4000-8000-000000000000', AGORA, SEGREDO_DO_LINK).split('.')[0]
    expect(verificarLinkDeSetup(`${outro}.${assinatura}`, AGORA, SEGREDO_DO_LINK)).toBeNull()
  })

  it.each([
    ['tipo de outro token', { v: 1, tipo: 'painel', companyId: CLINICA }],
    ['sem tipo', { v: 1, companyId: CLINICA }],
    ['outra versão', { v: 2, tipo: 'setup', companyId: CLINICA }],
    ['sem companyId', { v: 1, tipo: 'setup' }],
    ['companyId vazio', { v: 1, tipo: 'setup', companyId: '' }],
    ['companyId número', { v: 1, tipo: 'setup', companyId: 42 }],
  ])('assinado com o segredo certo, mas %s, não vale', (_, campos) => {
    const t = assinarPayload({ ...campos, exp: emSegundos(AGORA) + 60 })
    expect(verificarLinkDeSetup(t, AGORA, SEGREDO_DO_LINK)).toBeNull()
  })

  it('sem exp numérico não vale', () => {
    const t = assinarPayload({ v: 1, tipo: 'setup', companyId: CLINICA, exp: null })
    expect(verificarLinkDeSetup(t, AGORA, SEGREDO_DO_LINK)).toBeNull()
  })

  it('o link de painel nunca vale como link de setup, nem com o mesmo segredo', () => {
    const dePainel = assinar(CLINICA, 60, AGORA, SEGREDO_DO_LINK)
    expect(verificarLinkDeSetup(dePainel, AGORA, SEGREDO_DO_LINK)).toBeNull()
  })

  it('a sessão de setup não vale como link, e o link não vale como sessão', () => {
    const sessao = assinarSessao(AGORA, LINK_SECRET, HASH)
    expect(verificarLinkDeSetup(sessao, AGORA, SEGREDO_DO_LINK)).toBeNull()
    const link = assinarLinkDeSetup(CLINICA, AGORA, SEGREDO_DO_LINK)
    expect(sessaoValida(link, AGORA, LINK_SECRET, HASH)).toBe(false)
  })

  it.each([null, undefined, '', 'sem-ponto', 'a.b.c', '.'])('lixo (%s) não vale e não lança', (lixo) => {
    expect(verificarLinkDeSetup(lixo, AGORA, SEGREDO_DO_LINK)).toBeNull()
  })

  it('sem segredo, nada vale', () => {
    const t = assinarLinkDeSetup(CLINICA, AGORA, '')
    expect(verificarLinkDeSetup(t, AGORA, '')).toBeNull()
  })
})

describe('decidirSetup: o link do CRM', () => {
  const base = { agora: AGORA, linkSecret: LINK_SECRET, ancora: HASH, tokenDoCookie: null }

  it('o GET de /api/setup/entrar é público; os outros métodos não', () => {
    expect(decidirSetup({ ...base, caminho: '/api/setup/entrar', metodo: 'GET' })).toEqual({ tipo: 'publica' })
    expect(decidirSetup({ ...base, caminho: '/api/setup/entrar', metodo: 'POST' })).toEqual({ tipo: 'negar' })
  })
})

describe('senhaDesligadaPor', () => {
  it.each(['1', 'true', 'TRUE', ' true '])('%s desliga', (v) => expect(senhaDesligadaPor(v)).toBe(true))
  it.each([undefined, '', '0', 'false', 'sim', 'ligado', 'yes'])('%s deixa ligada', (v) =>
    expect(senhaDesligadaPor(v)).toBe(false)
  )
})

describe('segredosDoSetup', () => {
  const VARIAVEIS = ['LINK_SECRET', 'SETUP_PASSWORD_HASH', 'SETUP_LINK_SEGREDO', 'SETUP_SENHA_DESLIGADA']

  beforeEach(() => {
    for (const v of VARIAVEIS) vi.stubEnv(v, '')
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('só a senha, como hoje: a âncora é o hash e não há link', () => {
    vi.stubEnv('LINK_SECRET', LINK_SECRET)
    vi.stubEnv('SETUP_PASSWORD_HASH', HASH)
    expect(segredosDoSetup()).toEqual({
      linkSecret: LINK_SECRET,
      hashDaSenha: HASH,
      segredoDoLink: null,
      senhaDesligada: false,
      ancora: HASH,
    })
  })

  it('com o link, a âncora segue o hash: as sessões abertas pela senha continuam valendo', () => {
    vi.stubEnv('LINK_SECRET', LINK_SECRET)
    vi.stubEnv('SETUP_PASSWORD_HASH', HASH)
    vi.stubEnv('SETUP_LINK_SEGREDO', SEGREDO_DO_LINK)
    expect(segredosDoSetup()).toMatchObject({ segredoDoLink: SEGREDO_DO_LINK, ancora: HASH })
  })

  it('sem senha, o link basta, e a chave da sessão não é o segredo do link', () => {
    vi.stubEnv('LINK_SECRET', LINK_SECRET)
    vi.stubEnv('SETUP_LINK_SEGREDO', SEGREDO_DO_LINK)
    vi.stubEnv('SETUP_SENHA_DESLIGADA', '1')
    const s = segredosDoSetup()
    expect(s).toMatchObject({ hashDaSenha: null, senhaDesligada: true })
    expect(s?.ancora).not.toBe(SEGREDO_DO_LINK)
    // A sessão assinada com essa âncora não se confunde com um link.
    const sessao = assinarSessao(AGORA, LINK_SECRET, s!.ancora)
    expect(verificarLinkDeSetup(sessao, AGORA, SEGREDO_DO_LINK)).toBeNull()
  })

  it('o segredo do link igual ao LINK_SECRET não vale: os dois têm de ser diferentes', () => {
    vi.stubEnv('LINK_SECRET', LINK_SECRET)
    vi.stubEnv('SETUP_PASSWORD_HASH', HASH)
    vi.stubEnv('SETUP_LINK_SEGREDO', LINK_SECRET)
    expect(segredosDoSetup()?.segredoDoLink).toBeNull()
  })

  it('sem LINK_SECRET, ou sem senha e sem link, o setup não abre', () => {
    vi.stubEnv('SETUP_PASSWORD_HASH', HASH)
    expect(segredosDoSetup()).toBeNull()
    vi.stubEnv('LINK_SECRET', LINK_SECRET)
    vi.stubEnv('SETUP_PASSWORD_HASH', '')
    expect(segredosDoSetup()).toBeNull()
  })
})
