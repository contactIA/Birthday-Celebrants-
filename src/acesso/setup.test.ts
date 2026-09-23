import { describe, expect, it } from 'vitest'
import { assinar } from './token'
import { assinarSessao, gerarHashDeSenha, senhaConfere, sessaoValida, TTL_SESSAO_SETUP } from './setup'
import { decidirSetup, ehRotaDeSetup } from './decisao-setup'

const LINK_SECRET = 'segredo-dos-links'
const AGORA = new Date('2026-09-23T12:00:00Z')
// Sal fixo: o hash fica determinístico e o teste não depende de sorteio.
const HASH = gerarHashDeSenha('senha forte da equipe', Buffer.alloc(16, 7))

describe('senha', () => {
  it('confere a senha certa', () => {
    expect(senhaConfere('senha forte da equipe', HASH)).toBe(true)
  })

  it('recusa a senha errada', () => {
    expect(senhaConfere('senha forte da equipE', HASH)).toBe(false)
  })

  it('o hash não tem `$` — o .env é lido com `source` e com interpolação', () => {
    expect(HASH).not.toContain('$')
    expect(HASH.split('.')).toHaveLength(6)
  })

  it('sal diferente, hash diferente, e os dois conferem', () => {
    const outro = gerarHashDeSenha('senha forte da equipe')
    expect(outro).not.toBe(HASH)
    expect(senhaConfere('senha forte da equipe', outro)).toBe(true)
  })

  it.each([
    ['vazio', ''],
    ['outro algoritmo', HASH.replace('scrypt', 'bcrypt')],
    ['partes faltando', HASH.split('.').slice(0, 4).join('.')],
    ['N absurdo', HASH.replace('.32768.', '.99999999.')],
    ['hash vazio', HASH.split('.').slice(0, 5).join('.') + '.'],
  ])('hash malformado (%s) não confere e não lança', (_, malformado) => {
    expect(senhaConfere('senha forte da equipe', malformado)).toBe(false)
  })
})

describe('sessão', () => {
  const token = assinarSessao(AGORA, LINK_SECRET, HASH)

  it('vale logo depois de emitida', () => {
    expect(sessaoValida(token, AGORA, LINK_SECRET, HASH)).toBe(true)
  })

  it('expira depois do TTL', () => {
    const depois = new Date(AGORA.getTime() + (TTL_SESSAO_SETUP + 1) * 1000)
    expect(sessaoValida(token, depois, LINK_SECRET, HASH)).toBe(false)
  })

  it('trocar a senha derruba a sessão aberta', () => {
    const novoHash = gerarHashDeSenha('senha nova', Buffer.alloc(16, 9))
    expect(sessaoValida(token, AGORA, LINK_SECRET, novoHash)).toBe(false)
  })

  it('trocar o LINK_SECRET derruba a sessão aberta', () => {
    expect(sessaoValida(token, AGORA, 'outro-segredo', HASH)).toBe(false)
  })

  it('token de CLÍNICA nunca vale como sessão de setup', () => {
    // O cookie de escopo é emitido para qualquer um que abra a aba da
    // plataforma. Se ele passasse aqui, a aba daria acesso a todas as clínicas.
    const deClinica = assinar('7b1a1c2e-0000-4000-8000-000000000000', 3600, AGORA, LINK_SECRET)
    expect(sessaoValida(deClinica, AGORA, LINK_SECRET, HASH)).toBe(false)
  })

  it('assinatura adulterada não vale', () => {
    const [payload] = token.split('.')
    expect(sessaoValida(`${payload}.xxxx`, AGORA, LINK_SECRET, HASH)).toBe(false)
  })

  it.each([null, undefined, '', 'sem-ponto', 'a.b.c'])('lixo (%s) não vale e não lança', (lixo) => {
    expect(sessaoValida(lixo, AGORA, LINK_SECRET, HASH)).toBe(false)
  })
})

describe('ehRotaDeSetup', () => {
  it.each(['/setup', '/setup/entrar', '/setup/clinicas/abc', '/api/setup', '/api/setup/clinicas'])(
    '%s é setup',
    (caminho) => expect(ehRotaDeSetup(caminho)).toBe(true)
  )

  it.each(['/', '/modelos', '/setupX', '/api/setupx', '/api/clinica', '/api/cron/reconciliar-status'])(
    '%s NÃO é setup — continua no gate de clínica',
    (caminho) => expect(ehRotaDeSetup(caminho)).toBe(false)
  )
})

describe('decidirSetup', () => {
  const base = { agora: AGORA, linkSecret: LINK_SECRET, hashDaSenha: HASH, tokenDoCookie: null }
  const sessao = assinarSessao(AGORA, LINK_SECRET, HASH)

  it('a tela de entrar é pública', () => {
    expect(decidirSetup({ ...base, caminho: '/setup/entrar', metodo: 'GET' })).toEqual({ tipo: 'publica' })
  })

  it('o POST de login é público; o DELETE (sair) não', () => {
    expect(decidirSetup({ ...base, caminho: '/api/setup/sessao', metodo: 'POST' }).tipo).toBe('publica')
    expect(decidirSetup({ ...base, caminho: '/api/setup/sessao', metodo: 'DELETE' }).tipo).toBe('negar')
  })

  it('página sem sessão vai para a tela de entrar', () => {
    expect(decidirSetup({ ...base, caminho: '/setup', metodo: 'GET' })).toEqual({ tipo: 'entrar' })
  })

  it('API sem sessão é negada — sem redirect, que o fetch seguiria calado', () => {
    expect(decidirSetup({ ...base, caminho: '/api/setup/clinicas', metodo: 'GET' })).toEqual({ tipo: 'negar' })
  })

  it('com sessão válida, segue', () => {
    expect(
      decidirSetup({ ...base, tokenDoCookie: sessao, caminho: '/api/setup/clinicas', metodo: 'POST' })
    ).toEqual({ tipo: 'seguir' })
  })
})
