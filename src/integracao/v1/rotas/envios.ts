import { createRoute, z } from '@hono/zod-openapi'
import { hojeNoTimezone } from '@/shared/data/fuso'
import { EnvioNaoEncontradoError } from '@/features/historico/ficha'
import { lerFiltros, SITUACOES } from '@/features/historico/filtros'
import { POR_PAGINA_MAXIMO, POR_PAGINA_PADRAO, type ItemDoHistorico } from '@/features/historico/dados'
import { clinicaDoEscopo } from '../escopo'
import {
  Data,
  IdDeEnvio,
  json,
  NaoSaiu,
  ParametroDaUnidade,
  ParametrosDaClinica,
  respostasDeErro,
  Situacao,
  situacaoDoEnvio,
  UnidadeEmUso,
} from '../esquemas'
import { novoRoteador } from '../roteador'

// Os envios (mensagens de parabéns) da unidade: o histórico com filtros, os
// próximos a sair, a ficha de um envio e o cancelamento. Só o banco deste app,
// menos o cancelamento, que pede à plataforma de mensagens.

const SEGURANCA = [{ ChaveDaIntegracao: [] }]

const Envio = z.object({
  id: z.string().openapi({ description: 'O id do envio: é o que a ficha e o cancelamento recebem' }),
  pacienteNome: z.string(),
  pacienteTelefone: z.string().openapi({ description: 'O celular do paciente, como saiu (E.164)' }),
  situacao: Situacao,
  naoSaiu: NaoSaiu,
  motivoDaFalha: z.string().nullable().openapi({ description: 'Por que a plataforma diz que falhou. Só em falha.' }),
  agendadoPara: z.string().nullable().openapi({ description: 'O instante (ISO) marcado para sair' }),
  criadoEm: z.string().openapi({ description: 'Quando o parabéns foi agendado (ISO)' }),
  modeloNome: z.string().nullable().openapi({ description: 'O modelo usado. Nulo se a configuração foi apagada depois.' }),
  remetente: z.string().nullable().openapi({ description: 'O número por onde foi agendado. Nulo nos envios antigos.' }),
  podeCancelar: z.boolean().openapi({ description: 'Se ainda dá para cancelar: agendado, e com o registro na plataforma' }),
})

const PaginaDeEnvios = z
  .object({
    unidade: UnidadeEmUso,
    pagina: z.number().int(),
    porPagina: z.number().int(),
    total: z.number().int().openapi({ description: 'Quantos envios passam nos filtros, em todas as páginas' }),
    itens: z.array(Envio),
  })
  .openapi('PaginaDeEnvios')

function paraEnvio(item: ItemDoHistorico) {
  return {
    id: item.id,
    pacienteNome: item.pacienteNome,
    pacienteTelefone: item.pacienteTelefone,
    situacao: situacaoDoEnvio(item.status, item.agendadoPara, new Date()).situacao,
    naoSaiu: item.naoSaiu,
    motivoDaFalha: item.motivoDaFalha,
    agendadoPara: item.agendadoPara,
    criadoEm: item.criadoEm,
    modeloNome: item.modeloNome,
    remetente: item.remetente,
    podeCancelar: item.podeCancelar,
  }
}

const Pagina = z.coerce
  .number()
  .int()
  .min(1)
  .max(10_000)
  .default(1)
  .openapi({ description: 'A página, a partir de 1', example: 1 })

const PorPagina = z.coerce
  .number()
  .int()
  .min(1)
  .max(POR_PAGINA_MAXIMO)
  .default(POR_PAGINA_PADRAO)
  .openapi({ description: `Itens por página, até ${POR_PAGINA_MAXIMO}`, example: POR_PAGINA_PADRAO })

const FiltrosDoHistorico = z.object({
  unidade: ParametroDaUnidade,
  pagina: Pagina,
  porPagina: PorPagina,
  situacao: z
    .enum(Object.keys(SITUACOES) as [keyof typeof SITUACOES, ...(keyof typeof SITUACOES)[]])
    .optional()
    .openapi({
      description:
        'agendadas (ainda vão sair), nao_sairam (passaram mais de 2 horas do horário e não saíram), enviadas ' +
        '(enviada, entregue ou lida), canceladas ou falhas. Sem ele, todas.',
    }),
  de: Data.optional().openapi({ description: 'Envios marcados para sair desde este dia (AAAA-MM-DD, inclusive), no fuso da clínica' }),
  ate: Data.optional().openapi({ description: 'Envios marcados para sair até este dia (AAAA-MM-DD, inclusive), no fuso da clínica' }),
  busca: z.string().max(60).optional().openapi({ description: 'Parte do nome do paciente, ou do telefone (3 dígitos ou mais)' }),
  ordem: z
    .enum(['envio', 'criacao'])
    .default('envio')
    .openapi({ description: 'Ordenar pelo horário do envio ou por quando foi agendado' }),
  direcao: z.enum(['asc', 'desc']).default('desc').openapi({ description: 'desc: os mais recentes primeiro' }),
})

