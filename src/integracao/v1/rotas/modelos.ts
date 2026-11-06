import { createRoute, z } from '@hono/zod-openapi'
import { motivoDeNaoSair } from '@/shared/mensageria/canal-do-modelo'
import { CAMPOS_DISPONIVEIS, type CampoDoPaciente } from '@/shared/template/parametros'
import { clinicaDoEscopo } from '../escopo'
import { json, Ok, ParametroDaUnidade, ParametrosDaClinica, respostasDeErro, UnidadeEmUso } from '../esquemas'
import { novoRoteador } from '../roteador'

// Os modelos de mensagem da unidade: os aprovados na plataforma de mensagens,
// cada um com a configuração salva aqui (o campo de cada variável, o dia e a
// hora do envio, e se é o modelo em uso). A configuração dos parabéns da
// unidade é esta: um modelo em uso, com o dia e a hora em que sai.

const SEGURANCA = [{ ChaveDaIntegracao: [] }]

const CAMPOS = CAMPOS_DISPONIVEIS.map((c) => c.valor) as [CampoDoPaciente, ...CampoDoPaciente[]]

const Campo = z.enum(CAMPOS).openapi({
  description: CAMPOS_DISPONIVEIS.map((c) => `${c.valor}: ${c.rotulo}`).join('; '),
})

const DiaEnvio = z.enum(['aniversario', '1_dia_antes', '3_dias_antes']).openapi({
  description: 'Quando o parabéns sai: no dia do aniversário, 1 dia antes ou 3 dias antes',
})

const Modelo = z.object({
  modeloId: z.string().openapi({ description: 'O id do modelo na plataforma de mensagens: é o `modeloId` do salvar' }),
  nome: z.string(),
  conteudo: z.string().openapi({ description: 'O texto do modelo, com as variáveis ({{1}}, [NOME]...)' }),
  variaveis: z
    .array(
      z.object({
        nome: z.string().openapi({ description: 'A chave da variável em `parametros`: "1", "NOME"' }),
        marcacao: z.string().openapi({ description: 'Como aparece no texto: "{{1}}", "[NOME]"' }),
        obrigatoria: z.boolean().openapi({
          description: 'Falso: a própria plataforma preenche a variável quando ela fica sem campo',
        }),
      })
    )
    .openapi({ description: 'As variáveis do texto, na ordem em que aparecem' }),
  midia: z
    .enum(['video', 'imagem', 'documento'])
    .nullable()
    .openapi({ description: 'A mídia do cabeçalho. Com mídia, o arquivo precisa ter sido enviado pela tela antes de pôr em uso.' }),
  numero: z.string().nullable().openapi({ description: 'O número por onde o modelo sai. Nulo: não dá para saber.' }),
  podeUsar: z
    .boolean()
    .nullable()
    .openapi({ description: 'Se esta unidade pode usar o modelo. Nulo: não há o que conferir.' }),
  motivoDeNaoUsar: z.string().nullable().openapi({ description: 'Por que a unidade não pode usar o modelo, e o que fazer' }),
  configuracao: z
    .object({
      id: z.string().openapi({ description: 'O id da configuração neste app' }),
      parametros: z.record(z.string(), z.string()).openapi({ description: 'O campo de cada variável: { "1": "primeiro_nome" }' }),
      diaEnvio: DiaEnvio,
      horarioEnvio: z.string().openapi({ description: 'HH:MM, no fuso da clínica' }),
      emUso: z.boolean().openapi({ description: 'Se é o modelo em uso: é ele que sai nos próximos parabéns' }),
      arquivoNome: z.string().nullable().openapi({ description: 'O arquivo enviado para a mídia do modelo' }),
    })
    .nullable()
    .openapi({ description: 'A configuração salva. Nulo: o modelo nunca foi configurado nesta unidade.' }),
})

const Modelos = z
  .object({
    unidade: UnidadeEmUso,
    filtradoPorTipo: z.boolean().openapi({
      description: 'Falso: não deu para garantir que todos os modelos servem para agendamento',
    }),
    modelos: z.array(Modelo).openapi({ description: 'Os modelos aprovados na plataforma; os que a unidade não pode usar por último' }),
    campos: z
      .array(z.object({ valor: z.string(), rotulo: z.string() }))
      .openapi({ description: 'Os campos que uma variável pode receber, para montar `parametros`' }),
  })
  .openapi('Modelos')

