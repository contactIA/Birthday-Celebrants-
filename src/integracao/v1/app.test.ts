import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ClinicaNaoProvisionadaError, type Clinica } from '@/shared/clinica/repositorio'
import { EnvioJaEnviadoError, EnvioNaoEncontradoError } from '@/features/cancelar-envio/cancelamento'
import type { FichaDoEnvio, ItemDoHistorico } from '@/features/historico/dados'
import type { ItemDaLista } from '@/features/listar-aniversariantes/consulta'
import { BASE_DA_API, criarApiDeIntegracao } from './app'
import type { Servicos } from './servicos'

// A API de integração inteira, com os serviços trocados por dublês: a chave, o
// escopo da clínica, a validação da entrada e da saída, e o contrato.

const CHAVE = 'chave-da-integracao-de-teste'
const HASH = createHash('sha256').update(CHAVE).digest('hex')

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const UNIDADE_A1 = 'aaaaaaaa-0000-4000-8000-000000000001'
const UNIDADE_A2 = 'aaaaaaaa-0000-4000-8000-000000000002'
const UNIDADE_B1 = 'bbbbbbbb-0000-4000-8000-000000000001'
const ENVIO = 'eeeeeeee-0000-4000-8000-000000000001'

const UNIDADES: Record<string, { id: string; nome: string; principal: boolean }[]> = {
  [A]: [
    { id: UNIDADE_A1, nome: 'Centro', principal: true },
    { id: UNIDADE_A2, nome: 'Bueno', principal: false },
  ],
  [B]: [{ id: UNIDADE_B1, nome: 'Matriz', principal: true }],
}

/** Como o repositório de verdade: unidade que não é da clínica cai na principal. */
function clinicaFalsa(companyId: string, unidadeId: string | null): Clinica {
  const unidades = UNIDADES[companyId]
  if (!unidades) throw new ClinicaNaoProvisionadaError(companyId)
  const unidade = unidades.find((u) => u.id === unidadeId) ?? unidades[0]!
  return {
    id: `local-${companyId}`,
    companyId,
    nome: companyId === A ? 'Clínica A' : 'Clínica B',
    unidade,
    timezone: 'America/Sao_Paulo',
    sistemaProntuario: 'clinicorp',
    credenciais: { mensageria: { token: 'SEGREDO', from: null } },
  } as unknown as Clinica
}

const ITEM_DO_HISTORICO: ItemDoHistorico = {
  id: ENVIO,
  pacienteNome: 'Maria Souza',
  pacienteTelefone: '+5562981870000',
  status: 'scheduled',
  agendadoPara: '2026-11-09T12:00:00.000Z',
  criadoEm: '2026-11-05T12:00:00.000Z',
  modeloNome: 'Parabéns',
  podeCancelar: true,
  remetente: null,
  motivoDaFalha: null,
  naoSaiu: false,
}

const ITEM_PAGINA = { itens: [ITEM_DO_HISTORICO], total: 1, pagina: 1, porPagina: 50, remetente: null }

const FICHA: FichaDoEnvio = {
  id: ENVIO,
  pacienteNome: 'Maria Souza',
  pacienteTelefone: '+5562981870000',
  dataNascimento: '1990-11-10',
  ano: 2026,
  status: 'failed',
  motivoDaFalha: 'Número sem WhatsApp',
  oQueFazer: 'Confira o número',
  naoSaiu: false,
  agendadoPara: '2026-11-10T12:00:00.000Z',
  criadoEm: '2026-11-05T12:00:00.000Z',
  modeloNome: 'Parabéns',
  arquivoNome: null,
  remetente: '+5562999990000',
  texto: 'Feliz aniversário, Maria!',
  podeCancelar: false,
  linhaDoTempo: [{ chave: 'agendado', rotulo: 'Agendado', estado: 'feito', quando: '2026-11-05T12:00:00.000Z' }],
  outros: [{ id: 'eeeeeeee-0000-4000-8000-000000000002', status: 'read', ano: 2025, agendadoPara: '2025-11-10T12:00:00.000Z' }],
}

const ANIVERSARIANTE: ItemDaLista = {
  id: '123',
  nome: 'Maria Souza',
  telefone: '+5562981870000',
  aniversario: '11/10',
  datanascimento: '10/11/1990',
  situacao: 'ativo',
  jaPassou: false,
  agendavel: true,
  envio: { pacienteId: '123', status: 'scheduled', scheduledFor: '2099-11-10T12:00:00.000Z' },
}

