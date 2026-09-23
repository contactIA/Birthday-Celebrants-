import { CAMPOS_DISPONIVEIS, parametrosDoTemplate } from '@/shared/template/parametros'
import type { DiaEnvio } from '@/shared/data/agendamento'
import type { ListagemDeModelos } from '@/providers/mensageria'

// A tela de modelos: casa os modelos aprovados na plataforma com a configuração
// que salvamos para cada um.

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
  buscarConfiguracoes: () => Promise<Map<string, ConfiguracaoSalva>>
}

export async function listarModelos(deps: DependenciasDeLeitura): Promise<ListagemParaTela> {
  const [daPlataforma, configs] = await Promise.all([
    deps.listarDaPlataforma(),
    deps.buscarConfiguracoes(),
  ])

  return {
    filtradoPorTipo: daPlataforma.filtradoPorTipo,
    modelos: daPlataforma.modelos.map((modelo) => ({
      modeloId: modelo.id,
      nome: modelo.nome,
      conteudo: modelo.conteudo,
      parametrosDoTexto: parametrosDoTemplate(modelo.conteudo),
      config: configs.get(modelo.id) ?? null,
    })),
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
 */
export function validarConfiguracao(config: ConfiguracaoParaSalvar): void {
  if (!config.modeloId) {
    throw new ConfiguracaoInvalidaError('Modelo não informado')
  }
  if (!DIAS_VALIDOS.has(config.diaEnvio)) {
    throw new ConfiguracaoInvalidaError('Dia de envio inválido')
  }
  if (!HORARIO.test(config.horarioEnvio)) {
    throw new ConfiguracaoInvalidaError('Horário de envio inválido — use HH:MM')
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
  /** Tira o padrão de todos os modelos da clínica. */
  limparPadrao: () => Promise<void>
  gravar: (config: ConfiguracaoParaSalvar) => Promise<void>
}

export async function salvarConfiguracao(
  config: ConfiguracaoParaSalvar,
  deps: DependenciasDeEscrita
): Promise<void> {
  validarConfiguracao(config)

  // Só um modelo padrão por clínica. São duas escritas, e o banco não nos dá
  // transação por aqui — então a ORDEM é a garantia: limpar antes de gravar faz
  // a falha no meio deixar a clínica com ZERO padrões, não com dois. Zero a
  // tela resolve pedindo para escolher; dois é ambíguo e ninguém percebe.
  if (config.ehPadrao) await deps.limparPadrao()

  await deps.gravar(config)
}
