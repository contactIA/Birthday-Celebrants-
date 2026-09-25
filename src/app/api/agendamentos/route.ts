import { NextResponse, type NextRequest } from 'next/server'
import { exigirCompanyId } from '@/acesso/escopo'
import { buscarClinica } from '@/shared/clinica/repositorio'
import { ParametroInvalidoError, responderErro } from '@/shared/http'
import { provedorDe } from '@/providers/prontuario'
import { mensageriaDe } from '@/providers/mensageria'
import { agendarMensagens } from '@/features/agendar-mensagem/agendamento'
import { buscarModeloConfig, registrarEnvio } from '@/features/agendar-mensagem/dados'

// POST /api/agendamentos
//
// Corpo: { modeloConfigId, pacienteIds: string[], quandoManual?: ISO }
//
// O corpo carrega IDS, não pacientes. O app anterior recebia o objeto de
// paciente inteiro e usava o telefone do corpo como destinatário — quem tivesse
// acesso a uma clínica escolhia para qual número ia o template aprovado dela.
// Aqui nome, nascimento e telefone vêm do prontuário.
//
// Responde 207-style: um resultado por paciente, porque um lote pode ter
// sucesso parcial e a tela precisa dizer quem passou e quem não.

interface CorpoRecebido {
  modeloConfigId?: unknown
  pacienteIds?: unknown
  quandoManual?: unknown
}

function lerCorpo(corpo: CorpoRecebido) {
  if (typeof corpo.modeloConfigId !== 'string' || !corpo.modeloConfigId) {
    throw new ParametroInvalidoError('Modelo de mensagem não informado')
  }
  if (!Array.isArray(corpo.pacienteIds) || corpo.pacienteIds.some((id) => typeof id !== 'string')) {
    throw new ParametroInvalidoError('Lista de pacientes inválida')
  }
  if (corpo.quandoManual !== undefined && typeof corpo.quandoManual !== 'string') {
    throw new ParametroInvalidoError('Data e hora do envio inválidas')
  }
  return {
    modeloConfigId: corpo.modeloConfigId,
    pacienteIds: corpo.pacienteIds as string[],
    quandoManual: corpo.quandoManual as string | undefined,
  }
}

export async function POST(request: NextRequest) {
  try {
    const clinica = await buscarClinica(exigirCompanyId(request))

    const corpo = await request.json().catch(() => {
      throw new ParametroInvalidoError('Corpo da requisição inválido')
    })
    const pedido = lerCorpo(corpo as CorpoRecebido)

    const prontuario = provedorDe(clinica)
    const mensageria = mensageriaDe(clinica)

    const resultados = await agendarMensagens(
      pedido,
      { timezone: clinica.timezone, agora: new Date() },
      {
        buscarModelo: (id) => buscarModeloConfig(clinica, id),
        buscarPacientes: (ids) => prontuario.buscarPorIds(ids),
        agendar: (p) => mensageria.agendar(p),
        salvarContato: (c) => mensageria.salvarContato(c),
        registrarEnvio: (envio) => registrarEnvio(clinica, envio),
      }
    )

    const agendados = resultados.filter((r) => r.ok).length
    return NextResponse.json(
      { resultados, agendados, total: resultados.length },
      // Nenhum sucesso num lote não vazio é falha do pedido, não sucesso com
      // detalhes — a tela precisa poder tratar diferente.
      { status: agendados === 0 ? 422 : 200 }
    )
  } catch (err) {
    return responderErro('api/agendamentos', err)
  }
}