function servicosFalsos() {
  return {
    buscarClinica: vi.fn<Servicos['buscarClinica']>(async (companyId, unidadeId) => clinicaFalsa(companyId, unidadeId)),
    buscarClinicaPublica: vi.fn<Servicos['buscarClinicaPublica']>(async (companyId) => {
      const c = clinicaFalsa(companyId, null)
      return {
        id: c.id,
        companyId,
        nome: c.nome,
        unidades: UNIDADES[companyId]!,
        unidadeAtualId: c.unidade.id,
        // Campo que não é do contrato: não pode sair.
        token: 'SEGREDO',
      } as Awaited<ReturnType<Servicos['buscarClinicaPublica']>>
    }),
    modelos: vi.fn<Servicos['modelos']>(async () => ({
      filtradoPorTipo: true,
      modelos: [
        {
          modeloId: 'mod-1',
          nome: 'Parabéns',
          conteudo: 'Feliz aniversário, {{1}}',
          variaveis: [{ nome: '1', marcacao: '{{1}}', obrigatoria: true }],
          envio: {
            numero: { numero: '+5562999990000', nome: 'Recepção' },
            remetente: null,
            saiPeloRemetente: null,
            porOutroNumero: false,
            equipe: null,
            permitido: true,
            recusa: null,
          },
          midia: null,
          config: {
            id: 'cfg-1',
            parametros: { '1': 'primeiro_nome' },
            diaEnvio: 'aniversario',
            horarioEnvio: '09:00',
            ehPadrao: true,
            ativo: true,
            arquivo: null,
          },
        },
      ],
    })),
    salvarModelo: vi.fn<Servicos['salvarModelo']>(async () => {}),
    aniversariantes: vi.fn<Servicos['aniversariantes']>(async (_, mes) => ({
      itens: [ANIVERSARIANTE],
      mes: mes ?? 11,
      hoje: { ano: 2026, mes: 11, dia: 6 },
      aguardandoSincronizacao: false,
    })),
    historico: vi.fn<Servicos['historico']>(async (_, pagina, porPagina) => ({ ...ITEM_PAGINA, pagina, porPagina })),
    ficha: vi.fn<Servicos['ficha']>(async () => FICHA),
    cancelarEnvio: vi.fn<Servicos['cancelarEnvio']>(async () => ({ situacao: 'cancelado' })),
    uso: vi.fn<Servicos['uso']>(async (clinica) => ({
      modulo: 'aniversariantes',
      geradoEm: '2026-11-06T12:00:00.000Z',
      clinicas: [
        {
          companyId: clinica.companyId,
          nome: clinica.nome,
          ligado: true,
          setupId: clinica.id,
          setupUrl: null,
          unidades: [],
          envios: {
            total: 0,
            porSituacao: { agendado: 0, processando: 0, enviado: 0, entregue: 0, lido: 0, cancelado: 0, falhou: 0 },
            ultimoEnvioEm: null,
            ultimos30Dias: 0,
            ultimos90Dias: 0,
          },
        },
      ],
    })),
  } satisfies Servicos
}

let servicos: ReturnType<typeof servicosFalsos>

function pedir(caminho: string, init: RequestInit & { chave?: string | null } = {}) {
  const { chave = CHAVE, ...resto } = init
  const headers = new Headers(resto.headers)
  if (chave !== null) headers.set('authorization', `Bearer ${chave}`)
  if (resto.body !== undefined) headers.set('content-type', 'application/json')
  return criarApiDeIntegracao(servicos).request(`${BASE_DA_API}${caminho}`, { ...resto, headers })
}

const CORPO_DO_MODELO = {
  nome: 'Parabéns',
  parametros: { '1': 'primeiro_nome' },
  diaEnvio: 'aniversario',
  horarioEnvio: '09:00',
  emUso: true,
}

