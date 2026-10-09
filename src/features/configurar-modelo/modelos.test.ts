import { describe, it, expect, vi } from 'vitest'
import {
  listarModelos,
  salvarConfiguracao,
  validarConfiguracao,
  ConfiguracaoInvalidaError,
  type ConfiguracaoSalva,
  type ConfiguracaoParaSalvar,
} from './modelos'

const CANAIS = [
  { id: 'c1', numero: '556231930175', nome: 'Recepção', ativo: true },
  { id: 'c2', numero: '5571981270357', nome: 'Comercial', ativo: true },
]
const REMETENTE = '556231930175'
/** Modelo de outro número da conta: o caso real de 2026-10-09, no app de lembretes. */
const DE_OUTRO_NUMERO = { id: 'm2', nome: 'Parabéns', conteudo: 'Feliz aniversário!', canalId: 'c2' }

function config(over: Partial<ConfiguracaoParaSalvar> = {}): ConfiguracaoParaSalvar {
  return {
    modeloId: 'm1',
    nome: 'Parabéns',
    parametros: { 1: 'primeiro_nome' },
    diaEnvio: 'aniversario',
    horarioEnvio: '09:00',
    ehPadrao: false,
    ativo: true,
    ...over,
  }
}

describe('listagem', () => {
  const salva: ConfiguracaoSalva = {
    id: 'cfg-1',
    parametros: { 1: 'nome' },
    diaEnvio: '1_dia_antes',
    horarioEnvio: '10:30',
    ehPadrao: true,
    ativo: true,
  }

  function deps(configs: [string, ConfiguracaoSalva][] = []) {
    return {
      listarDaPlataforma: vi.fn(async () => ({
        modelos: [
          { id: 'm1', nome: 'Parabéns', conteudo: 'Oi {{1}}, parabéns! {{2}}', canalId: null },
          { id: 'm2', nome: 'Outro', conteudo: 'Sem variáveis', canalId: null },
        ],
        canais: [],
        filtradoPorTipo: true,
      })),
      buscarConfiguracoes: vi.fn(async () => new Map(configs)),
      remetente: null,
    }
  }

  it('extrai os parâmetros do texto do modelo', async () => {
    const r = await listarModelos(deps())
    expect(r.modelos[0]!.parametrosDoTexto).toEqual(['1', '2'])
    expect(r.modelos[1]!.parametrosDoTexto).toEqual([])
  })

  it('anexa a configuração salva ao modelo certo', async () => {
    const r = await listarModelos(deps([['m1', salva]]))
    expect(r.modelos[0]!.config).toEqual(salva)
    expect(r.modelos[1]!.config).toBeNull()
  })

  it('repassa o aviso de filtro não garantido', async () => {
    const d = deps()
    d.listarDaPlataforma = vi.fn(async () => ({ modelos: [], canais: [], filtradoPorTipo: false }))
    const r = await listarModelos(d)
    expect(r.filtradoPorTipo).toBe(false)
  })

  it('configuração órfã não inventa modelo na tela', async () => {
    // Modelo removido da plataforma mas com config salva aqui: some da lista,
    // não vira item fantasma.
    const r = await listarModelos(deps([['modelo-que-nao-existe-mais', salva]]))
    expect(r.modelos.map((m) => m.modeloId)).toEqual(['m1', 'm2'])
  })

  it('diz por qual número cada modelo sai, com o de outro número por último', async () => {
    const r = await listarModelos({
      listarDaPlataforma: async () => ({
        modelos: [DE_OUTRO_NUMERO, { id: 'm1', nome: 'Parabéns', conteudo: 'Oi', canalId: 'c1' }],
        canais: CANAIS,
        filtradoPorTipo: true,
      }),
      buscarConfiguracoes: async () => new Map(),
      remetente: REMETENTE,
    })
    expect(r.modelos.map((m) => [m.modeloId, m.envio.saiPeloRemetente])).toEqual([
      ['m1', true],
      ['m2', false],
    ])
    expect(r.modelos[1]!.envio.numero).toEqual({ numero: '5571981270357', nome: 'Comercial' })
  })
})

