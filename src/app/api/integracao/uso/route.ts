import { NextResponse, type NextRequest } from 'next/server'
import { conferirChaveDeIntegracao, VARIAVEL_DA_CHAVE_DE_USO } from '@/acesso/chave-de-integracao'
import { responderErro } from '@/shared/http'
import { buscarResumoDeUso } from '@/features/resumo-de-uso/dados'

// GET /api/integracao/uso
//
// O resumo de uso do app por clínica, para a Mensageria (ADR 0008 de lá;
// docs/adr/0006-resumo-de-uso-para-a-mensageria.md): se o módulo está ligado,
// os envios por situação, o último envio e os envios em 30 e 90 dias. Só leitura.
//
// Fica fora do gate de acesso (ver o matcher em `proxy.ts`), como `api/cron`:
// autentica pela chave própria, INTEGRACAO_USO_CHAVE, e lê todas as clínicas.
//
// `setupUrl` sai nulo: o app não guarda a própria origem pública em nenhuma
// configuração, e a Mensageria chama pela rede interna da VPS, onde o `Host`
// da requisição é o nome do container, e não o domínio.

export const maxDuration = 60

export async function GET(request: NextRequest) {
  const decisao = conferirChaveDeIntegracao(request.headers.get('authorization'), process.env[VARIAVEL_DA_CHAVE_DE_USO])

  if (decisao === 'nao-configurada') {
    // Configuração ausente NÃO é acesso negado (a mesma lição do CRON_SECRET).
    console.error(
      `[integracao/uso] ${VARIAVEL_DA_CHAVE_DE_USO} ausente: a rota rejeita toda chamada. ` +
        'Cadastrar no .env do servidor (ver docs/deploy-vps.md).'
    )
    return NextResponse.json(
      { error: 'Integração não configurada neste servidor', codigo: 'INTEGRACAO_NAO_CONFIGURADA' },
      { status: 503 }
    )
  }
  if (decisao === 'negar') {
    return NextResponse.json({ error: 'Não autorizado', codigo: 'NAO_AUTORIZADO' }, { status: 401 })
  }

  try {
    const resumo = await buscarResumoDeUso(new Date(), null)
    return NextResponse.json(resumo, { headers: { 'cache-control': 'no-store' } })
  } catch (err) {
    return responderErro('api/integracao/uso', err)
  }
}
