import { describe, it, expect, vi } from 'vitest'
import {
  enviarArquivoDoModelo,
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
/** Sem o cadastro comum: só o remetente vale. */
const UNIDADE = { from: REMETENTE, equipeId: null, deOutrasUnidades: null }
/** Com o cadastro comum: o c2 é livre, e nenhuma unidade o tem. */
const UNIDADE_NO_CADASTRO = { ...UNIDADE, deOutrasUnidades: [] }
const EQUIPES = [{ id: 'eq-geral', nome: 'Geral', padrao: true, canais: 'todos' as const }]
/** Modelo de outro número da conta: o caso real de 2026-10-09, no app de lembretes. */
const DE_OUTRO_NUMERO = { id: 'm2', nome: 'Parabéns', conteudo: 'Feliz aniversário!', canalId: 'c2' }
const semEquipes = vi.fn(async () => {
  throw new Error('não devia consultar as equipes')
})

function config(over: Partial<ConfiguracaoParaSalvar> = {}): ConfiguracaoParaSalvar {
  return {
    modeloId: 'm1',
    nome: 'Parabéns',
    parametros: { 1: 'primeiro_nome' },
    diaEnvio: 'aniversario',
    horarioEnvio: '09:00',
    ehPadrao: false,
    ativo: true,
    arquivo: null,
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
    arquivo: null,
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
      listarEquipes: semEquipes,
      unidade: { ...UNIDADE, from: null },
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

  const listagem = async () => ({
    modelos: [DE_OUTRO_NUMERO, { id: 'm1', nome: 'Parabéns', conteudo: 'Oi', canalId: 'c1' }],
    canais: CANAIS,
    filtradoPorTipo: true,
  })

  it('sem o cadastro comum: diz por qual número cada modelo sai, com o recusado por último', async () => {
    const r = await listarModelos({
      listarDaPlataforma: listagem,
      listarEquipes: semEquipes,
      buscarConfiguracoes: async () => new Map(),
      unidade: UNIDADE,
    })
    expect(r.modelos.map((m) => [m.modeloId, m.envio.saiPeloRemetente, m.envio.permitido])).toEqual([
      ['m1', true, true],
      ['m2', false, false],
    ])
    expect(r.modelos[1]!.envio.numero).toEqual({ numero: '5571981270357', nome: 'Comercial' })
  })

  it('com o cadastro comum: o modelo de outro número livre serve, com a equipe que agenda por ele', async () => {
    const listarEquipes = vi.fn(async () => EQUIPES)
    const r = await listarModelos({
      listarDaPlataforma: listagem,
      listarEquipes,
      buscarConfiguracoes: async () => new Map(),
      unidade: UNIDADE_NO_CADASTRO,
    })
    expect(listarEquipes).toHaveBeenCalledTimes(1)
    const m2 = r.modelos.find((m) => m.modeloId === 'm2')!
    expect(m2.envio).toMatchObject({ porOutroNumero: true, permitido: true, equipe: { id: 'eq-geral', nome: 'Geral' } })
  })

  it('com o cadastro comum e só modelos do remetente: não consulta as equipes', async () => {
    await listarModelos({
      listarDaPlataforma: async () => ({ ...(await listagem()), modelos: [{ id: 'm1', nome: 'P', conteudo: 'Oi', canalId: 'c1' }] }),
      listarEquipes: semEquipes,
      buscarConfiguracoes: async () => new Map(),
      unidade: UNIDADE_NO_CADASTRO,
    })
    expect(semEquipes).not.toHaveBeenCalled()
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
      porOutroNumero: false,
      equipe: null,
      permitido: false,
      recusa: { tipo: 'fora-do-remetente' as const },
    }
    expect(() => validarConfiguracao(config(), envio)).toThrow(/\(71\) 98127-0357.*\(62\) 3193-0175/)
    expect(() => validarConfiguracao(config({ ativo: false }), envio)).not.toThrow()
  })
})

