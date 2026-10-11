import { describe, expect, it } from 'vitest'
import { canalDoRemetente, envioDoModelo, equipeDoCanal, motivoDeNaoSair, type UnidadeQueEnvia } from './canal-do-modelo'

const RECEPCAO = { id: 'c1', numero: '556231930175', nome: 'Recepção', ativo: true }
const COMERCIAL = { id: 'c2', numero: '5571981270357', nome: 'Comercial', ativo: true }
const ANTIGO = { id: 'c3', numero: '5562999990000', nome: 'Antigo', ativo: false }
const MEIER = { id: 'c4', numero: '5521988887777', nome: 'Méier', ativo: true }
const CANAIS = [RECEPCAO, COMERCIAL, ANTIGO, MEIER]

/** Sem o cadastro comum: só o remetente vale, como antes de 2026-10-10. */
const LOCAL: UnidadeQueEnvia = { from: '556231930175', equipeId: null, deOutrasUnidades: null }
/** Com o cadastro comum: o Méier é de outra unidade; os outros números estão livres. */
const CADASTRO: UnidadeQueEnvia = {
  from: '556231930175',
  equipeId: 'eq-recepcao',
  deOutrasUnidades: [{ canalId: 'c4', unidade: 'Méier' }],
}

const EQ_RECEPCAO = { id: 'eq-recepcao', nome: 'Recepção', padrao: false, canais: ['c1'] }
const EQ_PADRAO = { id: 'eq-padrao', nome: 'Geral', padrao: true, canais: ['c1', 'c2'] as string[] }
const EQ_VENDAS = { id: 'eq-vendas', nome: 'Vendas', padrao: false, canais: 'todos' as const }
const EQ_APOIO = { id: 'eq-apoio', nome: 'Apoio', padrao: false, canais: ['c2'] }

describe('canalDoRemetente', () => {
  it('casa por dígitos, em qualquer formato', () => {
    expect(canalDoRemetente('(62) 3193-0175', [RECEPCAO, COMERCIAL])).toBe(RECEPCAO)
  })

  it('sem remetente e um só canal ativo: é ele', () => {
    expect(canalDoRemetente(null, [RECEPCAO, ANTIGO])).toBe(RECEPCAO)
  })

  it('sem remetente e vários canais: não dá para saber', () => {
    expect(canalDoRemetente(null, [RECEPCAO, COMERCIAL])).toBeNull()
  })

  it('remetente que não é canal ativo da conta', () => {
    expect(canalDoRemetente('5562999990000', [RECEPCAO, ANTIGO])).toBeNull()
  })
})

describe('equipeDoCanal', () => {
  it('a da unidade, quando atende o número', () => {
    expect(equipeDoCanal('c1', 'eq-recepcao', [EQ_PADRAO, EQ_RECEPCAO])).toBe(EQ_RECEPCAO)
  })

  it('a da unidade não atende: a padrão, se atende', () => {
    expect(equipeDoCanal('c2', 'eq-recepcao', [EQ_APOIO, EQ_RECEPCAO, EQ_PADRAO])).toBe(EQ_PADRAO)
  })

  it('nem a da unidade nem a padrão: a que atende, e a primeira pelo nome quando são várias', () => {
    expect(equipeDoCanal('c4', 'eq-recepcao', [EQ_RECEPCAO, EQ_PADRAO, EQ_VENDAS])).toBe(EQ_VENDAS)
    const outraQueAtende = { ...EQ_APOIO, canais: ['c4'] }
    expect(equipeDoCanal('c4', null, [EQ_VENDAS, outraQueAtende])).toBe(outraQueAtende)
  })

  it('nenhuma atende', () => {
    expect(equipeDoCanal('c4', 'eq-recepcao', [EQ_RECEPCAO, EQ_PADRAO])).toBeNull()
  })
})

