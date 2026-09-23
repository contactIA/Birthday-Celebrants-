import { NextResponse, type NextRequest } from 'next/server'
import { exigirSessaoDeSetup } from '@/acesso/escopo'
import { criarClinica, listarClinicasNoSetup } from '@/shared/clinica/repositorio'
import { responderErro } from '@/shared/http'
import { lerEntrada, montarClinica } from '@/features/configurar-clinica/regras'

// GET  /api/setup/clinicas — todas as clínicas, sem o valor dos segredos.
// POST /api/setup/clinicas — cadastra uma.
//
// Enumerar clínicas é exatamente o que as rotas do PAINEL não podem fazer (ver
// buscarClinicaPublica). Aqui pode porque a rota exige a senha da equipe — no
// proxy e de novo abaixo, em `exigirSessaoDeSetup`.

export async function GET(request: NextRequest) {
  try {
    exigirSessaoDeSetup(request)
    return NextResponse.json({ clinicas: await listarClinicasNoSetup() })
  } catch (err) {
    return responderErro('api/setup/clinicas', err)
  }
}

export async function POST(request: NextRequest) {
  try {
    exigirSessaoDeSetup(request)
    const clinica = montarClinica(lerEntrada(await request.json().catch(() => null)), null)
    const criada = await criarClinica(clinica)
    console.info(`[setup] clínica cadastrada: ${criada.id} (${criada.companyId})`)
    return NextResponse.json(criada, { status: 201 })
  } catch (err) {
    return responderErro('api/setup/clinicas', err)
  }
}
