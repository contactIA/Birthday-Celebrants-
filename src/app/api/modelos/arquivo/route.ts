import { NextResponse, type NextRequest } from 'next/server'
import { exigirCompanyId, unidadeDaRequisicao } from '@/acesso/escopo'
import { buscarClinica } from '@/shared/clinica/repositorio'
import { ParametroInvalidoError, responderErro } from '@/shared/http'
import { mensageriaDe } from '@/providers/mensageria'
import { enviarArquivoDoModelo } from '@/features/configurar-modelo/modelos'

// POST /api/modelos/arquivo — sobe a mídia de um modelo (vídeo, imagem,
// documento) na plataforma e devolve { id, nome }.
//
// Corpo: multipart, com `modeloId` e `arquivo`. Não grava nada: a tela manda o
// arquivo devolvido junto no salvar da configuração (POST /api/modelos).
//
// Até 16 MB, o limite do WhatsApp para vídeo. O caminho até aqui precisa deixar
// passar isso: o nginx (`client_max_body_size`, deploy/nginx) e o proxy do Next
// (`proxyClientMaxBodySize`, next.config.ts), que sem ajuste CORTA o corpo em
// 10 MB sem erro nenhum.
export async function POST(request: NextRequest) {
  try {
    const clinica = await buscarClinica(exigirCompanyId(request), unidadeDaRequisicao(request))

    const formulario = await request.formData().catch(() => {
      throw new ParametroInvalidoError('Envio do arquivo inválido')
    })
    const modeloId = formulario.get('modeloId')
    const arquivo = formulario.get('arquivo')
    if (typeof modeloId !== 'string' || !modeloId) throw new ParametroInvalidoError('Modelo não informado')
    if (!(arquivo instanceof File)) throw new ParametroInvalidoError('Arquivo não informado')

    const mensageria = mensageriaDe(clinica)
    const enviado = await enviarArquivoDoModelo(
      modeloId,
      { nome: arquivo.name, mimeType: arquivo.type, conteudo: await arquivo.arrayBuffer() },
      {
        listarDaPlataforma: () => mensageria.listarModelos(),
        subirArquivo: (a) => mensageria.subirArquivo(a),
      }
    )
    return NextResponse.json(enviado)
  } catch (err) {
    return responderErro('api/modelos/arquivo', err)
  }
}