describe('envioDoModelo, sem o cadastro comum (só o remetente)', () => {
  it('modelo do número da clínica', () => {
    expect(envioDoModelo('c1', LOCAL, CANAIS)).toEqual({
      numero: { numero: '556231930175', nome: 'Recepção' },
      remetente: { numero: '556231930175', nome: 'Recepção' },
      saiPeloRemetente: true,
      porOutroNumero: false,
      equipe: null,
      permitido: true,
      recusa: null,
    })
  })

  it('modelo de outro número (o caso de 2026-10-09)', () => {
    const envio = envioDoModelo('c2', LOCAL, CANAIS)
    expect(envio).toMatchObject({ saiPeloRemetente: false, permitido: false, porOutroNumero: false })
    expect(motivoDeNaoSair(envio)).toMatch(/é do número \(71\) 98127-0357, e esta clínica agenda pelo \(62\) 3193-0175/)
  })

  it('modelo de um canal que saiu da conta', () => {
    const envio = envioDoModelo('sumiu', LOCAL, [RECEPCAO])
    expect(envio).toMatchObject({ numero: null, saiPeloRemetente: false, permitido: false })
    expect(motivoDeNaoSair(envio)).toMatch(/não está mais na conta/)
  })

  it('modelo que não diz o canal: mostra sem acusar', () => {
    const envio = envioDoModelo(null, LOCAL, [RECEPCAO])
    expect(envio).toMatchObject({ numero: null, saiPeloRemetente: null, permitido: null })
    expect(motivoDeNaoSair(envio)).toBeNull()
  })

  it('sem remetente identificado: mostra o número, não acusa', () => {
    const envio = envioDoModelo('c2', { ...LOCAL, from: null }, [RECEPCAO, COMERCIAL])
    expect(envio).toMatchObject({ numero: { numero: '5571981270357' }, remetente: null, saiPeloRemetente: null, permitido: null })
    expect(motivoDeNaoSair(envio)).toBeNull()
  })
})

describe('envioDoModelo, com o cadastro comum (qualquer número que não seja de outra unidade)', () => {
  it('modelo do remetente: sai como antes, sem escolher equipe', () => {
    const envio = envioDoModelo('c1', CADASTRO, CANAIS, [EQ_PADRAO])
    expect(envio).toMatchObject({ saiPeloRemetente: true, porOutroNumero: false, equipe: null, permitido: true })
  })

  it('modelo de outro número livre da conta: sai por ele (o caso da Odontho)', () => {
    const envio = envioDoModelo('c2', CADASTRO, CANAIS)
    expect(envio).toMatchObject({
      numero: { numero: '5571981270357' },
      saiPeloRemetente: false,
      porOutroNumero: true,
      equipe: null,
      permitido: true,
    })
    expect(motivoDeNaoSair(envio)).toBeNull()
  })

  it('com as equipes, escolhe a que agenda pelo número do modelo', () => {
    const envio = envioDoModelo('c2', CADASTRO, CANAIS, [EQ_RECEPCAO, EQ_PADRAO])
    expect(envio).toMatchObject({ porOutroNumero: true, equipe: { id: 'eq-padrao', nome: 'Geral' }, permitido: true })
  })

  it('nenhuma equipe atende o número do modelo: recusa, com a frase', () => {
    const envio = envioDoModelo('c2', CADASTRO, CANAIS, [EQ_RECEPCAO])
    expect(envio).toMatchObject({ porOutroNumero: true, permitido: false, recusa: { tipo: 'sem-equipe' } })
    expect(motivoDeNaoSair(envio)).toMatch(/Nenhuma equipe da conta atende o número \(71\) 98127-0357/)
  })

  it('número de outra unidade da clínica: recusa, dizendo qual', () => {
    const envio = envioDoModelo('c4', CADASTRO, CANAIS, [EQ_VENDAS])
    expect(envio).toMatchObject({ porOutroNumero: false, permitido: false, recusa: { tipo: 'de-outra-unidade', unidade: 'Méier' } })
    expect(motivoDeNaoSair(envio)).toMatch(/é do número \(21\) 98888-7777, da unidade Méier, e esta unidade não envia por ele/)
  })

  it('número desativado ou fora da conta: recusa', () => {
    expect(motivoDeNaoSair(envioDoModelo('c3', CADASTRO, CANAIS))).toMatch(/\(62\) 99999-0000, que está desativado na conta/)
    expect(motivoDeNaoSair(envioDoModelo('sumiu', CADASTRO, CANAIS))).toMatch(/não está mais na conta/)
  })

  it('unidade sem remetente numa conta com vários números: o número livre do modelo serve', () => {
    const envio = envioDoModelo('c2', { ...CADASTRO, from: null }, CANAIS, [EQ_APOIO])
    expect(envio).toMatchObject({ remetente: null, saiPeloRemetente: null, porOutroNumero: true, equipe: { id: 'eq-apoio' }, permitido: true })
  })

  it('modelo que não diz o canal: sai pelo remetente, e a plataforma decide', () => {
    expect(envioDoModelo(null, CADASTRO, CANAIS)).toMatchObject({ porOutroNumero: false, permitido: null, recusa: null })
  })
})