/** Todas as operações, com um pedido válido de cada uma. */
const OPERACOES: { metodo: string; caminho: (companyId: string) => string; corpo?: unknown; servico: keyof Servicos }[] = [
  { metodo: 'GET', caminho: (c) => `/clinicas/${c}`, servico: 'buscarClinicaPublica' },
  { metodo: 'GET', caminho: (c) => `/clinicas/${c}/uso`, servico: 'uso' },
  { metodo: 'GET', caminho: (c) => `/clinicas/${c}/modelos`, servico: 'modelos' },
  { metodo: 'PUT', caminho: (c) => `/clinicas/${c}/modelos/mod-1`, corpo: CORPO_DO_MODELO, servico: 'salvarModelo' },
  { metodo: 'GET', caminho: (c) => `/clinicas/${c}/aniversariantes?mes=11`, servico: 'aniversariantes' },
  { metodo: 'GET', caminho: (c) => `/clinicas/${c}/envios`, servico: 'historico' },
  { metodo: 'GET', caminho: (c) => `/clinicas/${c}/envios/proximos`, servico: 'historico' },
  { metodo: 'GET', caminho: (c) => `/clinicas/${c}/envios/${ENVIO}`, servico: 'ficha' },
  { metodo: 'POST', caminho: (c) => `/clinicas/${c}/envios/${ENVIO}/cancelar`, servico: 'cancelarEnvio' },
]

type Operacao = (typeof OPERACOES)[number]

const rotulo = (o: Operacao) => `${o.metodo} ${o.caminho('{companyId}').split('?')[0]}`
const casos = (lista: Operacao[]) => lista.map((o) => [rotulo(o), o] as const)

function comUnidade(o: Operacao, companyId: string, unidade: string) {
  const caminho = o.caminho(companyId)
  return pedir(`${caminho}${caminho.includes('?') ? '&' : '?'}unidade=${unidade}`, {
    method: o.metodo,
    body: o.corpo === undefined ? undefined : JSON.stringify(o.corpo),
  })
}

function pedirOperacao(o: Operacao, companyId: string, extra: RequestInit & { chave?: string | null } = {}) {
  return pedir(o.caminho(companyId), {
    method: o.metodo,
    body: o.corpo === undefined ? undefined : JSON.stringify(o.corpo),
    ...extra,
  })
}

