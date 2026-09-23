import { instanteDoEnvio, type DiaEnvio } from '@/shared/data/agendamento'
import { anoNoTimezone } from '@/shared/data/fuso'
import { mesDiaDe, paraExibicao } from '@/shared/data/parse'
import { paraE164BR } from '@/shared/telefone/e164'
import { resolverParametros } from '@/shared/template/parametros'
import type { Aniversariante } from '@/providers/prontuario'
import type { AgendamentoCriado, AgendamentoSolicitado } from '@/providers/mensageria'

// A regra do agendamento.
//
// Dois defeitos do app anterior morrem aqui, e vale dizer quais porque os dois
// eram invisíveis em code review:
//
//  A. `dia_envio` era salvo no banco, exibido na tela e NUNCA lido no cálculo.
//     Quem escolhia "3 dias antes" recebia envio no próprio dia. A regra ficava
//     no handler HTTP, que só passava `horario_envio` adiante.
//
//  B. O paciente chegava INTEIRO pelo corpo do request — nome, nascimento e
//     telefone. O escopo de clínica estava certo, mas dentro dela o chamador
//     escolhia o número de destino do template aprovado, com o WhatsApp
//     Business da clínica. Aqui só o ID entra; o resto vem do prontuário.

/** A configuração salva de um modelo, já escopada à clínica. */
export interface ConfiguracaoDeModelo {
  /** Id da nossa linha de configuração. */
  id: string
  /** Id do modelo na plataforma de mensagens. */
  modeloId: string
  parametros: Record<string, string>
  diaEnvio: DiaEnvio
  /** "HH:MM" no fuso da clínica. */
  horarioEnvio: string
}

export interface EnvioParaGravar {
  modeloConfigId: string
  pacienteId: string
  pacienteNome: string
  pacienteTelefone: string
  dataNascimento: string | null
  ano: number
  mensagemId: string | null
  agendadoPara: string
}

export interface Pedido {
  modeloConfigId: string
  pacienteIds: string[]
  /** ISO. Só aceito quando há UM paciente — em lote não faz sentido. */
  quandoManual?: string
}

export interface Contexto {
  timezone: string
  agora: Date
}

export interface ResultadoPorPaciente {
  pacienteId: string
  nome: string | null
  ok: boolean
  /** Frase para a tela. Presente só quando `ok` é `false`. */
  erro?: string
}

export interface Dependencias {
  buscarModelo: (modeloConfigId: string) => Promise<ConfiguracaoDeModelo | null>
  buscarPacientes: (ids: string[]) => Promise<Aniversariante[]>
  agendar: (pedido: AgendamentoSolicitado) => Promise<AgendamentoCriado>
  registrarEnvio: (envio: EnvioParaGravar) => Promise<void>
}

export class ModeloNaoEncontradoError extends Error {
  readonly status = 404
  readonly codigo = 'MODELO_NAO_ENCONTRADO' as const
  constructor() {
    // Escopar a busca por clínica é o que transforma "de outra clínica" em
    // "não encontrado" — antes bastava mandar o id de um modelo alheio para
    // usá-lo com as credenciais desta.
    super('Modelo de mensagem não encontrado')
    this.name = 'ModeloNaoEncontradoError'
  }
}

export class PedidoInvalidoError extends Error {
  readonly status = 400
  readonly codigo = 'PEDIDO_INVALIDO' as const
  constructor(mensagem: string) {
    super(mensagem)
    this.name = 'PedidoInvalidoError'
  }
}

/** Limite de pacientes por pedido. Protege a function e a conta da clínica. */
export const MAXIMO_POR_LOTE = 100

function quandoManualValido(iso: string, agora: Date): string {
  const instante = new Date(iso)
  if (Number.isNaN(instante.getTime())) {
    throw new PedidoInvalidoError('Data e hora do envio inválidas')
  }
  // A plataforma rejeita agendamento retroativo: recusar aqui dá erro legível
  // em vez de falha genérica vinda de fora.
  if (instante.getTime() <= agora.getTime()) {
    throw new PedidoInvalidoError('A data e hora do envio precisam estar no futuro')
  }
  return instante.toISOString()
}

