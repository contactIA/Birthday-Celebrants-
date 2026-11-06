import { z } from '@hono/zod-openapi'
import type { StatusEnvio } from '@/shared/db'
import { naoSaiu } from '@/shared/data/envio-que-nao-saiu'
import { SITUACAO_DO_STATUS } from '@/features/resumo-de-uso/resumo'

// Os esquemas que mais de uma rota usa. Cada um valida E documenta: a descrição
// de cada campo vai para o OpenAPI, e é por ela que o agente da Mensageria
// entende o que pedir e o que recebeu. Português, sem o nome do fornecedor da
// plataforma de mensagens (white label).

// Sem a flag `i`: o padrão vai para o OpenAPI como texto, e lá não há flag.
const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/
const DATA = /^\d{4}-\d{2}-\d{2}$/

export const Erro = z
  .object({
    erro: z.string().openapi({ description: 'A frase para quem lê', example: 'Este envio não foi encontrado nesta unidade' }),
    codigo: z.string().openapi({ description: 'O código estável do erro', example: 'ENVIO_NAO_ENCONTRADO' }),
    detalhes: z
      .array(z.object({ campo: z.string(), mensagem: z.string() }))
      .optional()
      .openapi({ description: 'Só quando a requisição não passa na validação: o campo e o motivo' }),
  })
  .openapi('Erro')

const DESCRICAO_DOS_ERROS: Record<number, string> = {
  400: 'A requisição não passou na validação, ou a regra recusou o pedido',
  401: 'Sem a chave da integração, ou com outra chave',
  404: 'A clínica não tem o módulo ligado, ou a unidade ou o envio não são dela',
  409: 'O pedido conflita com o estado atual (por exemplo, a mensagem já saiu)',
  500: 'Erro inesperado. O detalhe fica só no log do servidor',
  502: 'A plataforma de mensagens ou o prontuário não responderam',
  503: 'A integração não está configurada neste servidor',
}

/** As respostas de erro de uma rota, todas no formato `{ erro, codigo }`. */
export function respostasDeErro(...status: (keyof typeof DESCRICAO_DOS_ERROS)[]) {
  return Object.fromEntries(
    [...new Set([400, 401, 404, 500, 503, ...status])].map((s) => [
      s,
      { description: DESCRICAO_DOS_ERROS[s]!, content: { 'application/json': { schema: Erro } } },
    ])
  )
}

export function json<T extends z.ZodType>(schema: T, description: string) {
  return { description, content: { 'application/json': { schema } } }
}

export const ParametrosDaClinica = z.object({
  companyId: z
    .string()
    .regex(UUID, 'Use o id da conta da clínica (UUID)')
    .openapi({
      param: { name: 'companyId', in: 'path' },
      description: 'O id da conta da clínica na plataforma de mensagens (company_id), o mesmo do resumo de uso',
      example: '3f2c9a8e-1b2d-4c5e-8f90-1a2b3c4d5e6f',
    }),
})

export const ParametroDaUnidade = z
  .string()
  .regex(UUID, 'Use o id da unidade (UUID)')
  .optional()
  .openapi({
    description:
      'O id da unidade, como vem em GET /clinicas/{companyId}. Sem ele, vale a unidade principal. ' +
      'Modelos, aniversariantes e envios são de cada unidade. Unidade de outra clínica: 404.',
    example: '9b1d4c2a-7e3f-4a5b-9c8d-0e1f2a3b4c5d',
  })

export const IdDeEnvio = z
  .string()
  .regex(UUID, 'Use o id do envio (UUID)')
  .openapi({ description: 'O id do envio neste app, como vem no histórico', example: '0c7a8b9d-1e2f-4a3b-8c4d-5e6f7a8b9c0d' })

export const Data = z
  .string()
  .regex(DATA, 'Use AAAA-MM-DD')
  .openapi({ description: 'Data de calendário, no formato AAAA-MM-DD', example: '2026-11-06' })

export const UnidadeEmUso = z
  .object({
    id: z.string().openapi({ description: 'O id da unidade' }),
    nome: z.string().openapi({ description: 'O nome da unidade' }),
  })
  .openapi({ description: 'A unidade de que a resposta fala' })

export const Situacao = z
  .enum(['agendado', 'processando', 'enviado', 'entregue', 'lido', 'cancelado', 'falhou'])
  .openapi({
    description:
      'Onde a mensagem de parabéns está na plataforma de mensagens: agendado (espera o horário), processando, ' +
      'enviado, entregue, lido, cancelado ou falhou. A situação é conferida a cada 15 minutos.',
  })

/** A situação de um status, no vocabulário da API, e se ele "não saiu". */
export function situacaoDoEnvio(status: StatusEnvio, agendadoPara: string | null, agora: Date) {
  return { situacao: SITUACAO_DO_STATUS[status], naoSaiu: naoSaiu(status, agendadoPara, agora) }
}

export const NaoSaiu = z.boolean().openapi({
  description:
    'Verdadeiro quando ainda consta agendado, mas passou mais de 2 horas do horário e não saiu ("Não saiu" na tela). ' +
    'A recepção cancela e agenda de novo.',
})

export const Ok = z.object({ ok: z.literal(true) }).openapi('Ok')
