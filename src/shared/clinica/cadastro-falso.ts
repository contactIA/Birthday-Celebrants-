import { createCipheriv, randomBytes, randomUUID } from 'node:crypto'
import type {
  ClienteDoBanco,
  ClinicaDoCadastroRow,
  OrigemDaUnidadeRow,
  ProdutoDoCadastroRow,
  UnidadeDoCadastroRow,
} from '@/shared/db'

// SÓ PARA TESTES. Um banco em memória que responde como o supabase-js no pouco
// que a leitura do cadastro comum usa (`select`, `eq`, `ilike`, `in`, `insert`,
// `single`, `maybeSingle`), a cifra no formato do CRM e as linhas das visões.
// Não entra no código de produção: só os `*.test.ts` o importam.

type Linha = Record<string, unknown>

/** O banco: "esquema.tabela" → linhas (as linhas tipadas de `db.ts` servem). */
export type Tabelas = Record<string, object[]>

export interface Operacao {
  tabela: string
  tipo: 'select' | 'insert'
  linhas?: Linha[]
}

export interface BancoFalso {
  cliente: ClienteDoBanco
  tabelas: Tabelas
  /** Toda consulta feita, na ordem: é por aqui que o teste vê o que foi lido e gravado. */
  operacoes: Operacao[]
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Como o Postgres compara um uuid: sem diferença de caixa. */
function igual(a: unknown, b: unknown): boolean {
  if (typeof a === 'string' && typeof b === 'string' && UUID.test(a) && UUID.test(b)) {
    return a.toLowerCase() === b.toLowerCase()
  }
  return a === b
}

/** As chaves únicas que a leitura do cadastro pode esbarrar. */
const UNICAS: Record<string, string[]> = {
  'aniversariantes.aniversariantes_clinicas': ['id', 'slug'],
  'aniversariantes.aniversariantes_unidades': ['id'],
}

class Consulta implements PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }> {
  private filtros: ((l: Linha) => boolean)[] = []
  private colunas: string[] | null = null
  private paraInserir: Linha[] | null = null
  private modo: 'muitas' | 'uma' | 'talvez' = 'muitas'

  constructor(
    private readonly banco: BancoFalso,
    private readonly tabela: string,
    private readonly erros: Record<string, string>
  ) {}

  select(colunas = '*') {
    this.colunas = colunas === '*' ? null : colunas.split(',').map((c) => c.trim())
    return this
  }
  eq(coluna: string, valor: unknown) {
    this.filtros.push((l) => igual(l[coluna], valor))
    return this
  }
  ilike(coluna: string, valor: string) {
    this.filtros.push((l) => String(l[coluna]).toLowerCase() === valor.toLowerCase())
    return this
  }
  in(coluna: string, valores: unknown[]) {
    this.filtros.push((l) => valores.some((v) => igual(l[coluna], v)))
    return this
  }
  insert(linhas: Linha | Linha[]) {
    this.paraInserir = Array.isArray(linhas) ? linhas : [linhas]
    return this
  }
  single() {
    this.modo = 'uma'
    return this
  }
  maybeSingle() {
    this.modo = 'talvez'
    return this
  }
  overrideTypes() {
    return this
  }
  returns() {
    return this
  }

  then<A = never, B = never>(
    ok?: ((r: { data: unknown; error: { code?: string; message: string } | null }) => A | PromiseLike<A>) | null,
    falha?: ((motivo: unknown) => B | PromiseLike<B>) | null
  ): PromiseLike<A | B> {
    return Promise.resolve(this.executar()).then(ok, falha)
  }

  private projetar(l: Linha): Linha {
    if (!this.colunas) return { ...l }
    return Object.fromEntries(this.colunas.map((c) => [c, l[c]]))
  }

  private executar(): { data: unknown; error: { code?: string; message: string } | null } {
    const erro = this.erros[this.tabela]
    if (erro) return { data: null, error: { message: erro } }
    const linhas = (this.banco.tabelas[this.tabela] ??= []) as Linha[]

    let resultado: Linha[]
    if (this.paraInserir) {
      const novas: Linha[] = this.paraInserir.map((l) => ({ id: randomUUID(), created_at: '2026-10-07T12:00:00Z', ...l }))
      for (const coluna of UNICAS[this.tabela] ?? []) {
        const repetida = novas.find((n) => linhas.some((l) => l[coluna] === n[coluna]))
        if (repetida) return { data: null, error: { code: '23505', message: `duplicate key value (${coluna})` } }
      }
      linhas.push(...novas)
      this.banco.operacoes.push({ tabela: this.tabela, tipo: 'insert', linhas: novas })
      // O gatilho do banco: toda clínica nova ganha a unidade principal.
      if (this.tabela === 'aniversariantes.aniversariantes_clinicas') {
        const unidades = (this.banco.tabelas['aniversariantes.aniversariantes_unidades'] ??= [])
        for (const c of novas) unidades.push({ id: randomUUID(), clinica_id: c.id, nome: c.nome, principal: true })
      }
      resultado = novas
    } else {
      this.banco.operacoes.push({ tabela: this.tabela, tipo: 'select' })
      resultado = linhas.filter((l) => this.filtros.every((f) => f(l)))
    }

    const dados = resultado.map((l) => this.projetar(l))
    if (this.modo === 'muitas') return { data: this.paraInserir && !this.colunas ? null : dados, error: null }
    if (dados.length > 1) return { data: null, error: { message: 'mais de uma linha' } }
    if (dados.length === 0 && this.modo === 'uma') return { data: null, error: { message: 'nenhuma linha' } }
    return { data: dados[0] ?? null, error: null }
  }
}