describe('salvar', () => {
  const plataforma = {
    listarDaPlataforma: vi.fn(async () => ({ modelos: [DE_OUTRO_NUMERO], canais: CANAIS, filtradoPorTipo: true })),
    listarEquipes: semEquipes,
    unidade: UNIDADE,
  }

  function deps() {
    return { ...plataforma, limparPadrao: vi.fn(async () => {}), gravar: vi.fn(async () => {}) }
  }

  it('modelo de outro número não grava', async () => {
    const d = deps()
    await expect(salvarConfiguracao(config({ modeloId: 'm2' }), d)).rejects.toThrow(/agenda pelo/)
    expect(d.gravar).not.toHaveBeenCalled()
  })

  it('com o cadastro comum, o modelo de outro número livre grava; sem equipe que o atenda, não', async () => {
    const comEquipe = { ...deps(), unidade: UNIDADE_NO_CADASTRO, listarEquipes: vi.fn(async () => EQUIPES) }
    await salvarConfiguracao(config({ modeloId: 'm2' }), comEquipe)
    expect(comEquipe.gravar).toHaveBeenCalled()

    const semNinguem = { ...deps(), unidade: UNIDADE_NO_CADASTRO, listarEquipes: vi.fn(async () => []) }
    await expect(salvarConfiguracao(config({ modeloId: 'm2' }), semNinguem)).rejects.toThrow(/Nenhuma equipe da conta atende/)
    expect(semNinguem.gravar).not.toHaveBeenCalled()
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

describe('modelo com mídia', () => {
  const COM_VIDEO = { id: 'm3', nome: 'Parabéns com vídeo', conteudo: 'Oi!', canalId: null, midia: 'video' as const }
  const plataforma = vi.fn(async () => ({ modelos: [COM_VIDEO], canais: CANAIS, filtradoPorTipo: true }))
  const MB = 1024 * 1024

  it('não salva ativo sem o vídeo enviado', async () => {
    const gravar = vi.fn(async () => {})
    const d = { listarDaPlataforma: plataforma, listarEquipes: semEquipes, unidade: UNIDADE, limparPadrao: vi.fn(async () => {}), gravar }
    await expect(salvarConfiguracao(config({ modeloId: 'm3', parametros: {} }), d)).rejects.toThrow(
      'Este modelo tem vídeo. Envie o vídeo em Modelos e salve: sem ele, a mensagem falha no envio.'
    )
    expect(gravar).not.toHaveBeenCalled()

    await salvarConfiguracao(config({ modeloId: 'm3', parametros: {}, arquivo: { id: 'arq-1', nome: 'parabens.mp4' } }), d)
    expect(gravar).toHaveBeenCalledWith(expect.objectContaining({ arquivo: { id: 'arq-1', nome: 'parabens.mp4' } }))
  })

  it('a listagem diz a mídia de cada modelo', async () => {
    const r = await listarModelos({
      listarDaPlataforma: plataforma,
      listarEquipes: semEquipes,
      buscarConfiguracoes: vi.fn(async () => new Map()),
      unidade: UNIDADE,
    })
    expect(r.modelos[0]).toMatchObject({ modeloId: 'm3', midia: 'video' })
  })

  it('envia o vídeo: confere tipo e tamanho ANTES de subir, e devolve o id com o nome', async () => {
    const subirArquivo = vi.fn(async () => 'arquivo-na-plataforma')
    const d = { listarDaPlataforma: plataforma, subirArquivo }

    await expect(
      enviarArquivoDoModelo('m3', { nome: 'grande.mp4', mimeType: 'video/mp4', conteudo: new ArrayBuffer(17 * MB) }, d)
    ).rejects.toThrow(/aceita até 16 MB/)
    await expect(
      enviarArquivoDoModelo('m3', { nome: 'filme.mov', mimeType: 'video/quicktime', conteudo: new ArrayBuffer(MB) }, d)
    ).rejects.toThrow(/precisa ser MP4 ou 3GPP/)
    expect(subirArquivo).not.toHaveBeenCalled()

    const enviado = await enviarArquivoDoModelo(
      'm3',
      { nome: 'C:\\fakepath\\parabens.mp4', mimeType: 'video/mp4', conteudo: new ArrayBuffer(MB) },
      d
    )
    expect(enviado).toEqual({ id: 'arquivo-na-plataforma', nome: 'parabens.mp4' })
    expect(subirArquivo).toHaveBeenCalledWith(expect.objectContaining({ nome: 'parabens.mp4', tipo: 'video', mimeType: 'video/mp4' }))
  })

  it('modelo só de texto, ou fora da plataforma, não recebe arquivo', async () => {
    const d = {
      listarDaPlataforma: vi.fn(async () => ({ modelos: [{ ...COM_VIDEO, midia: null }], canais: [], filtradoPorTipo: true })),
      subirArquivo: vi.fn(async () => 'x'),
    }
    const arquivo = { nome: 'a.mp4', mimeType: 'video/mp4', conteudo: new ArrayBuffer(MB) }
    await expect(enviarArquivoDoModelo('m3', arquivo, d)).rejects.toThrow(/só de texto/)
    await expect(enviarArquivoDoModelo('outro', arquivo, d)).rejects.toThrow(/não encontrado/)
    expect(d.subirArquivo).not.toHaveBeenCalled()
  })
})