const listarEnvios = createRoute({
  method: 'get',
  path: '/clinicas/{companyId}/envios',
  tags: ['Envios'],
  summary: 'Lista o histórico de parabéns da unidade',
  description:
    'As mensagens de parabéns agendadas pela unidade, paginadas, com filtro por situação (inclusive as que não ' +
    'saíram), por período (pela data do envio) e por paciente. É o Histórico da tela. Só lê o banco deste app.',
  security: SEGURANCA,
  request: { params: ParametrosDaClinica, query: FiltrosDoHistorico },
  responses: { 200: json(PaginaDeEnvios, 'Uma página do histórico'), ...respostasDeErro() },
})

const listarProximos = createRoute({
  method: 'get',
  path: '/clinicas/{companyId}/envios/proximos',
  tags: ['Envios'],
  summary: 'Lista os próximos parabéns a sair',
  description:
    'As mensagens de parabéns agendadas que ainda vão sair, da mais próxima à mais distante. Não traz as que ' +
    'passaram do horário sem sair (para essas, GET /clinicas/{companyId}/envios?situacao=nao_sairam). Só lê o ' +
    'banco deste app.',
  security: SEGURANCA,
  request: {
    params: ParametrosDaClinica,
    query: z.object({
      unidade: ParametroDaUnidade,
      ate: Data.optional().openapi({ description: 'Só as que saem até este dia (AAAA-MM-DD, inclusive)' }),
      pagina: Pagina,
      porPagina: PorPagina,
    }),
  },
  responses: { 200: json(PaginaDeEnvios, 'Os próximos envios'), ...respostasDeErro() },
})

const Ficha = z
  .object({
    ...Envio.shape,
    dataNascimento: z.string().nullable().openapi({ description: 'AAAA-MM-DD, como veio do prontuário' }),
    ano: z.number().int().openapi({ description: 'O ano deste aniversário' }),
    oQueFazer: z.string().nullable().openapi({ description: 'O passo que resolve a falha ou o "não saiu", quando há um' }),
    arquivoNome: z.string().nullable().openapi({ description: 'O arquivo que foi com o modelo' }),
    texto: z.string().nullable().openapi({ description: 'A mensagem como saiu. Nulo nos envios antigos.' }),
    linhaDoTempo: z
      .array(
        z.object({
          chave: z.enum(['agendado', 'enviado', 'entregue', 'lido', 'falhou', 'cancelado']),
          rotulo: z.string(),
          estado: z.enum(['feito', 'pendente', 'falhou', 'cancelado']),
          quando: z.string().nullable(),
          detalhe: z.string().nullable(),
        })
      )
      .openapi({ description: 'Os passos da mensagem, do agendamento à leitura' }),
    outros: z
      .array(
        z.object({
          id: z.string(),
          situacao: Situacao,
          naoSaiu: NaoSaiu,
          ano: z.number().int(),
          agendadoPara: z.string().nullable(),
        })
      )
      .openapi({ description: 'Os parabéns do mesmo paciente em outros anos, do mais recente ao mais antigo' }),
  })
  .openapi('FichaDoEnvio')

const ParametrosDoEnvio = ParametrosDaClinica.extend({
  envioId: IdDeEnvio.openapi({ param: { name: 'envioId', in: 'path' } }),
})

const verEnvio = createRoute({
  method: 'get',
  path: '/clinicas/{companyId}/envios/{envioId}',
  tags: ['Envios'],
  summary: 'Mostra a ficha de um parabéns',
  description:
    'Tudo sobre uma mensagem de parabéns: a mensagem como saiu, a linha do tempo, o motivo da falha e o que ' +
    'fazer, e os parabéns do mesmo paciente em outros anos. Envio de outra unidade ou clínica: 404.',
  security: SEGURANCA,
  request: { params: ParametrosDoEnvio, query: z.object({ unidade: ParametroDaUnidade }) },
  responses: { 200: json(Ficha, 'A ficha'), ...respostasDeErro() },
})

const ResultadoDoCancelamento = z
  .object({
    resultado: z.enum(['cancelado', 'ja_cancelado', 'sincronizado']).openapi({
      description:
        'cancelado: cancelado na plataforma e aqui; ja_cancelado: já estava; sincronizado: a plataforma já não ' +
        'tinha a mensagem agendada (ou ela tinha falhado), e aqui passou a constar cancelado',
    }),
  })
  .openapi('ResultadoDoCancelamento')

