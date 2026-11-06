import { createRoute, z } from '@hono/zod-openapi'
import { mesDiaDe } from '@/shared/data/parse'
import { clinicaDoEscopo } from '../escopo'
import { json, NaoSaiu, ParametroDaUnidade, ParametrosDaClinica, respostasDeErro, Situacao, situacaoDoEnvio, UnidadeEmUso } from '../esquemas'
import { novoRoteador } from '../roteador'

// Os aniversariantes do mês, com o parabéns de cada um: a lista da tela.

const SEGURANCA = [{ ChaveDaIntegracao: [] }]

const dois = (n: number) => String(n).padStart(2, '0')

const Aniversariante = z.object({
  pacienteId: z.string().openapi({ description: 'O id do paciente no prontuário' }),
  nome: z.string(),
  telefone: z.string().nullable().openapi({ description: 'O telefone que o parabéns usa. Nulo: sem telefone no cadastro.' }),
  dia: z.number().int().openapi({ description: 'O dia do aniversário' }),
  mes: z.number().int().openapi({ description: 'O mês do aniversário (1 a 12)' }),
  dataNascimento: z
    .string()
    .nullable()
    .openapi({ description: 'DD/MM/AAAA. Nulo quando o prontuário só tem o dia e o mês.' }),
  jaPassou: z.boolean().openapi({ description: 'O aniversário deste ano já passou (no fuso da clínica)' }),
  agendavel: z.boolean().openapi({
    description: 'Dá para agendar o parabéns: o aniversário é depois de hoje. O de hoje não é agendável.',
  }),
  envio: z
    .object({ situacao: Situacao, naoSaiu: NaoSaiu, agendadoPara: z.string().nullable() })
    .nullable()
    .openapi({ description: 'O parabéns deste ano, se já foi agendado. Nulo: ainda não.' }),
})

const Aniversariantes = z
  .object({
    unidade: UnidadeEmUso,
    mes: z.number().int(),
    hoje: z.string().openapi({ description: 'Hoje, AAAA-MM-DD, no fuso da clínica' }),
    aguardandoSincronizacao: z.boolean().openapi({
      description: 'A lista veio vazia porque o prontuário ainda não sincronizou esta clínica',
    }),
    itens: z.array(Aniversariante).openapi({ description: 'Por dia do aniversário, e por nome no mesmo dia' }),
  })
  .openapi('Aniversariantes')

const listarAniversariantes = createRoute({
  method: 'get',
  path: '/clinicas/{companyId}/aniversariantes',
  tags: ['Aniversariantes'],
  summary: 'Lista os aniversariantes do mês e o parabéns de cada um',
  description:
    'Os pacientes que fazem aniversário no mês, do cadastro do prontuário da unidade, com o parabéns deste ano de ' +
    'cada um: se já foi agendado e em que situação está, e se ainda dá para agendar. É a lista da tela. Lê o ' +
    'prontuário (ou a cópia dele) na hora.',
  security: SEGURANCA,
  request: {
    params: ParametrosDaClinica,
    query: z.object({
      unidade: ParametroDaUnidade,
      mes: z.coerce
        .number()
        .int()
        .min(1)
        .max(12)
        .optional()
        .openapi({ description: 'O mês, de 1 a 12. Sem ele, o mês de hoje no fuso da clínica.', example: 11 }),
    }),
  },
  responses: { 200: json(Aniversariantes, 'Os aniversariantes'), ...respostasDeErro(502) },
})

export const rotasDeAniversariantes = novoRoteador().openapi(listarAniversariantes, async (c) => {
  const { companyId } = c.req.valid('param')
  const q = c.req.valid('query')
  const clinica = await clinicaDoEscopo(c.var.servicos, companyId, q.unidade)
  const agora = new Date()
  const lista = await c.var.servicos.aniversariantes(clinica, q.mes ?? null, agora)
  return c.json(
    Aniversariantes.parse({
      unidade: { id: clinica.unidade.id, nome: clinica.unidade.nome },
      mes: lista.mes,
      hoje: `${lista.hoje.ano}-${dois(lista.hoje.mes)}-${dois(lista.hoje.dia)}`,
      aguardandoSincronizacao: lista.aguardandoSincronizacao,
      itens: lista.itens.map((i) => ({
        pacienteId: i.id,
        nome: i.nome,
        telefone: i.telefone,
        ...mesDiaDe(i.aniversario),
        dataNascimento: i.datanascimento || null,
        jaPassou: i.jaPassou,
        agendavel: i.agendavel,
        envio: i.envio && {
          ...situacaoDoEnvio(i.envio.status, i.envio.scheduledFor, agora),
          agendadoPara: i.envio.scheduledFor,
        },
      })),
    }),
    200
  )
})
