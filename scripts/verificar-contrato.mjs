// Confere o contrato de schema contra o banco real. Sai com código 1 se faltar
// coluna de que o código depende.
//
// Uso: node scripts/verificar-contrato.mjs   (com SUPABASE_URL e
//      SUPABASE_SERVICE_ROLE_KEY no ambiente)
//
// O `deploy.sh` roda isto antes do build, num container Node descartável: um
// contrato quebrado — coluna removida ou renomeada, por exemplo pelo Clinic
// Control — trava o deploy com a lista do que falta, em vez de subir e quebrar
// em produção. Contrato: src/shared/contrato.ts. Decisão: ADR 0002.
//
// Com o CADASTRO_UNIFICADO ligado (ADR 0005), confere também o cadastro comum:
// a CADASTRO_CHAVE_CIFRAGEM no formato, as colunas das visões do esquema
// `cadastro` (que precisa estar exposto) e se a chave abre os segredos das
// clínicas com o produto ligado. Nenhum valor de segredo sai daqui: só a conta
// e o nome da unidade do que não abriu.
//
// Lê as colunas pelo OpenAPI do PostgREST, que o schema exposto já publica.
//
// Termina pelo `process.exitCode`, sem `process.exit()`: no Windows, sair à
// força depois de carregar alguns arquivos .ts dispara uma falha do libuv
// (src\win\async.c) e troca o código de saída.
import { cadastroUnificadoLigado } from '../src/shared/cadastro-unificado.ts'
import {
  chaveDoCadastro,
  decifrarCredenciaisDoCadastro,
  decifrarDoCadastro,
} from '../src/shared/clinica/decifrador-do-cadastro.ts'
import { CONTRATO_DO_CADASTRO, colunasFaltando } from '../src/shared/contrato.ts'

/** Uma parada já explicada no log: o deploy não segue. */
class Parada extends Error {}

function parar(...linhas) {
  for (const linha of linhas) console.error(linha)
  throw new Parada()
}

function relatar(titulo, problemas, conselho) {
  parar(
    `verificar-contrato: ${titulo}`,
    ...problemas.map(({ tabela, faltando }) => `  ${tabela}: ${faltando.join(', ')}`),
    conselho
  )
}

async function verificar() {
  const url = process.env.SUPABASE_URL
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !chave) parar('verificar-contrato: SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausente')

  /** Uma chamada ao PostgREST num esquema. Para se o banco recusar. */
  async function pedir(esquema, caminho, accept = 'application/json') {
    let resposta
    try {
      resposta = await fetch(`${url}/rest/v1/${caminho}`, {
        headers: { apikey: chave, Authorization: `Bearer ${chave}`, 'Accept-Profile': esquema, Accept: accept },
        signal: AbortSignal.timeout(20_000),
      })
    } catch (err) {
      parar(`verificar-contrato: sem resposta do banco no esquema ${esquema} (${err.message})`)
    }
    if (!resposta.ok) {
      // PGRST106 = schema não exposto no PostgREST (ver supabase/README.md).
      parar(
        `verificar-contrato: o banco respondeu ${resposta.status} no esquema ${esquema}: ${(await resposta.text()).slice(0, 300)}`
      )
    }
    return resposta.json()
  }

  /** As colunas de cada tabela ou visão do esquema, pelo OpenAPI. */
  async function colunasDoEsquema(esquema) {
    const spec = await pedir(esquema, '', 'application/openapi+json')
    return Object.fromEntries(
      Object.entries(spec.definitions ?? {}).map(([tabela, def]) => [tabela, Object.keys(def.properties ?? {})])
    )
  }

  const problemas = colunasFaltando(await colunasDoEsquema('aniversariantes'))
  if (problemas.length > 0) {
    relatar(
      'CONTRATO QUEBRADO — o código depende de colunas que o banco não tem:',
      problemas,
      'Não suba esta versão. Ver src/shared/contrato.ts e docs/adr/0002-banco-compartilhado.md.'
    )
  }
  console.log('verificar-contrato: ok — todas as colunas do contrato existem no banco')

  if (!cadastroUnificadoLigado(process.env.CADASTRO_UNIFICADO)) {
    console.log('verificar-contrato: CADASTRO_UNIFICADO desligado — o cadastro comum não é lido')
    return
  }

  // ─── O cadastro comum ─────────────────────────────────────────────────────

  let chaveDoAmbiente
  try {
    chaveDoAmbiente = chaveDoCadastro(process.env.CADASTRO_CHAVE_CIFRAGEM)
  } catch (err) {
    parar(`verificar-contrato: ${err.message}`)
  }

  const doCadastro = colunasFaltando(await colunasDoEsquema('cadastro'), CONTRATO_DO_CADASTRO)
  if (doCadastro.length > 0) {
    relatar(
      'O CADASTRO COMUM NÃO TEM o que este app lê (a migração 0018 do CRM está aplicada e o esquema exposto?):',
      doCadastro,
      'Não suba com o CADASTRO_UNIFICADO ligado. Ver docs/cadastro-unificado.md.'
    )
  }

  const ligadas = new Set(
    (await pedir('cadastro', 'produtos?select=clinica_id&produto=eq.aniversariantes&ligado=eq.true')).map(
      (p) => p.clinica_id
    )
  )
  const clinicas = (await pedir('cadastro', 'clinicas?select=id,company_id,token_plataforma_cifrado')).filter((c) =>
    ligadas.has(c.id)
  )
  const unidades = (
    await pedir(
      'cadastro',
      'unidades?select=clinica_id,company_id,nome,ativa,prontuario_sistema,prontuario_credenciais_cifradas'
    )
  ).filter((u) => ligadas.has(u.clinica_id) && u.ativa && u.prontuario_sistema && u.prontuario_credenciais_cifradas)

  const naoAbriram = []
  for (const c of clinicas) {
    if (!c.token_plataforma_cifrado) continue
    try {
      decifrarDoCadastro(c.token_plataforma_cifrado, chaveDoAmbiente)
    } catch {
      naoAbriram.push(`  ${c.company_id}: o token da plataforma`)
    }
  }
  for (const u of unidades) {
    try {
      decifrarCredenciaisDoCadastro(u.prontuario_sistema, u.prontuario_credenciais_cifradas, chaveDoAmbiente)
    } catch {
      naoAbriram.push(`  ${u.company_id} / ${u.nome}: as credenciais do prontuário`)
    }
  }
  if (naoAbriram.length > 0) {
    parar(
      'verificar-contrato: a CADASTRO_CHAVE_CIFRAGEM deste .env NÃO ABRE segredos do cadastro comum:',
      ...naoAbriram,
      'É a mesma chave do .env do CRM? Os tokens antigos do CRM foram regravados com ela ' +
        '(scripts/recifrar-tokens-do-cadastro.ts --valer, no CRM)? Ver docs/cadastro-unificado.md.'
    )
  }

  console.log(
    `verificar-contrato: ok — cadastro comum: ${clinicas.length} clínica(s) com o produto ligado, ` +
      `${unidades.length} unidade(s) com prontuário, todos os segredos abrem com a chave`
  )
}

try {
  await verificar()
  process.exitCode = 0
} catch (err) {
  if (!(err instanceof Parada)) console.error(`verificar-contrato: ${err.message}`)
  process.exitCode = 1
}
