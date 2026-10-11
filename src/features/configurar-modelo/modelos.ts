import { CAMPOS_DISPONIVEIS, parametrosDoTemplate } from '@/shared/template/parametros'
import type { DiaEnvio } from '@/shared/data/agendamento'
import {
  envioDoModelo,
  motivoDeNaoSair,
  type EnvioDoModelo,
  type Equipe,
  type UnidadeQueEnvia,
} from '@/shared/mensageria/canal-do-modelo'
import type { ListagemDeModelos, ModeloDeMensagem } from '@/providers/mensageria'

// A tela de modelos: casa os modelos aprovados na plataforma com a configuração
// que salvamos para cada um, e diz por qual número cada um sai e se esta
// unidade pode usá-lo.

export interface ConfiguracaoSalva {
  id: string
  parametros: Record<string, string>
  diaEnvio: DiaEnvio
  horarioEnvio: string
  ehPadrao: boolean
  ativo: boolean
}

export interface ModeloNaTela {
  /** Id do modelo na plataforma de mensagens. */
  modeloId: string
  nome: string
  conteudo: string
  /** `{{1}}`, `{{2}}`... encontrados no texto, para a tela montar o formulário. */
  parametrosDoTexto: string[]
  /** Por qual número o modelo sai, com qual equipe, e se esta unidade pode usá-lo. */
  envio: EnvioDoModelo
  config: ConfiguracaoSalva | null
}

export interface ListagemParaTela {
  modelos: ModeloNaTela[]
  /**
   * `false` = não deu para garantir que os modelos listados são exclusivos de
   * agendamento. A tela precisa avisar em vez de afirmar o que não sabe.
   */
  filtradoPorTipo: boolean
}

export interface DependenciasDeLeitura {
  listarDaPlataforma: () => Promise<ListagemDeModelos>
  /** As equipes da conta. Só consultadas quando algum modelo sai por outro número. */
  listarEquipes: () => Promise<Equipe[]>
  buscarConfiguracoes: () => Promise<Map<string, ConfiguracaoSalva>>
  /** De onde a unidade envia: o remetente, a equipe e os números das outras unidades. */
  unidade: UnidadeQueEnvia
}

/**
 * O envio de cada modelo, com a equipe nos que saem por outro número. As
 * equipes são consultadas uma vez, e só quando algum precisa: quem envia só pelo
 * remetente não faz consulta a mais.
 */
async function enviosDosModelos(
  modelos: ModeloDeMensagem[],
  plataforma: ListagemDeModelos,
  unidade: UnidadeQueEnvia,
  listarEquipes: () => Promise<Equipe[]>
): Promise<Map<string, EnvioDoModelo>> {
  const semEquipe = modelos.map((m) => envioDoModelo(m.canalId, unidade, plataforma.canais))
  const equipes = semEquipe.some((e) => e.porOutroNumero) ? await listarEquipes() : null
  return new Map(
    modelos.map((m, i) => [m.id, equipes ? envioDoModelo(m.canalId, unidade, plataforma.canais, equipes) : semEquipe[i]!])
  )
}

export async function listarModelos(deps: DependenciasDeLeitura): Promise<ListagemParaTela> {
  const [daPlataforma, configs] = await Promise.all([
    deps.listarDaPlataforma(),
    deps.buscarConfiguracoes(),
  ])
  const envios = await enviosDosModelos(daPlataforma.modelos, daPlataforma, deps.unidade, deps.listarEquipes)

  const modelos = daPlataforma.modelos.map((modelo) => ({
    modeloId: modelo.id,
    nome: modelo.nome,
    conteudo: modelo.conteudo,
    parametrosDoTexto: parametrosDoTemplate(modelo.conteudo),
    envio: envios.get(modelo.id)!,
    config: configs.get(modelo.id) ?? null,
  }))
  // Os que a unidade não pode usar por último: a conta pode ter o mesmo modelo,
  // com o mesmo nome, em vários números, e o que serve precisa vir primeiro.
  const recusado = (m: ModeloNaTela) => Number(m.envio.permitido === false)
  return {
    filtradoPorTipo: daPlataforma.filtradoPorTipo,
    modelos: modelos.sort((a, b) => recusado(a) - recusado(b)),
  }
}