/**
 * Um banco falso com as tabelas dadas. `erros` faz uma tabela responder erro
 * (ex.: `{ 'cadastro.clinicas': 'schema não exposto' }`).
 */
export function bancoFalso(tabelas: Tabelas = {}, erros: Record<string, string> = {}): BancoFalso {
  const banco = { tabelas, operacoes: [] } as unknown as BancoFalso
  const esquema = (nome: string) => ({ from: (t: string) => new Consulta(banco, `${nome}.${t}`, erros) })
  banco.cliente = { schema: esquema } as unknown as ClienteDoBanco
  return banco
}

// ─── A cifra do CRM ─────────────────────────────────────────────────────────

/** Uma chave de teste (32 bytes 0x07, em base64). Nunca use em produção. */
export const CHAVE_DE_TESTE = 'BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc='

/** Cifra como o CRM cifra: AES-256-GCM, "iv:tag:cifrado" em base64. */
export function cifrar(texto: string, chave: string = CHAVE_DE_TESTE): string {
  const iv = randomBytes(12)
  const cifra = createCipheriv('aes-256-gcm', Buffer.from(chave, 'base64'), iv)
  const cifrado = Buffer.concat([cifra.update(texto, 'utf8'), cifra.final()])
  return [iv.toString('base64'), cifra.getAuthTag().toString('base64'), cifrado.toString('base64')].join(':')
}

// ─── As linhas das visões ───────────────────────────────────────────────────

export const CONTA = '7b1a1c2e-3d4f-4a5b-8c6d-0e1f2a3b4c5d'
export const CLINICA_NO_CRM = 'c0000000-0000-4000-8000-000000000001'

export function clinicaDoCadastro(campos: Partial<ClinicaDoCadastroRow> = {}): ClinicaDoCadastroRow {
  return {
    id: CLINICA_NO_CRM,
    company_id: CONTA,
    nome: 'Prev Odonto',
    fuso_horario: 'America/Sao_Paulo',
    token_plataforma_cifrado: cifrar('token-da-plataforma'),
    ...campos,
  }
}

export function unidadeDoCadastro(campos: Partial<UnidadeDoCadastroRow> = {}): UnidadeDoCadastroRow {
  return {
    id: 'a0000000-0000-4000-8000-000000000001',
    clinica_id: CLINICA_NO_CRM,
    company_id: CONTA,
    nome: 'Centro',
    principal: true,
    ativa: true,
    canal_envio_id: 'canal-centro',
    canal_envio_numero: '5545999990001',
    equipe_envio_id: 'e0000000-0000-4000-8000-000000000001',
    prontuario_sistema: 'clinicorp',
    prontuario_credenciais_cifradas: cifrar(
      JSON.stringify({
        usuario: 'api@prev',
        token: 'token-clinicorp',
        subscriberId: 'prevodonto',
        baseUrl: 'https://api.clinicorp.com/rest/v1',
      })
    ),
    ...campos,
  }
}

export function produtoDoCadastro(campos: Partial<ProdutoDoCadastroRow> = {}): ProdutoDoCadastroRow {
  return {
    clinica_id: CLINICA_NO_CRM,
    company_id: CONTA,
    produto: 'aniversariantes',
    ligado: true,
    configuracao: { campoNascimento: 'data-de-nascimento' },
    ...campos,
  }
}

export function origemDaUnidade(campos: Partial<OrigemDaUnidadeRow> = {}): OrigemDaUnidadeRow {
  return {
    unidade_id: 'a0000000-0000-4000-8000-000000000001',
    clinica_id: CLINICA_NO_CRM,
    company_id: CONTA,
    origem: 'aniversariantes',
    id_na_origem: 'b0000000-0000-4000-8000-000000000001',
    ...campos,
  }
}