describe('validação', () => {
  it('aceita configuração correta', () => {
    expect(() => validarConfiguracao(config())).not.toThrow()
  })

  it.each(['nome', 'primeiro_nome', 'data_nascimento', 'aniversario'])(
    'aceita o campo %s',
    (campo) => {
      expect(() => validarConfiguracao(config({ parametros: { 1: campo } }))).not.toThrow()
    }
  )

  it('recusa campo inexistente', () => {
    // No envio, campo desconhecido vira string vazia — o paciente receberia
    // "Olá ," e ninguém saberia por quê.
    expect(() => validarConfiguracao(config({ parametros: { 1: 'primeiro_nomee' } }))).toThrow(
      ConfiguracaoInvalidaError
    )
  })

  it.each(['9:00', '25:00', '09:60', '0900', '', 'manhã'])('recusa horário %s', (horarioEnvio) => {
    expect(() => validarConfiguracao(config({ horarioEnvio }))).toThrow(ConfiguracaoInvalidaError)
  })

  it.each(['00:00', '23:59', '09:00'])('aceita horário %s', (horarioEnvio) => {
    expect(() => validarConfiguracao(config({ horarioEnvio }))).not.toThrow()
  })

  it('recusa dia de envio fora da lista', () => {
    expect(() =>
      validarConfiguracao(config({ diaEnvio: '7_dias_antes' as never }))
    ).toThrow(ConfiguracaoInvalidaError)
  })

  it('recusa modelo não informado', () => {
    expect(() => validarConfiguracao(config({ modeloId: '' }))).toThrow(ConfiguracaoInvalidaError)
  })

  it('recusa modelo de outro número, dizendo os dois números', () => {
    const envio = {
      numero: { numero: '5571981270357', nome: 'Comercial' },
      remetente: { numero: REMETENTE, nome: 'Recepção' },
      saiPeloRemetente: false,
    }
    expect(() => validarConfiguracao(config(), envio)).toThrow(/\(71\) 98127-0357.*\(62\) 3193-0175/)
    expect(() => validarConfiguracao(config({ ativo: false }), envio)).not.toThrow()
  })
})

describe('salvar', () => {
  const plataforma = {
    listarDaPlataforma: vi.fn(async () => ({ modelos: [DE_OUTRO_NUMERO], canais: CANAIS, filtradoPorTipo: true })),
    remetente: REMETENTE,
  }

  function deps() {
    return { ...plataforma, limparPadrao: vi.fn(async () => {}), gravar: vi.fn(async () => {}) }
  }

  it('modelo de outro número não grava', async () => {
    const d = deps()
    await expect(salvarConfiguracao(config({ modeloId: 'm2' }), d)).rejects.toThrow(/agenda pelo/)
    expect(d.gravar).not.toHaveBeenCalled()
  })

  it('não mexe no padrão quando o modelo não é padrão', async () => {
    const d = deps()
    await salvarConfiguracao(config({ ehPadrao: false }), d)
    expect(d.limparPadrao).not.toHaveBeenCalled()
    expect(d.gravar).toHaveBeenCalled()
  })

  it('limpa o padrão ANTES de gravar', async () => {
    // A ordem é a garantia: sem transação, falhar no meio precisa deixar zero
    // padrões (a tela pede para escolher) e não dois (ambíguo e silencioso).
    const ordem: string[] = []
    const d = {
      ...plataforma,
      limparPadrao: vi.fn(async () => {
        ordem.push('limpar')
      }),
      gravar: vi.fn(async () => {
        ordem.push('gravar')
      }),
    }
    await salvarConfiguracao(config({ ehPadrao: true }), d)
    expect(ordem).toEqual(['limpar', 'gravar'])
  })

  it('não grava nada quando a validação falha', async () => {
    const d = deps()
    await expect(
      salvarConfiguracao(config({ ehPadrao: true, horarioEnvio: 'xx' }), d)
    ).rejects.toThrow(ConfiguracaoInvalidaError)
    expect(d.limparPadrao).not.toHaveBeenCalled()
    expect(d.gravar).not.toHaveBeenCalled()
  })
})
