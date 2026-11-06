import { bodyLimit } from 'hono/body-limit'
import { exigirChave } from './autenticacao'
import { erroDoApp, tratarErro } from './erros'
import { novoRoteador } from './roteador'
import { rotasDeAniversariantes } from './rotas/aniversariantes'
import { rotasDaClinica } from './rotas/clinica'
import { rotasDeEnvios } from './rotas/envios'
import { rotasDeModelos } from './rotas/modelos'
import { servicosDoApp, type Servicos } from './servicos'

// A API de integração dos aniversariantes (docs/adr/0007-api-de-integracao.md).
// É por ela que outro sistema nosso (o agente da Mensageria) lê e, com a
// confirmação de uma pessoa, muda o que a tela muda.
//
// O contrato sai dos mesmos esquemas que validam as rotas, então não tem como
// ficar desatualizado: GET /api/integracao/v1/openapi.json, sem chave.
//
// As rotas só traduzem HTTP: a regra mora nas fatias (`src/features`), nos
// mesmos serviços que a tela chama.

export const BASE_DA_API = '/api/integracao/v1'
export const VERSAO_DA_API = '1.0.0'

const DESCRICAO = `
API de integração do módulo de aniversariantes: a clínica, os modelos de mensagem (com o
dia e a hora do parabéns), os aniversariantes do mês com o parabéns de cada um, o
histórico de envios e o resumo de uso.

**Autenticação.** \`Authorization: Bearer <chave>\`, a chave da integração, criada pela
equipe da ContactIA. Ela diz quem chama, não a clínica.

**Clínica.** Toda rota tem a clínica no caminho (\`/clinicas/{companyId}\`), e só lê ou
muda dados dela. Modelos, aniversariantes e envios são de cada unidade:
\`?unidade=<id>\` escolhe qual (sem ele, a principal). Unidade ou envio de outra
clínica: 404.

**Escritas.** As poucas que existem (salvar um modelo e pô-lo em uso, cancelar um
parabéns agendado) fazem o mesmo que o botão da tela, com as mesmas regras. Peça a
confirmação de quem administra a clínica antes de chamar.

**Erros.** Toda resposta de erro tem o formato
\`{ "erro": "frase para quem lê", "codigo": "CODIGO_ESTAVEL" }\`. Quando a requisição não
passa na validação, vem também \`detalhes\`, com o campo e o motivo.

**Versões.** Mudança que quebra quem já integra ganha um prefixo novo (\`/v2\`).
`

const KB = 1024

export function criarApiDeIntegracao(servicos: Servicos = servicosDoApp) {
  const api = novoRoteador().basePath(BASE_DA_API)

  api.use('*', async (c, next) => {
    c.set('servicos', servicos)
    await next()
    // Resposta da API não fica em cache de ninguém: tem dado de paciente.
    if (!c.res.headers.has('Cache-Control')) c.header('Cache-Control', 'no-store')
    c.header('X-Content-Type-Options', 'nosniff')
  })

  // Só os pedidos com corpo: sem Content-Length, o bodyLimit lê o corpo e
  // remonta o Request, o que quebra no GET e no DELETE que vêm do Next (lição do CRM).
  const limite = bodyLimit({
    maxSize: 64 * KB,
    onError: () => {
      throw erroDoApp('CORPO_GRANDE', 'O corpo da requisição é grande demais', 413)
    },
  })
  api.use('/clinicas/*', async (c, next) => (c.req.method === 'PUT' || c.req.method === 'POST' ? limite(c, next) : next()))
  api.use('/clinicas/*', exigirChave)

  api.openAPIRegistry.registerComponent('securitySchemes', 'ChaveDaIntegracao', {
    type: 'http',
    scheme: 'bearer',
    description: 'A chave da integração, criada pela equipe da ContactIA. No servidor fica só o SHA-256 dela.',
  })

  // Uma chamada por grupo, e não em cadeia: o tipo da cadeia inteira fica
  // grande demais para o TypeScript, e ninguém usa esse tipo. A ordem importa:
  // `/envios/proximos` antes de `/envios/{envioId}`.
  for (const rotas of [rotasDaClinica, rotasDeModelos, rotasDeAniversariantes, rotasDeEnvios]) {
    api.route('/', rotas)
  }

  api.doc31('/openapi.json', {
    openapi: '3.1.0',
    info: { title: 'Aniversariantes · integração', version: VERSAO_DA_API, description: DESCRICAO.trim() },
  })

  api.notFound((c) => c.json({ erro: 'Rota não encontrada', codigo: 'ROTA_NAO_ENCONTRADA' }, 404))
  api.onError(tratarErro)
  return api
}