const cancelarEnvio = createRoute({
  method: 'post',
  path: '/clinicas/{companyId}/envios/{envioId}/cancelar',
  tags: ['Envios'],
  summary: 'Cancela um parabéns agendado',
  description:
    'Escrita: peça a confirmação de quem administra a clínica antes. Cancela na plataforma de mensagens o ' +
    'parabéns que ainda não saiu, como o Cancelar da tela. Repetir não dá erro. Mensagem que já saiu: 409. ' +
    'Envio de outra unidade ou clínica: 404.',
  security: SEGURANCA,
  request: { params: ParametrosDoEnvio, query: z.object({ unidade: ParametroDaUnidade }) },
  responses: { 200: json(ResultadoDoCancelamento, 'O resultado'), ...respostasDeErro(409, 502) },
})

/** Os filtros na forma que a tela manda: passam pela MESMA leitura (`lerFiltros`), com o mesmo saneamento da busca. */
function filtrosDaTela(q: Record<string, string | undefined>) {
  const params = new URLSearchParams()
  for (const [chave, valor] of Object.entries(q)) if (valor !== undefined) params.set(chave, valor)
  return lerFiltros(params)
}

const dois = (n: number) => String(n).padStart(2, '0')

export const rotasDeEnvios = novoRoteador()
  .openapi(listarEnvios, async (c) => {
    const { companyId } = c.req.valid('param')
    const q = c.req.valid('query')
    const clinica = await clinicaDoEscopo(c.var.servicos, companyId, q.unidade)
    const filtros = filtrosDaTela({
      situacao: q.situacao,
      de: q.de,
      ate: q.ate,
      busca: q.busca,
      ordem: q.ordem,
      direcao: q.direcao,
    })
    const pagina = await c.var.servicos.historico(clinica, q.pagina, q.porPagina, filtros)
    return c.json(
      PaginaDeEnvios.parse({
        unidade: { id: clinica.unidade.id, nome: clinica.unidade.nome },
        pagina: pagina.pagina,
        porPagina: pagina.porPagina,
        total: pagina.total,
        itens: pagina.itens.map(paraEnvio),
      }),
      200
    )
  })
  .openapi(listarProximos, async (c) => {
    const { companyId } = c.req.valid('param')
    const q = c.req.valid('query')
    const clinica = await clinicaDoEscopo(c.var.servicos, companyId, q.unidade)
    // As "agendadas" do Histórico, da mais próxima à mais distante. Com `ate`, de hoje até lá.
    const hoje = hojeNoTimezone(clinica.timezone, new Date())
    const filtros = filtrosDaTela({
      situacao: 'agendadas',
      ordem: 'envio',
      direcao: 'asc',
      de: q.ate ? `${hoje.ano}-${dois(hoje.mes)}-${dois(hoje.dia)}` : undefined,
      ate: q.ate,
    })
    const pagina = await c.var.servicos.historico(clinica, q.pagina, q.porPagina, filtros)
    return c.json(
      PaginaDeEnvios.parse({
        unidade: { id: clinica.unidade.id, nome: clinica.unidade.nome },
        pagina: pagina.pagina,
        porPagina: pagina.porPagina,
        total: pagina.total,
        itens: pagina.itens.map(paraEnvio),
      }),
      200
    )
  })
  .openapi(verEnvio, async (c) => {
    const { companyId, envioId } = c.req.valid('param')
    const clinica = await clinicaDoEscopo(c.var.servicos, companyId, c.req.valid('query').unidade)
    const ficha = await c.var.servicos.ficha(clinica, envioId)
    if (!ficha) throw new EnvioNaoEncontradoError()
    const agora = new Date()
    return c.json(
      Ficha.parse({
        id: ficha.id,
        pacienteNome: ficha.pacienteNome,
        pacienteTelefone: ficha.pacienteTelefone,
        situacao: situacaoDoEnvio(ficha.status, ficha.agendadoPara, agora).situacao,
        naoSaiu: ficha.naoSaiu,
        motivoDaFalha: ficha.motivoDaFalha,
        agendadoPara: ficha.agendadoPara,
        criadoEm: ficha.criadoEm,
        modeloNome: ficha.modeloNome,
        remetente: ficha.remetente,
        podeCancelar: ficha.podeCancelar,
        dataNascimento: ficha.dataNascimento,
        ano: ficha.ano,
        oQueFazer: ficha.oQueFazer,
        arquivoNome: ficha.arquivoNome,
        texto: ficha.texto,
        linhaDoTempo: ficha.linhaDoTempo.map((p) => ({ ...p, detalhe: p.detalhe ?? null })),
        outros: ficha.outros.map((o) => ({
          id: o.id,
          ...situacaoDoEnvio(o.status, o.agendadoPara, agora),
          ano: o.ano,
          agendadoPara: o.agendadoPara,
        })),
      }),
      200
    )
  })
  .openapi(cancelarEnvio, async (c) => {
    const { companyId, envioId } = c.req.valid('param')
    const clinica = await clinicaDoEscopo(c.var.servicos, companyId, c.req.valid('query').unidade)
    const r = await c.var.servicos.cancelarEnvio(clinica, envioId)
    return c.json(ResultadoDoCancelamento.parse({ resultado: r.situacao }), 200)
  })
