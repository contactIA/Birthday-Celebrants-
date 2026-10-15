import { anoDoAniversario, aniversarioJaPassou, instanteDoEnvio, instanteDoHorarioLocal, type DiaEnvio } from '@/shared/data/agendamento'
import { mesDiaDe, paraExibicao } from '@/shared/data/parse'
import { temMensagemValida } from '@/shared/envio/situacao'
import { digitosComPais, paraE164BR } from '@/shared/telefone/e164'
import { resolverParametros } from '@/shared/template/parametros'
import type { StatusEnvio } from '@/shared/db'
import type { Aniversariante } from '@/providers/prontuario'
import { envioDoModelo, motivoDeNaoSair, type Equipe, type UnidadeQueEnvia } from '@/shared/mensageria/canal-do-modelo'
import {
  ModeloForaDoCanalError,
  type AgendamentoCriado,
  type AgendamentoSolicitado,
  type ContatoDoPaciente,
  type ListagemDeModelos,
} from '@/providers/mensageria'

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
  /** O número que envia (dígitos com país). `null` = o remetente não é conhecido. */
  remetente: string | null
}

/** Um envio que o paciente já tem gravado, de qualquer ano. */
export interface EnvioExistente {
  pacienteId: string
  ano: number
  status: StatusEnvio
}

export interface Pedido {
  modeloConfigId: string
  pacienteIds: string[]
  /**
   * "AAAA-MM-DDTHH:MM" no fuso da clínica (o campo da tela) ou ISO. Só aceito
   * quando há UM paciente — em lote não faz sentido.
   */
  quandoManual?: string
}

export interface Contexto {
  timezone: string
  agora: Date
  /** De onde a unidade envia: o remetente, a equipe e os números das outras unidades. */
  unidade: UnidadeQueEnvia
}

export interface ResultadoPorPaciente {
  pacienteId: string
  nome: string | null
  ok: boolean
  /** Frase para a tela. Presente só quando `ok` é `false`. */
  erro?: string
  /** Agendou, mas com ressalva que a equipe precisa ver. */
  aviso?: string
}

/** A ressalva quando o contato não pôde ser salvo e o agendamento seguiu. */
export const AVISO_CONTATO_NAO_SALVO =
  'Agendado, mas o contato não foi salvo na plataforma de mensagens. O nome pode aparecer como o número.'

export const ERRO_JA_AGENDADO =
  'Já tem mensagem de aniversário agendada. Para trocar, cancele no Histórico e agende de novo.'
export const ERRO_JA_ENVIADO = 'A mensagem de aniversário deste ano já foi enviada.'

export interface Dependencias {
  buscarModelo: (modeloConfigId: string) => Promise<ConfiguracaoDeModelo | null>
  /** Os modelos e canais da plataforma, para conferir o número do modelo antes do lote. */
  listarDaPlataforma: () => Promise<ListagemDeModelos>
  /** As equipes da conta. Só consultadas quando o modelo sai por outro número. */
  listarEquipes: () => Promise<Equipe[]>
  buscarPacientes: (ids: string[]) => Promise<Aniversariante[]>
  /** Os envios já gravados desses pacientes, de qualquer ano. */
  buscarEnvios: (pacienteIds: string[]) => Promise<EnvioExistente[]>
  agendar: (pedido: AgendamentoSolicitado) => Promise<AgendamentoCriado>
  /** Cria ou completa o contato do paciente na plataforma. Roda ANTES de agendar. */
  salvarContato: (contato: ContatoDoPaciente) => Promise<unknown>
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

/**
 * Por qual número e em nome de qual equipe o lote sai. Vazio = pelo remetente,
 * com a equipe da unidade, como sempre.
 */
export interface SaidaDoLote {
  remetente?: string
  equipeId?: string
}

/**
 * Decide, antes de começar, por qual número o lote sai: o do modelo
 * (`shared/mensageria/canal-do-modelo.ts`). Por outro número que não o
 * remetente, consulta as equipes e escolhe a que agenda por ele.
 *
 * Recusa o lote INTEIRO quando a unidade não pode usar o modelo. Sem isto a
 * plataforma recusa paciente por paciente, e o lote termina com N falhas iguais
 * e nenhuma mensagem (caso real no app de lembretes, 2026-10-09). Modelo que
 * não aparece na listagem não é recusado aqui: a listagem tem teto de página,
 * ele sai pelo remetente, e quem decide nesse caso é a plataforma.
 */
export async function saidaDoLote(
  modeloId: string,
  plataforma: ListagemDeModelos,
  unidade: UnidadeQueEnvia,
  listarEquipes: () => Promise<Equipe[]>
): Promise<SaidaDoLote> {
  const modelo = plataforma.modelos.find((m) => m.id === modeloId)
  if (!modelo) return {}
  let envio = envioDoModelo(modelo.canalId, unidade, plataforma.canais)
  if (envio.porOutroNumero) envio = envioDoModelo(modelo.canalId, unidade, plataforma.canais, await listarEquipes())
  const motivo = motivoDeNaoSair(envio)
  if (motivo) throw new ModeloForaDoCanalError(motivo)
  return envio.porOutroNumero && envio.numero && envio.equipe
    ? { remetente: envio.numero.numero, equipeId: envio.equipe.id }
    : {}
}

function quandoManualValido(texto: string, timezone: string, agora: Date): string {
  const instante = instanteDoHorarioLocal(texto, timezone) ?? new Date(texto)
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
  const saida = await saidaDoLote(modelo.modeloId, await deps.listarDaPlataforma(), contexto.unidade, deps.listarEquipes)

  const quandoManual = pedido.quandoManual
    ? quandoManualValido(pedido.quandoManual, contexto.timezone, contexto.agora)
    : null

  // Uma consulta ao prontuário e uma ao banco para o lote inteiro. Ids
  // repetidos viram um só.
  const ids = [...new Set(pedido.pacienteIds)]
  const [encontrados, envios] = await Promise.all([deps.buscarPacientes(ids), deps.buscarEnvios(ids)])
  const porId = new Map(encontrados.map((p) => [p.id, p]))

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

    const doPaciente = envios.filter((e) => e.pacienteId === id)
    resultados.push(await agendarUm(paciente, doPaciente, modelo, saida, quandoManual, contexto, deps))
  }