// ── Salvar ──────────────────────────────────────────────────────────────────

export class ConfiguracaoInvalidaError extends Error {
  readonly status = 400
  readonly codigo = 'CONFIGURACAO_INVALIDA' as const
  constructor(mensagem: string) {
    super(mensagem)
    this.name = 'ConfiguracaoInvalidaError'
  }
}

export interface ConfiguracaoParaSalvar {
  modeloId: string
  nome: string
  parametros: Record<string, string>
  diaEnvio: DiaEnvio
  horarioEnvio: string
  ehPadrao: boolean
  ativo: boolean
}

const DIAS_VALIDOS: ReadonlySet<string> = new Set<DiaEnvio>([
  'aniversario',
  '1_dia_antes',
  '3_dias_antes',
])

const CAMPOS_VALIDOS: ReadonlySet<string> = new Set(CAMPOS_DISPONIVEIS.map((c) => c.valor))

const HORARIO = /^([01]\d|2[0-3]):([0-5]\d)$/

/**
 * Valida antes de gravar.
 *
 * A validação de CAMPO é a que importa: no envio, um campo desconhecido vira
 * string vazia — silenciosamente. Sem checar aqui, um erro de digitação no
 * mapeamento só aparece como um "Olá ," já entregue no WhatsApp do paciente.
 * É mais barato recusar agora do que descobrir depois.
 *
 * E a unidade precisa poder usar o modelo (o número dele não é de outra
 * unidade, e uma equipe o atende): um modelo recusado salvo como ativo só
 * falharia no envio, paciente por paciente.
 */
export function validarConfiguracao(config: ConfiguracaoParaSalvar, envio: EnvioDoModelo | null = null): void {
  if (!config.modeloId) {
    throw new ConfiguracaoInvalidaError('Modelo não informado')
  }
  const foraDoNumero = config.ativo && envio ? motivoDeNaoSair(envio) : null
  if (foraDoNumero) throw new ConfiguracaoInvalidaError(foraDoNumero)
  if (!DIAS_VALIDOS.has(config.diaEnvio)) {
    throw new ConfiguracaoInvalidaError('Dia de envio inválido')
  }
  if (!HORARIO.test(config.horarioEnvio)) {
    throw new ConfiguracaoInvalidaError('Horário de envio inválido. Use HH:MM')
  }

  for (const [parametro, campo] of Object.entries(config.parametros)) {
    if (!CAMPOS_VALIDOS.has(campo)) {
      throw new ConfiguracaoInvalidaError(
        `O parâmetro {{${parametro}}} está ligado a um campo que não existe`
      )
    }
  }
}

export interface DependenciasDeEscrita {
  /** Os modelos e canais, como estão hoje na plataforma. */
  listarDaPlataforma: () => Promise<ListagemDeModelos>
  listarEquipes: () => Promise<Equipe[]>
  /** De onde a unidade envia: o remetente, a equipe e os números das outras unidades. */
  unidade: UnidadeQueEnvia
  /** Tira o padrão de todos os modelos da clínica. */
  limparPadrao: () => Promise<void>
  gravar: (config: ConfiguracaoParaSalvar) => Promise<void>
}

export async function salvarConfiguracao(
  config: ConfiguracaoParaSalvar,
  deps: DependenciasDeEscrita
): Promise<void> {
  // Modelo fora da listagem não é recusado por número: a listagem tem teto de
  // página, e quem decide nesse caso é a plataforma.
  const plataforma = await deps.listarDaPlataforma()
  const modelo = plataforma.modelos.find((m) => m.id === config.modeloId)
  const envio = modelo ? (await enviosDosModelos([modelo], plataforma, deps.unidade, deps.listarEquipes)).get(modelo.id)! : null
  validarConfiguracao(config, envio)

  // Só um modelo padrão por clínica. São duas escritas, e o banco não nos dá
  // transação por aqui — então a ORDEM é a garantia: limpar antes de gravar faz
  // a falha no meio deixar a clínica com ZERO padrões, não com dois. Zero a
  // tela resolve pedindo para escolher; dois é ambíguo e ninguém percebe.
  if (config.ehPadrao) await deps.limparPadrao()

  await deps.gravar(config)
}