beforeEach(() => {
  servicos = servicosFalsos()
  vi.stubEnv('INTEGRACAO_API_CHAVE_HASH', HASH)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('o contrato (openapi.json)', () => {
  it('abre sem chave, em OpenAPI 3.1, com a chave declarada', async () => {
    const res = await pedir('/openapi.json', { chave: null })
    expect(res.status).toBe(200)
    const doc = await res.json()
    expect(doc.openapi).toBe('3.1.0')
    expect(doc.components.securitySchemes.ChaveDaIntegracao).toMatchObject({ type: 'http', scheme: 'bearer' })
  })

  it('tem exatamente as operações testadas aqui, cada uma com resumo, descrição, chave e erro no formato { erro, codigo }', async () => {
    const doc = await (await pedir('/openapi.json', { chave: null })).json()
    const operacoes: string[] = []
    for (const [caminho, metodos] of Object.entries<Record<string, Record<string, unknown>>>(doc.paths)) {
      for (const [metodo, op] of Object.entries(metodos)) {
        operacoes.push(`${metodo.toUpperCase()} ${caminho.replace(BASE_DA_API, '')}`)
        expect(op.summary, caminho).toEqual(expect.any(String))
        expect((op.description as string).length, caminho).toBeGreaterThan(40)
        expect(op.security).toEqual([{ ChaveDaIntegracao: [] }])
        const respostas = op.responses as Record<string, { content?: Record<string, { schema: unknown }> }>
        expect(respostas['401']!.content!['application/json']!.schema).toEqual({ $ref: '#/components/schemas/Erro' })
      }
    }
    const esperadas = OPERACOES.map(rotulo).map((r) => r.replace(ENVIO, '{envioId}').replace('mod-1', '{modeloId}'))
    expect(operacoes.sort()).toEqual(esperadas.sort())
  })

  it('não cita o fornecedor da plataforma de mensagens nem usa travessão', async () => {
    const texto = await (await pedir('/openapi.json', { chave: null })).text()
    expect(texto).not.toMatch(/helena|wts/i)
    expect(texto).not.toContain('—')
  })

  it('os padrões vão sem flag, como o OpenAPI espera', async () => {
    const texto = await (await pedir('/openapi.json', { chave: null })).text()
    expect(texto).not.toMatch(/\$\/[a-z]+"/)
  })
})

describe('a chave', () => {
  it.each(casos(OPERACOES))('%s: 503 sem a variável, sem ler nada', async (_, o) => {
    vi.stubEnv('INTEGRACAO_API_CHAVE_HASH', '')
    const res = await pedirOperacao(o, A)
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ erro: 'Integração não configurada neste servidor', codigo: 'INTEGRACAO_NAO_CONFIGURADA' })
    expect(servicos.buscarClinica).not.toHaveBeenCalled()
    expect(servicos.buscarClinicaPublica).not.toHaveBeenCalled()
  })

  it.each(casos(OPERACOES))('%s: 401 sem a chave ou com outra', async (_, o) => {
    for (const chave of [null, 'outra-chave', HASH]) {
      const res = await pedirOperacao(o, A, { chave })
      expect(res.status).toBe(401)
      expect(await res.json()).toMatchObject({ codigo: 'NAO_AUTORIZADO' })
    }
    expect(servicos.buscarClinica).not.toHaveBeenCalled()
    expect(servicos.buscarClinicaPublica).not.toHaveBeenCalled()
    expect(servicos[o.servico]).not.toHaveBeenCalled()
  })
})

describe('o escopo da clínica', () => {
  it.each(casos(OPERACOES))('%s: a clínica do caminho, e só ela, chega ao serviço', async (_, o) => {
    const res = await pedirOperacao(o, B)
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    const alvo = vi.mocked(servicos[o.servico]).mock.calls[0]![0] as Clinica | string
    expect(typeof alvo === 'string' ? alvo : alvo.companyId).toBe(B)
    if (typeof alvo !== 'string') expect(alvo.unidade.id).toBe(UNIDADE_B1)
  })

  it.each(casos(OPERACOES))('%s: clínica sem o módulo ligado, 404', async (_, o) => {
    const res = await pedirOperacao(o, '33333333-3333-4333-8333-333333333333')
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ erro: 'Clínica não está provisionada no painel', codigo: 'CLINICA_NAO_PROVISIONADA' })
  })

  const POR_UNIDADE = OPERACOES.filter((o) => !['buscarClinicaPublica', 'uso'].includes(o.servico))

  it.each(casos(POR_UNIDADE))('%s: unidade de outra clínica, 404 sem ler nada', async (_, o) => {
    const res = await comUnidade(o, A, UNIDADE_B1)
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ erro: 'Unidade não encontrada', codigo: 'UNIDADE_NAO_ENCONTRADA' })
    expect(servicos[o.servico]).not.toHaveBeenCalled()
  })

  it.each(casos(POR_UNIDADE))('%s: a unidade pedida da clínica chega ao serviço', async (_, o) => {
    const res = await comUnidade(o, A, UNIDADE_A2)
    expect(res.status).toBe(200)
    expect((vi.mocked(servicos[o.servico]).mock.calls[0]![0] as Clinica).unidade.id).toBe(UNIDADE_A2)
  })

  it('a resposta da unidade diz qual unidade é', async () => {
    const res = await pedir(`/clinicas/${A}/envios?unidade=${UNIDADE_A2}`)
    expect((await res.json()).unidade).toEqual({ id: UNIDADE_A2, nome: 'Bueno' })
  })

  it('o repositório que devolve outra clínica não passa', async () => {
    servicos.buscarClinica.mockImplementation(async () => clinicaFalsa(B, null))
    const res = await pedir(`/clinicas/${A}/envios`)
    expect(res.status).toBe(404)
    expect(servicos.historico).not.toHaveBeenCalled()
  })

  it('envio de outra clínica ou unidade: 404 na ficha', async () => {
    servicos.ficha.mockResolvedValue(null)
    const res = await pedir(`/clinicas/${A}/envios/${ENVIO}`)
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ erro: 'Este envio não foi encontrado nesta unidade', codigo: 'ENVIO_NAO_ENCONTRADO' })
  })

  it('envio de outra clínica ou unidade: 404 no cancelamento', async () => {
    servicos.cancelarEnvio.mockRejectedValue(new EnvioNaoEncontradoError())
    const res = await pedir(`/clinicas/${A}/envios/${ENVIO}/cancelar`, { method: 'POST' })
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ erro: 'Agendamento não encontrado', codigo: 'ENVIO_NAO_ENCONTRADO' })
  })
})

