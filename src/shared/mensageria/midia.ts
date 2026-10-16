// A mídia de um modelo: o vídeo, a imagem ou o documento do cabeçalho.
//
// Modelo com mídia só sai com o arquivo junto. Agendado sem ele, a plataforma
// aceita e o WhatsApp recusa no disparo (132012, "parâmetros formatados
// incorretamente") — caso real, 2026-10-14 e 15: todos os parabéns com vídeo
// falharam. A API pública não entrega o arquivo do modelo, então a clínica o
// envia na tela de Modelos, e o app guarda o id que a plataforma devolve.
//
// A tela, o salvar e o lote chamam ESTAS regras: a tela não pode aceitar o
// arquivo que o servidor vai recusar, nem dizer "ok" ao lote que vai falhar.

export type TipoDeMidia = 'video' | 'imagem' | 'documento'

/** O arquivo já enviado de um modelo. */
export interface ArquivoDoModelo {
  /** O id do arquivo na plataforma. */
  id: string
  nome: string
}

interface Regra {
  /** "vídeo", para as frases. */
  rotulo: string
  /** "o vídeo", para as frases. */
  comArtigo: string
  /** "sem ele", para as frases. */
  semEle: string
  /** Os tipos que o WhatsApp aceita no cabeçalho. */
  mimeTypes: readonly string[]
  /** O limite do WhatsApp, e o que cabe no envio pelo app. */
  maximoEmBytes: number
}

const MB = 1024 * 1024

// Limites do WhatsApp para mídia de modelo. O documento aceitaria até 100 MB lá,
// mas o envio passa pelo app, que aceita até 16 MB.
export const REGRAS_DA_MIDIA: Record<TipoDeMidia, Regra> = {
  video: { rotulo: 'vídeo', comArtigo: 'o vídeo', semEle: 'sem ele', mimeTypes: ['video/mp4', 'video/3gpp'], maximoEmBytes: 16 * MB },
  imagem: { rotulo: 'imagem', comArtigo: 'a imagem', semEle: 'sem ela', mimeTypes: ['image/jpeg', 'image/png'], maximoEmBytes: 5 * MB },
  documento: { rotulo: 'documento', comArtigo: 'o documento', semEle: 'sem ele', mimeTypes: ['application/pdf'], maximoEmBytes: 16 * MB },
}

/** O que a tela pede no seletor de arquivo. */
export function aceitoPara(midia: TipoDeMidia): string {
  return REGRAS_DA_MIDIA[midia].mimeTypes.join(',')
}

/** Por que o modelo não pode ser usado sem o arquivo. A tela, o salvar e o lote dizem a mesma frase. */
export function fraseSemArquivo(midia: TipoDeMidia): string {
  const { rotulo, comArtigo, semEle } = REGRAS_DA_MIDIA[midia]
  return `Este modelo tem ${rotulo}. Envie ${comArtigo} em Modelos e salve: ${semEle}, a mensagem falha no envio.`
}

/** `null` se o arquivo serve para a mídia do modelo; senão, a frase para a tela. */
export function problemaNoArquivo(
  midia: TipoDeMidia,
  arquivo: { mimeType: string; tamanho: number }
): string | null {
  const regra = REGRAS_DA_MIDIA[midia]
  if (!regra.mimeTypes.includes(arquivo.mimeType)) {
    const formatos = regra.mimeTypes.map((t) => t.split('/')[1]!.toUpperCase()).join(' ou ')
    return `Esse arquivo não serve: ${regra.comArtigo} do modelo precisa ser ${formatos}.`
  }
  if (arquivo.tamanho <= 0) return 'O arquivo está vazio.'
  if (arquivo.tamanho > regra.maximoEmBytes) {
    return `O arquivo tem ${(arquivo.tamanho / MB).toFixed(1).replace('.', ',')} MB, e o WhatsApp aceita até ${regra.maximoEmBytes / MB} MB.`
  }
  return null
}