const listarModelos = createRoute({
  method: 'get',
  path: '/clinicas/{companyId}/modelos',
  tags: ['Modelos'],
  summary: 'Lista os modelos de mensagem da unidade',
  description:
    'Os modelos aprovados na conta da plataforma de mensagens, com a configuração salva de cada um nesta unidade: ' +
    'o campo de cada variável, o dia e a hora do envio, e qual está em uso. É a configuração dos parabéns da ' +
    'unidade. Lê a plataforma na hora.',
  security: SEGURANCA,
  request: { params: ParametrosDaClinica, query: z.object({ unidade: ParametroDaUnidade }) },
  responses: { 200: json(Modelos, 'Os modelos'), ...respostasDeErro(502) },
})

const CorpoDoModelo = z
  .object({
    nome: z
      .string()
      .min(1)
      .max(200)
      .openapi({ description: 'O nome do modelo, como vem em GET /clinicas/{companyId}/modelos' }),
    parametros: z.record(z.string().max(40), Campo).openapi({
      description: 'O campo de cada variável do texto, pela chave da variável: { "1": "primeiro_nome" }',
    }),
    diaEnvio: DiaEnvio,
    horarioEnvio: z
      .string()
      .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Use HH:MM')
      .openapi({ description: 'A hora do envio, HH:MM, no fuso da clínica', example: '09:00' }),
    emUso: z.boolean().openapi({
      description:
        'Pôr em uso (verdadeiro) ou só salvar a configuração (falso). Há um modelo em uso por unidade: pôr este ' +
        'em uso TROCA o que estava.',
    }),
  })
  .openapi('PedidoDoModelo')

const salvarModelo = createRoute({
  method: 'put',
  path: '/clinicas/{companyId}/modelos/{modeloId}',
  tags: ['Modelos'],
  summary: 'Salva a configuração de um modelo e o põe em uso',
  description:
    'Escrita: peça a confirmação de quem administra a clínica antes. Grava o campo de cada variável, o dia e a ' +
    'hora do envio, e põe o modelo em uso ou não. As regras são as da tela de Modelos: a unidade precisa poder ' +
    'usar o modelo, e modelo com mídia só entra em uso com o arquivo já enviado pela tela (esta rota não envia ' +
    'arquivo; o que a tela enviou continua). Não cria modelo: os modelos se criam e se aprovam na plataforma de ' +
    'mensagens. Nada que já foi agendado muda.',
  security: SEGURANCA,
  request: {
    params: ParametrosDaClinica.extend({
      modeloId: z
        .string()
        .regex(/^[\w-]{1,100}$/, 'Use o id do modelo')
        .openapi({ param: { name: 'modeloId', in: 'path' }, description: 'O `modeloId` de GET /clinicas/{companyId}/modelos' }),
    }),
    query: z.object({ unidade: ParametroDaUnidade }),
    body: { required: true, content: { 'application/json': { schema: CorpoDoModelo } } },
  },
  responses: { 200: json(Ok, 'Salvo'), ...respostasDeErro(502) },
})

export const rotasDeModelos = novoRoteador()
  .openapi(listarModelos, async (c) => {
    const { companyId } = c.req.valid('param')
    const clinica = await clinicaDoEscopo(c.var.servicos, companyId, c.req.valid('query').unidade)
    const listagem = await c.var.servicos.modelos(clinica)
    return c.json(
      Modelos.parse({
        unidade: { id: clinica.unidade.id, nome: clinica.unidade.nome },
        filtradoPorTipo: listagem.filtradoPorTipo,
        modelos: listagem.modelos.map((m) => ({
          modeloId: m.modeloId,
          nome: m.nome,
          conteudo: m.conteudo,
          variaveis: m.variaveis,
          midia: m.midia,
          numero: m.envio.numero?.numero ?? null,
          podeUsar: m.envio.permitido,
          motivoDeNaoUsar: motivoDeNaoSair(m.envio),
          configuracao: m.config && {
            id: m.config.id,
            parametros: m.config.parametros,
            diaEnvio: m.config.diaEnvio,
            horarioEnvio: m.config.horarioEnvio,
            emUso: m.config.ehPadrao && m.config.ativo,
            arquivoNome: m.config.arquivo?.nome ?? null,
          },
        })),
        campos: CAMPOS_DISPONIVEIS,
      }),
      200
    )
  })
  .openapi(salvarModelo, async (c) => {
    const { companyId, modeloId } = c.req.valid('param')
    const clinica = await clinicaDoEscopo(c.var.servicos, companyId, c.req.valid('query').unidade)
    const corpo = c.req.valid('json')
    // Como a tela: "Usar este modelo" grava em uso e ativo; só salvar grava fora de uso.
    await c.var.servicos.salvarModelo(clinica, {
      modeloId,
      nome: corpo.nome,
      parametros: corpo.parametros,
      diaEnvio: corpo.diaEnvio,
      horarioEnvio: corpo.horarioEnvio,
      ehPadrao: corpo.emUso,
      ativo: true,
    })
    return c.json(Ok.parse({ ok: true }), 200)
  })