describe('a validação da entrada', () => {
  it('companyId que não é UUID: 400 com o campo', async () => {
    const res = await pedir('/clinicas/oral-foz/envios')
    expect(res.status).toBe(400)
    const corpo = await res.json()
    expect(corpo).toMatchObject({ erro: 'Requisição inválida', codigo: 'REQUISICAO_INVALIDA' })
    expect(corpo.detalhes).toEqual([expect.objectContaining({ campo: 'companyId' })])
    expect(servicos.buscarClinica).not.toHaveBeenCalled()
  })

  it.each([
    ['data fora do formato', `/clinicas/${A}/envios?de=06/11/2026`],
    ['situação que não existe', `/clinicas/${A}/envios?situacao=todas`],
    ['página zero', `/clinicas/${A}/envios?pagina=0`],
    ['página grande demais', `/clinicas/${A}/envios?porPagina=500`],
    ['mês fora da faixa', `/clinicas/${A}/aniversariantes?mes=13`],
    ['unidade que não é UUID', `/clinicas/${A}/modelos?unidade=centro`],
    ['envio que não é UUID', `/clinicas/${A}/envios/123`],
  ])('%s: 400', async (_, caminho) => {
    const res = await pedir(caminho)
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ codigo: 'REQUISICAO_INVALIDA' })
  })

  it.each([
    ['campo que não existe', { ...CORPO_DO_MODELO, parametros: { '1': 'telefone' } }],
    ['dia de envio que não existe', { ...CORPO_DO_MODELO, diaEnvio: '2_dias_antes' }],
    ['horário fora do formato', { ...CORPO_DO_MODELO, horarioEnvio: '9h' }],
    ['sem dizer se fica em uso', { ...CORPO_DO_MODELO, emUso: undefined }],
  ])('salvar modelo com %s: 400 sem gravar', async (_, corpo) => {
    const res = await pedir(`/clinicas/${A}/modelos/mod-1`, { method: 'PUT', body: JSON.stringify(corpo) })
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ codigo: 'REQUISICAO_INVALIDA' })
    expect(servicos.salvarModelo).not.toHaveBeenCalled()
  })

  it('corpo que não é JSON: 400 no mesmo formato', async () => {
    const res = await pedir(`/clinicas/${A}/modelos/mod-1`, { method: 'PUT', body: '{nome' })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ erro: 'Requisição inválida', codigo: 'REQUISICAO_INVALIDA' })
    expect(servicos.salvarModelo).not.toHaveBeenCalled()
  })

  it('rota que não existe: 404 no mesmo formato', async () => {
    const res = await pedir('/clinicas')
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ erro: 'Rota não encontrada', codigo: 'ROTA_NAO_ENCONTRADA' })
  })
})

describe('a validação da saída', () => {
  it('campo fora do contrato não sai', async () => {
    const corpo = await (await pedir(`/clinicas/${A}`)).json()
    expect(corpo).toEqual({ companyId: A, nome: 'Clínica A', unidades: UNIDADES[A] })
  })

  it('resposta fora do contrato é 500 genérico, com o detalhe só no log', async () => {
    servicos.historico.mockResolvedValue({ ...ITEM_PAGINA, total: 'muitos' as never })
    const res = await pedir(`/clinicas/${A}/envios`)
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ erro: 'Não foi possível completar a operação', codigo: 'ERRO_INTERNO' })
    expect(console.error).toHaveBeenCalled()
  })
})

