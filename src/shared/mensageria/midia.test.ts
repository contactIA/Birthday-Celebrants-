import { describe, expect, it } from 'vitest'
import { aceitoPara, fraseSemArquivo, problemaNoArquivo } from './midia'

const MB = 1024 * 1024

describe('problemaNoArquivo', () => {
  it('vídeo MP4 dentro do limite serve', () => {
    expect(problemaNoArquivo('video', { mimeType: 'video/mp4', tamanho: 15 * MB })).toBeNull()
  })

  it('formato que o WhatsApp não aceita no cabeçalho', () => {
    expect(problemaNoArquivo('video', { mimeType: 'video/quicktime', tamanho: MB })).toBe(
      'Esse arquivo não serve: o vídeo do modelo precisa ser MP4 ou 3GPP.'
    )
  })

  it('acima do limite do WhatsApp, dizendo o tamanho', () => {
    expect(problemaNoArquivo('video', { mimeType: 'video/mp4', tamanho: 17 * MB })).toBe(
      'O arquivo tem 17,0 MB, e o WhatsApp aceita até 16 MB.'
    )
    expect(problemaNoArquivo('imagem', { mimeType: 'image/png', tamanho: 6 * MB })).toMatch(/até 5 MB/)
  })

  it('arquivo vazio', () => {
    expect(problemaNoArquivo('documento', { mimeType: 'application/pdf', tamanho: 0 })).toBe('O arquivo está vazio.')
  })
})

describe('frases', () => {
  it('sem o arquivo, a frase diz o que fazer, no gênero certo', () => {
    expect(fraseSemArquivo('video')).toBe('Este modelo tem vídeo. Envie o vídeo em Modelos e salve: sem ele, a mensagem falha no envio.')
    expect(fraseSemArquivo('imagem')).toMatch(/Envie a imagem em Modelos e salve: sem ela,/)
  })

  it('o seletor pede só o que serve', () => {
    expect(aceitoPara('video')).toBe('video/mp4,video/3gpp')
  })
})
