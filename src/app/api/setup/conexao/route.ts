import { NextResponse, type NextRequest } from 'next/server'
import { exigirSessaoDeSetup } from '@/acesso/escopo'
import { buscarClinicaPorId, cadastroComumLigado } from '@/shared/clinica/repositorio'
import { responderErro } from '@/shared/http'
import { lerEntrada, montarClinica } from '@/features/configurar-clinica/regras'
import { testarConexao } from '@/features/configurar-clinica/conexao'
import { dependenciasReais } from '@/features/configurar-clinica/testes-reais'

// POST /api/setup/conexao — testa as credenciais do formulário, SEM salvar.
//
// Corpo: os campos do formulário, mais `id` quando é edição. Com `id`, os
// segredos deixados em branco vêm da clínica salva — é o que permite testar
// "troquei só o token da Clinicorp" sem redigitar o token da mensageria.
//
// Com o cadastro comum ligado não há formulário: testa a clínica `id` como o
// cadastro a entrega (a unidade principal), e o resto do corpo é ignorado.

export async function POST(request: NextRequest) {
  try {
    exigirSessaoDeSetup(request)
    const corpo = (await request.json().catch(() => null)) as Record<string, unknown> | null
    const id = typeof corpo?.id === 'string' && corpo.id ? corpo.id : null

    const existente = id ? await buscarClinicaPorId(id) : null
    const clinica = cadastroComumLigado() && existente ? existente : montarClinica(lerEntrada(corpo), existente)

    return NextResponse.json(await testarConexao(clinica, dependenciasReais(new Date())))
  } catch (err) {
    return responderErro('api/setup/conexao', err)
  }
}