describe('as operações', () => {
  it('histórico: situação, período e busca passam pela leitura da tela', async () => {
    await pedir(`/clinicas/${A}/envios?situacao=nao_sairam&de=2026-11-01&ate=2026-11-05&busca=Maria,x&pagina=2&porPagina=10`)
    const [, pagina, porPagina, filtros] = servicos.historico.mock.calls[0]!
    expect([pagina, porPagina]).toEqual([2, 10])
    expect(filtros).toEqual({
      busca: 'Maria x',
      buscaDigitos: null,
      situacao: 'nao_sairam',
      ordem: 'envio',
      crescente: false,
      periodo: { de: '2026-11-01', ate: '2026-11-05' },
    })
  })

  it('histórico: o envio sai com a situação em português e o "não saiu"', async () => {
    servicos.historico.mockResolvedValue({ ...ITEM_PAGINA, itens: [{ ...ITEM_DO_HISTORICO, naoSaiu: true }] })
    const corpo = await (await pedir(`/clinicas/${A}/envios`)).json()
    expect(corpo.itens[0]).toMatchObject({ id: ENVIO, situacao: 'agendado', naoSaiu: true })
  })

  it('próximos: as agendadas, da mais próxima à mais distante; com `ate`, de hoje até lá', async () => {
    await pedir(`/clinicas/${A}/envios/proximos`)
    expect(servicos.historico.mock.calls[0]![3]).toMatchObject({ situacao: 'agendadas', ordem: 'envio', crescente: true, periodo: null })

    await pedir(`/clinicas/${A}/envios/proximos?ate=2099-12-31`)
    expect(servicos.historico.mock.calls[1]![3]!.periodo).toEqual({ de: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), ate: '2099-12-31' })
  })

  it('salvar modelo: o modelo do caminho, em uso como o "Usar este modelo" da tela', async () => {
    const res = await pedir(`/clinicas/${A}/modelos/mod-1`, { method: 'PUT', body: JSON.stringify(CORPO_DO_MODELO) })
    expect(await res.json()).toEqual({ ok: true })
    expect(servicos.salvarModelo.mock.calls[0]![1]).toEqual({
      modeloId: 'mod-1',
      nome: 'Parabéns',
      parametros: { '1': 'primeiro_nome' },
      diaEnvio: 'aniversario',
      horarioEnvio: '09:00',
      ehPadrao: true,
      ativo: true,
    })
  })

  it('modelos: a configuração sai com "em uso"', async () => {
    const corpo = await (await pedir(`/clinicas/${A}/modelos`)).json()
    expect(corpo.modelos[0]).toMatchObject({
      modeloId: 'mod-1',
      podeUsar: true,
      numero: '+5562999990000',
      motivoDeNaoUsar: null,
      configuracao: { id: 'cfg-1', diaEnvio: 'aniversario', emUso: true, arquivoNome: null },
    })
    expect(corpo.campos.map((c: { valor: string }) => c.valor)).toContain('primeiro_nome')
  })

  it('aniversariantes: o mês chega ao serviço, e o paciente sai com o dia, o mês e o parabéns', async () => {
    const corpo = await (await pedir(`/clinicas/${A}/aniversariantes?mes=11`)).json()
    expect(servicos.aniversariantes.mock.calls[0]![1]).toBe(11)
    expect(corpo).toMatchObject({ mes: 11, hoje: '2026-11-06', aguardandoSincronizacao: false })
    expect(corpo.itens[0]).toEqual({
      pacienteId: '123',
      nome: 'Maria Souza',
      telefone: '+5562981870000',
      dia: 10,
      mes: 11,
      dataNascimento: '10/11/1990',
      jaPassou: false,
      agendavel: true,
      envio: { situacao: 'agendado', naoSaiu: false, agendadoPara: '2099-11-10T12:00:00.000Z' },
    })
  })

  it('aniversariantes: sem mês, vale o do serviço (o de hoje)', async () => {
    await pedir(`/clinicas/${A}/aniversariantes`)
    expect(servicos.aniversariantes.mock.calls[0]![1]).toBeNull()
  })

  it('cancelar: o resultado do serviço; mensagem que já saiu é 409', async () => {
    expect(await (await pedir(`/clinicas/${A}/envios/${ENVIO}/cancelar`, { method: 'POST' })).json()).toEqual({ resultado: 'cancelado' })
    servicos.cancelarEnvio.mockRejectedValue(new EnvioJaEnviadoError())
    const res = await pedir(`/clinicas/${A}/envios/${ENVIO}/cancelar`, { method: 'POST' })
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ erro: 'Esta mensagem já foi enviada e não pode mais ser cancelada', codigo: 'ENVIO_JA_ENVIADO' })
  })

  it('ficha: a falha com o que fazer e os outros anos', async () => {
    const corpo = await (await pedir(`/clinicas/${A}/envios/${ENVIO}`)).json()
    expect(corpo).toMatchObject({ situacao: 'falhou', ano: 2026, oQueFazer: 'Confira o número', texto: 'Feliz aniversário, Maria!' })
    expect(corpo.outros).toEqual([
      { id: 'eeeeeeee-0000-4000-8000-000000000002', situacao: 'lido', naoSaiu: false, ano: 2025, agendadoPara: '2025-11-10T12:00:00.000Z' },
    ])
  })

  it('uso: o resumo só da clínica', async () => {
    const corpo = await (await pedir(`/clinicas/${A}/uso`)).json()
    expect(corpo).toMatchObject({ modulo: 'aniversariantes', clinica: { companyId: A, setupId: `local-${A}` } })
  })
})