  return resultados
}

async function agendarUm(
  paciente: Aniversariante,
  envios: EnvioExistente[],
  modelo: ConfiguracaoDeModelo,
  saida: SaidaDoLote,
  quandoManual: string | null,
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
  // O ano DESTE aniversário, não o corrente: em dezembro, janeiro é do ano que
  // vem, e a chave única (clínica, paciente, ano) precisa dizer isso — senão o
  // parabéns de janeiro sobrescreveria o do janeiro que já passou.
  const ano = anoDoAniversario(mes, contexto.timezone, contexto.agora)

  // Um parabéns por paciente por ano — conferido AQUI, não só na tela. A tela
  // esconde quem já tem mensagem, mas recebe pedido que ela não filtrou: outra
  // aba, outra pessoa, ou um segundo clique com o lote anterior ainda marcado.
  // Sem esta conferência o registro era sobrescrito e a mensagem anterior
  // continuava agendada na plataforma: saíam as duas, e o banco só guardava a
  // última (duplicatas na Salutar, 2026-10-07).
  const status = envios.find((e) => e.ano === ano)?.status
  if (temMensagemValida(status)) {
    const aindaNaoSaiu = status === 'scheduled' || status === 'processed'
    return { ...base, ok: false, erro: aindaNaoSaiu ? ERRO_JA_AGENDADO : ERRO_JA_ENVIADO }
  }

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
      const passou = aniversarioJaPassou(mes, dia, contexto.timezone, contexto.agora)
      return {
        ...base,
        ok: false,
        erro: passou
          ? `O aniversário (${paraExibicao(paciente.aniversario)}) já passou este ano`
          : 'O aniversário é hoje, e o parabéns precisa ser agendado com antecedência',
      }
    }
    quando = instante.toISOString()
  }

  // O contato ANTES da mensagem: a variável de nome que a plataforma preenche
  // sai com o número quando o telefone não é um contato salvo. Se falhar, o
  // parabéns segue mesmo assim, com aviso: perder o envio é pior que o nome
  // sair como número (decisão do Gabriel, 2026-09-24).
  let aviso: string | undefined
  try {
    await deps.salvarContato({ telefone, nome: paciente.nome, dataNascimento: paciente.datanascimento || null })
  } catch {
    aviso = AVISO_CONTATO_NAO_SALVO
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
      ...saida,
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
      remetente: saida.remetente ?? (contexto.unidade.from ? digitosComPais(contexto.unidade.from) : null),
    })

    return aviso ? { ...base, ok: true, aviso } : { ...base, ok: true }
  } catch (err) {
    // Falha de um paciente não derruba o lote — a tela mostra quem passou e
    // quem não passou, como o fluxo anterior já fazia.
    return { ...base, ok: false, erro: (err as Error).message }
  }
}
