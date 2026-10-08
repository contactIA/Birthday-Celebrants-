import { NextResponse, type NextRequest } from 'next/server'
import { exigirSessaoDeSetup } from '@/acesso/escopo'
import { buscarClinicaPorId, cadastroComumLigado } from '@/shared/clinica/repositorio'
import { responderErro } from '@/shared/http'
import { lerEntradaDeUnidade, montarUnidade, unidadeComoClinica } from '@/features/configurar-clinica/regras'
import { testarConexao } from '@/features/configurar-clinica/conexao'
import { dependenciasReais } from '@/features/configurar-clinica/testes-reais'

// POST /api/setup/clinicas/:id/unidades/conexao — testa as credenciais do
// formulário de uma unidade, SEM salvar.
//
// Corpo: os campos da unidade, mais `unidadeId` quando é edição (segredos em
// branco vêm da unidade salva). O token da plataforma de mensagens é o da
// clínica: a unidade só troca prontuário e remetente.
//
// Com o cadastro comum ligado não há formulário: testa a unidade `unidadeId`
// como o cadastro a entrega, e o resto do corpo é ignorado.

export async function POST(request: NextRequest, ctx: RouteContext<'/api/setup/clinicas/[id]/unidades/conexao'>) {
  try {
    exigirSessaoDeSetup(request)
    const { id } = await ctx.params
    const corpo = (await request.json().catch(() => null)) as Record<string, unknown> | null
    const unidadeId = typeof corpo?.unidadeId === 'string' && corpo.unidadeId ? corpo.unidadeId : null

    if (cadastroComumLigado()) {
      const clinica = await buscarClinicaPorId(id, unidadeId)
      return NextResponse.json(await testarConexao(clinica, dependenciasReais(new Date())))
    }

    const base = await buscarClinicaPorId(id)
    const existente = unidadeId ? await buscarClinicaPorId(id, unidadeId) : null
    const dados = montarUnidade(lerEntradaDeUnidade(corpo), existente)
    const clinica = unidadeComoClinica(base, dados, existente?.unidade ?? { id: '', nome: dados.nome, principal: false })

    return NextResponse.json(await testarConexao(clinica, dependenciasReais(new Date())))
  } catch (err) {
    return responderErro('api/setup/clinicas/:id/unidades/conexao', err)
  }
}
