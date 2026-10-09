import { describe, expect, it } from 'vitest'
import { canalDoRemetente, envioDoModelo, motivoDeNaoSair } from './canal-do-modelo'

const RECEPCAO = { id: 'c1', numero: '556231930175', nome: 'Recepção', ativo: true }
const COMERCIAL = { id: 'c2', numero: '5571981270357', nome: 'Comercial', ativo: true }
const ANTIGO = { id: 'c3', numero: '5562999990000', nome: 'Antigo', ativo: false }

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

describe('envioDoModelo', () => {
  it('modelo do número da clínica', () => {
    expect(envioDoModelo('c1', '556231930175', [RECEPCAO, COMERCIAL])).toEqual({
      numero: { numero: '556231930175', nome: 'Recepção' },
      remetente: { numero: '556231930175', nome: 'Recepção' },
      saiPeloRemetente: true,
    })
  })

  it('modelo de outro número (o caso de 2026-10-09)', () => {
    const envio = envioDoModelo('c2', '556231930175', [RECEPCAO, COMERCIAL])
    expect(envio.saiPeloRemetente).toBe(false)
    expect(motivoDeNaoSair(envio)).toMatch(/é do número \(71\) 98127-0357, e esta clínica agenda pelo \(62\) 3193-0175/)
  })

  it('modelo de um canal que saiu da conta', () => {
    const envio = envioDoModelo('sumiu', '556231930175', [RECEPCAO])
    expect(envio).toMatchObject({ numero: null, saiPeloRemetente: false })
    expect(motivoDeNaoSair(envio)).toMatch(/não está mais na conta/)
  })

  it('modelo que não diz o canal: mostra sem acusar', () => {
    const envio = envioDoModelo(null, '556231930175', [RECEPCAO])
    expect(envio).toMatchObject({ numero: null, saiPeloRemetente: null })
    expect(motivoDeNaoSair(envio)).toBeNull()
  })

  it('sem remetente identificado: mostra o número, não acusa', () => {
    const envio = envioDoModelo('c2', null, [RECEPCAO, COMERCIAL])
    expect(envio).toMatchObject({ numero: { numero: '5571981270357' }, remetente: null, saiPeloRemetente: null })
    expect(motivoDeNaoSair(envio)).toBeNull()
  })
})
