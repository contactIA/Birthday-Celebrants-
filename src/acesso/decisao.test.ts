import { describe, it, expect } from 'vitest'
import { decidir, TTL_ESCOPO_DO_HOST, type Entrada } from './decisao'
import { assinar, verificar } from './token'

const SEGREDO = 'segredo-de-teste'
const CLINICA_A = 'b2489455-9691-43bd-a130-6e84296dad9c'
const CLINICA_B = '79a15d58-9d7b-4420-a75e-985267e9c8ed'
const AGORA = new Date('2026-09-15T17:00:00Z')

function entrada(over: Partial<Entrada> = {}): Entrada {
  return {
    tokenDaUrl: null,
    companyIdDaUrl: null,
    referer: null,
    tokenDoCookie: null,
    hostsPermitidos: ['app.fluxodonto.com'],
    agora: AGORA,
    segredo: SEGREDO,
    navegacaoDeEntrada: false,
    ...over,
  }
}

describe('sem credencial nenhuma', () => {
  it('nega requisição vazia', () => {
    expect(decidir(entrada())).toEqual({ tipo: 'negar', motivo: 'sem-token' })
  })

  it('nega company id na URL sem Referer', () => {
    expect(decidir(entrada({ companyIdDaUrl: CLINICA_A }))).toEqual({
      tipo: 'negar',
      motivo: 'sem-token',
    })
  })

  it('nega token forjado', () => {
    const forjado = assinar(CLINICA_A, 600, AGORA, 'outro-segredo')
    expect(decidir(entrada({ tokenDaUrl: forjado })).tipo).toBe('negar')
  })
})

describe('token assinado na URL (botão interno)', () => {
  it('aceita e pede para limpar o ?t= da URL', () => {
    const t = assinar(CLINICA_A, 600, AGORA, SEGREDO)
    const d = decidir(entrada({ tokenDaUrl: t, companyIdDaUrl: CLINICA_A }))
    expect(d).toEqual({
      tipo: 'seguir',
      companyId: CLINICA_A,
      novoToken: t,
      limparTokenDaUrl: true,
    })
  })

  it('token expirado na URL não serve', () => {
    const t = assinar(CLINICA_A, 600, AGORA, SEGREDO)
    const depois = new Date(AGORA.getTime() + 601_000)
    expect(decidir(entrada({ tokenDaUrl: t, agora: depois })).tipo).toBe('negar')
  })
})

describe('white label: clínica informada pelo host', () => {
  const doHost = { companyIdDaUrl: CLINICA_A, referer: 'https://app.fluxodonto.com/inbox' }

  it('aceita quando o Referer é de host autorizado', () => {
    const d = decidir(entrada(doHost))
    expect(d.tipo).toBe('seguir')
    if (d.tipo !== 'seguir') return
    expect(d.companyId).toBe(CLINICA_A)
    expect(d.novoToken).not.toBeNull()
    // NÃO redireciona: não há `?t=` a remover, e o `?clinica=` precisa ficar.
    expect(d.limparTokenDaUrl).toBe(false)
  })

  it('o token que emitimos vale 12h', () => {
    const d = decidir(entrada(doHost))
    if (d.tipo !== 'seguir' || !d.novoToken) throw new Error('esperava seguir')
    const escopo = verificar(d.novoToken, AGORA, SEGREDO)
    expect(escopo?.expiraEm).toBe(Math.floor(AGORA.getTime() / 1000) + TTL_ESCOPO_DO_HOST)
  })

  it('aceita subdomínio do host autorizado', () => {
    const d = decidir(entrada({ ...doHost, referer: 'https://cliente.app.fluxodonto.com/x' }))
    expect(d.tipo).toBe('seguir')
  })

  it('recusa Referer de outro host', () => {
    const d = decidir(entrada({ ...doHost, referer: 'https://site-qualquer.com/x' }))
    expect(d.tipo).toBe('negar')
  })

  it('recusa host que só termina parecido', () => {
    // "malapp.fluxodonto.com" não é subdomínio de "app.fluxodonto.com".
    const d = decidir(entrada({ ...doHost, referer: 'https://malapp.fluxodonto.com/x' }))
    expect(d.tipo).toBe('negar')
  })

  it('recusa Referer que não é URL', () => {
    const d = decidir(entrada({ ...doHost, referer: 'nao-sou-url' }))
    expect(d.tipo).toBe('negar')
  })

  it.each([
    ['{idaccount}', 'placeholder não substituído'],
    ['oral-foz', 'slug legível, não é company id'],
    ['123', 'lixo'],
  ])('recusa %s (%s)', (companyIdDaUrl) => {
    const d = decidir(entrada({ ...doHost, companyIdDaUrl }))
    expect(d.tipo).toBe('negar')
  })
})

