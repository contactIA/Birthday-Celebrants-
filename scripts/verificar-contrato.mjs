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
// Lê as colunas pelo OpenAPI do PostgREST, que o schema exposto já publica.
import { colunasFaltando } from '../src/shared/contrato.ts'

const url = process.env.SUPABASE_URL
const chave = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !chave) {
  console.error('verificar-contrato: SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausente')
  process.exit(1)
}

let spec
try {
  const resposta = await fetch(`${url}/rest/v1/`, {
    headers: {
      apikey: chave,
      Authorization: `Bearer ${chave}`,
      'Accept-Profile': 'aniversariantes',
      Accept: 'application/openapi+json',
    },
    signal: AbortSignal.timeout(20_000),
  })
  if (!resposta.ok) {
    // PGRST106 = schema não exposto no PostgREST (ver supabase/README.md).
    console.error(`verificar-contrato: o banco respondeu ${resposta.status}: ${(await resposta.text()).slice(0, 300)}`)
    process.exit(1)
  }
  spec = await resposta.json()
} catch (err) {
  console.error(`verificar-contrato: sem resposta do banco (${err.message})`)
  process.exit(1)
}

const noBanco = Object.fromEntries(
  Object.entries(spec.definitions ?? {}).map(([tabela, def]) => [tabela, Object.keys(def.properties ?? {})])
)

const problemas = colunasFaltando(noBanco)
if (problemas.length === 0) {
  console.log('verificar-contrato: ok — todas as colunas do contrato existem no banco')
  process.exit(0)
}

console.error('verificar-contrato: CONTRATO QUEBRADO — o código depende de colunas que o banco não tem:')
for (const { tabela, faltando } of problemas) console.error(`  ${tabela}: ${faltando.join(', ')}`)
console.error('Não suba esta versão. Ver src/shared/contrato.ts e docs/adr/0002-banco-compartilhado.md.')
process.exit(1)
