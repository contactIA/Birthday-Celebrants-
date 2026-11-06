import { createRoute, z } from '@hono/zod-openapi'
import { ClinicaNaoProvisionadaError } from '@/shared/clinica/repositorio'
import { clinicaDoEscopo } from '../escopo'
import { json, ParametrosDaClinica, respostasDeErro } from '../esquemas'
import { novoRoteador } from '../roteador'

// A clínica e o resumo de uso.

const SEGURANCA = [{ ChaveDaIntegracao: [] }]

const Clinica = z
  .object({
    companyId: z.string().openapi({ description: 'O id da conta da clínica na plataforma de mensagens' }),
    nome: z.string(),
    unidades: z
      .array(
        z.object({
          id: z.string().openapi({ description: 'O id da unidade: é o que vai no parâmetro `unidade` das outras rotas' }),
          nome: z.string(),
          principal: z.boolean().openapi({ description: 'A unidade que vale quando a rota não recebe `unidade`' }),
        })
      )
      .openapi({ description: 'As unidades que o módulo atende, a principal primeiro' }),
  })
  .openapi('Clinica')

const verClinica = createRoute({
  method: 'get',
  path: '/clinicas/{companyId}',
  tags: ['Clínica'],
  summary: 'Mostra a clínica e as unidades',
  description:
    'A clínica com o módulo de aniversariantes ligado: o nome e as unidades, com o id que as outras rotas ' +
    'recebem em `unidade`. Clínica sem o módulo ligado: 404.',
  security: SEGURANCA,
  request: { params: ParametrosDaClinica },
  responses: { 200: json(Clinica, 'A clínica'), ...respostasDeErro() },
})

const EnviosDoUso = z.object({
  total: z.number().int(),
  porSituacao: z.object({
    agendado: z.number().int(),
    processando: z.number().int(),
    enviado: z.number().int(),
    entregue: z.number().int(),
    lido: z.number().int(),
    cancelado: z.number().int(),
    falhou: z.number().int(),
  }),
  ultimoEnvioEm: z.string().nullable().openapi({ description: 'Quando saiu o último parabéns enviado. Nulo: nunca enviou.' }),
  ultimos30Dias: z.number().int().openapi({ description: 'Parabéns enviados nos últimos 30 dias' }),
  ultimos90Dias: z.number().int(),
})

const Uso = z
  .object({
    modulo: z.literal('aniversariantes'),
    geradoEm: z.string(),
    clinica: z
      .object({
        companyId: z.string(),
        nome: z.string(),
        ligado: z.boolean(),
        setupId: z.string().nullable(),
        setupUrl: z.string().nullable().openapi({ description: 'A tela de setup da clínica neste app, para a equipe' }),
        unidades: z.array(z.object({ id: z.string(), nome: z.string() })),
        envios: EnviosDoUso.openapi({ description: 'Todos os envios da clínica, somando as unidades' }),
      })
      .nullable()
      .openapi({ description: 'O resumo da clínica; nulo se ela ainda não tem linha neste app' }),
  })
  .openapi('UsoDaClinica')

const verUso = createRoute({
  method: 'get',
  path: '/clinicas/{companyId}/uso',
  tags: ['Clínica'],
  summary: 'Resume o uso dos parabéns pela clínica',
  description:
    'Os envios da clínica por situação, o último envio e quantos saíram em 30 e 90 dias, somando as unidades. ' +
    'O mesmo cálculo de GET /api/integracao/uso, só desta clínica.',
  security: SEGURANCA,
  request: { params: ParametrosDaClinica },
  responses: { 200: json(Uso, 'O resumo de uso da clínica'), ...respostasDeErro() },
})

export const rotasDaClinica = novoRoteador()
  .openapi(verClinica, async (c) => {
    const { companyId } = c.req.valid('param')
    const publica = await c.var.servicos.buscarClinicaPublica(companyId)
    // Defesa a mais, como em `clinicaDoEscopo`: a clínica lida tem de ser a do caminho.
    if (publica.companyId.toLowerCase() !== companyId.toLowerCase()) throw new ClinicaNaoProvisionadaError(companyId)
    return c.json(Clinica.parse(publica), 200)
  })
  .openapi(verUso, async (c) => {
    const { companyId } = c.req.valid('param')
    const clinica = await clinicaDoEscopo(c.var.servicos, companyId, undefined)
    const resumo = await c.var.servicos.uso(clinica, new Date())
    return c.json(Uso.parse({ modulo: 'aniversariantes', geradoEm: resumo.geradoEm, clinica: resumo.clinicas[0] ?? null }), 200)
  })