describe('cookie', () => {
  it('aceita o cookie quando a URL não traz nada', () => {
    const t = assinar(CLINICA_A, null, AGORA, SEGREDO)
    const d = decidir(entrada({ tokenDoCookie: t }))
    expect(d).toEqual({
      tipo: 'seguir',
      companyId: CLINICA_A,
      novoToken: null, // nada a regravar
      limparTokenDaUrl: false,
    })
  })

  it('token da URL tem prioridade sobre o cookie', () => {
    const cookie = assinar(CLINICA_A, null, AGORA, SEGREDO)
    const url = assinar(CLINICA_B, 600, AGORA, SEGREDO)
    const d = decidir(entrada({ tokenDoCookie: cookie, tokenDaUrl: url }))
    expect(d.tipo).toBe('seguir')
    if (d.tipo === 'seguir') expect(d.companyId).toBe(CLINICA_B)
  })
})

describe('escopo divergente', () => {
  // O vazamento real: um link de UMA clínica colado na aba que vale para TODAS.
  it('recusa quando o cookie é de outra clínica e a URL declara a certa', () => {
    const cookieDaOutra = assinar(CLINICA_B, null, AGORA, SEGREDO)
    const d = decidir(
      entrada({
        tokenDoCookie: cookieDaOutra,
        companyIdDaUrl: CLINICA_A,
        referer: 'https://app.fluxodonto.com/inbox',
      })
    )
    // O caminho do host resolve para A e o cookie de B é ignorado — mas o que
    // importa é nunca servir B enquanto a URL diz A.
    expect(d.tipo === 'negar' || (d.tipo === 'seguir' && d.companyId === CLINICA_A)).toBe(true)
  })

  it('recusa cookie de outra clínica quando a URL declara a certa sem Referer', () => {
    const cookieDaOutra = assinar(CLINICA_B, null, AGORA, SEGREDO)
    const d = decidir(entrada({ tokenDoCookie: cookieDaOutra, companyIdDaUrl: CLINICA_A }))
    expect(d).toEqual({ tipo: 'negar', motivo: 'escopo-divergente' })
  })

  it('recusa token assinado de uma clínica com a URL declarando outra', () => {
    const t = assinar(CLINICA_B, 600, AGORA, SEGREDO)
    const d = decidir(entrada({ tokenDaUrl: t, companyIdDaUrl: CLINICA_A }))
    expect(d).toEqual({ tipo: 'negar', motivo: 'escopo-divergente' })
  })

  it('placeholder literal não serve a clínica do último cookie', () => {
    const cookie = assinar(CLINICA_A, null, AGORA, SEGREDO)
    const d = decidir(entrada({ tokenDoCookie: cookie, companyIdDaUrl: '{idaccount}' }))
    expect(d).toEqual({ tipo: 'negar', motivo: 'escopo-divergente' })
  })
})

describe('navegação de entrada exige a clínica na URL', () => {
  // O vazamento que motivou a regra: abrir o endereço sem parâmetro mostrava a
  // última clínica vista naquele navegador, porque o cookie vencia sozinho.
  const cookieDaA = assinar(CLINICA_A, null, AGORA, SEGREDO)

  it('entrada sem nada na URL é recusada MESMO com cookie válido', () => {
    expect(decidir(entrada({ navegacaoDeEntrada: true, tokenDoCookie: cookieDaA }))).toEqual({
      tipo: 'negar',
      motivo: 'sem-escopo-na-url',
    })
  })

  it('dentro do app (navegação interna, chamadas da tela), o cookie continua valendo', () => {
    const d = decidir(entrada({ navegacaoDeEntrada: false, tokenDoCookie: cookieDaA }))
    expect(d).toMatchObject({ tipo: 'seguir', companyId: CLINICA_A })
  })

  it('entrada com ?clinica= da mesma clínica do cookie segue (F5, link do próprio app)', () => {
    const d = decidir(entrada({ navegacaoDeEntrada: true, tokenDoCookie: cookieDaA, companyIdDaUrl: CLINICA_A }))
    expect(d).toMatchObject({ tipo: 'seguir', companyId: CLINICA_A })
  })

  it('entrada com ?clinica= de OUTRA clínica continua recusada', () => {
    const d = decidir(entrada({ navegacaoDeEntrada: true, tokenDoCookie: cookieDaA, companyIdDaUrl: CLINICA_B }))
    expect(d).toEqual({ tipo: 'negar', motivo: 'escopo-divergente' })
  })

  it('entrada pela aba da plataforma (Referer do host) segue', () => {
    const d = decidir(
      entrada({ navegacaoDeEntrada: true, companyIdDaUrl: CLINICA_B, referer: 'https://app.fluxodonto.com/' })
    )
    expect(d).toMatchObject({ tipo: 'seguir', companyId: CLINICA_B })
  })

  it('entrada com link assinado (?t=) segue e pede para trocar o token pela clínica na URL', () => {
    const token = assinar(CLINICA_A, 3600, AGORA, SEGREDO)
    const d = decidir(entrada({ navegacaoDeEntrada: true, tokenDaUrl: token }))
    expect(d).toMatchObject({ tipo: 'seguir', companyId: CLINICA_A, limparTokenDaUrl: true })
  })
})