export async function agendarMensagens(
  pedido: Pedido,
  contexto: Contexto,
  deps: Dependencias
): Promise<ResultadoPorPaciente[]> {
  if (pedido.pacienteIds.length === 0) {
    throw new PedidoInvalidoError('Selecione ao menos um paciente')
  }
  if (pedido.pacienteIds.length > MAXIMO_POR_LOTE) {
    throw new PedidoInvalidoError(`Selecione no máximo ${MAXIMO_POR_LOTE} pacientes por vez`)
  }
  if (pedido.quandoManual && pedido.pacienteIds.length > 1) {
    throw new PedidoInvalidoError('Data e hora manuais só valem para um paciente por vez')
  }

  const modelo = await deps.buscarModelo(pedido.modeloConfigId)
  if (!modelo) throw new ModeloNaoEncontradoError()

  const quandoManual = pedido.quandoManual
    ? quandoManualValido(pedido.quandoManual, contexto.agora)
    : null

  // Uma consulta ao prontuário para o lote inteiro. Ids repetidos viram um só.
  const ids = [...new Set(pedido.pacienteIds)]
  const encontrados = await deps.buscarPacientes(ids)
  const porId = new Map(encontrados.map((p) => [p.id, p]))

  const ano = anoNoTimezone(contexto.timezone, contexto.agora)
  const resultados: ResultadoPorPaciente[] = []

  // Sequencial de propósito. A API de mensagens tem limite de taxa, e um lote
  // paralelo trocaria "algumas falham por limite" por um erro difícil de
  // explicar. Cada paciente falha sozinho — o lote não aborta.
  for (const id of ids) {
    const paciente = porId.get(id)
    if (!paciente) {
      resultados.push({
        pacienteId: id,
        nome: null,
        ok: false,
        erro: 'Paciente não encontrado no sistema de prontuário',
      })
      continue
    }

    resultados.push(await agendarUm(paciente, modelo, quandoManual, ano, contexto, deps))
  }

  return resultados
}

async function agendarUm(
  paciente: Aniversariante,
  modelo: ConfiguracaoDeModelo,
  quandoManual: string | null,
  ano: number,
  contexto: Contexto,
  deps: Dependencias
): Promise<ResultadoPorPaciente> {
  const base = { pacienteId: paciente.id, nome: paciente.nome }

  // O telefone vem do prontuário, nunca do pedido.
  const telefone = paraE164BR(paciente.telefone)
  if (!telefone) {
    return { ...base, ok: false, erro: 'Telefone inválido no cadastro do paciente' }
  }

  const { mes, dia } = mesDiaDe(paciente.aniversario)

  let quando: string
  if (quandoManual) {
    quando = quandoManual
  } else {
    // `diaEnvio` entra no cálculo. Era exatamente esta linha que faltava.
    const instante = instanteDoEnvio(mes, dia, {
      timezone: contexto.timezone,
      horario: modelo.horarioEnvio,
      diaEnvio: modelo.diaEnvio,
      agora: contexto.agora,
    })
    if (!instante) {
      return {
        ...base,
        ok: false,
        erro: `O aniversário (${paraExibicao(paciente.aniversario)}) já passou este ano`,
      }
    }
    quando = instante.toISOString()
  }

  try {
    const criado = await deps.agendar({
      para: telefone,
      modeloId: modelo.modeloId,
      quando,
      parametros: resolverParametros(modelo.parametros, {
        nome: paciente.nome,
        datanascimento: paciente.datanascimento,
        aniversario: paciente.aniversario,
      }),
    })

    await deps.registrarEnvio({
      modeloConfigId: modelo.id,
      pacienteId: paciente.id,
      pacienteNome: paciente.nome,
      pacienteTelefone: telefone,
      dataNascimento: paciente.datanascimento || null,
      ano,
      mensagemId: criado.id,
      agendadoPara: quando,
    })

    return { ...base, ok: true }
  } catch (err) {
    // Falha de um paciente não derruba o lote — a tela mostra quem passou e
    // quem não passou, como o fluxo anterior já fazia.
    return { ...base, ok: false, erro: (err as Error).message }
  }
}
