// Chamadas da área de setup à própria API.
//
// Sessão expirada no meio do trabalho (8h) volta para a tela de entrar com o
// caminho atual em `volta` — em vez de cada tela mostrar "erro 401" e a pessoa
// não saber que só precisa digitar a senha de novo.

export class ErroDaApi extends Error {
  constructor(
    mensagem: string,
    readonly status: number
  ) {
    super(mensagem)
    this.name = 'ErroDaApi'
  }
}

export async function chamarApi<T>(caminho: string, init?: RequestInit): Promise<T> {
  const resposta = await fetch(caminho, {
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
  })
  const corpo = await resposta.json().catch(() => null)

  if (resposta.status === 401 && corpo?.codigo === 'SEM_SESSAO_SETUP') {
    const volta = encodeURIComponent(window.location.pathname)
    window.location.assign(`/setup/entrar?volta=${volta}`)
    // Nunca resolve: a página está indo embora, e resolver faria a tela piscar
    // um erro antes do redirect.
    return new Promise<T>(() => {})
  }
  if (!resposta.ok) {
    throw new ErroDaApi(corpo?.error ?? 'Não foi possível completar a operação', resposta.status)
  }
  return corpo as T
}

/** Espelho de `UnidadeNoSetup`. */
export interface UnidadeNoSetup {
  id: string
  nome: string
  principal: boolean
  sistemaProntuario: 'eclinica' | 'clinicorp'
  eclinica: { tokenConfigurado: boolean; baseUrl: string }
  clinicorp: {
    usuarioApi: string | null
    tokenConfigurado: boolean
    subscriberId: string | null
    baseUrl: string
  }
  mensageria: { from: string | null; channelId: string | null; equipeId: string | null }
  /** Só no cadastro comum: as credenciais não abriram com a chave deste servidor. */
  credenciaisIlegiveis?: boolean
}

/** Espelho de `UnidadeForaDoPainel`: unidade do cadastro comum que o painel não mostra. */
export interface UnidadeForaDoPainel {
  nome: string
  motivo: 'inativa' | 'sem_prontuario'
}

/** A clínica como a API de setup devolve — espelho de `ClinicaNoSetup`. */
export interface ClinicaNoSetup {
  id: string
  companyId: string
  nome: string
  /** O da principal. Nulo só no cadastro comum, sem unidade com prontuário. */
  sistemaProntuario: 'eclinica' | 'clinicorp' | null
  timezone: string
  criadaEm: string
  /** Os dados vêm do cadastro comum: só leitura aqui, editam-se no setup do CRM. */
  cadastroComum: boolean
  /** Principal primeiro. */
  unidades: UnidadeNoSetup[]
  /** Só no cadastro comum. */
  foraDoPainel: UnidadeForaDoPainel[]
  eclinica: { tokenConfigurado: boolean; baseUrl: string }
  clinicorp: {
    usuarioApi: string | null
    tokenConfigurado: boolean
    subscriberId: string | null
    baseUrl: string
  }
  mensageria: {
    tokenConfigurado: boolean
    from: string | null
    channelId: string | null
    equipeId: string | null
    campoNascimento: string | null
  }
}

/** Um canal de WhatsApp da conta, como a gaveta o recebe — espelho de `CanalParaEscolher`. */
export interface CanalParaEscolher {
  id: string
  numero: string
  numeroFormatado: string
  nome: string
  /** A padrão primeiro. Vazia = nenhuma equipe agenda por este canal. */
  equipes: { id: string; nome: string; padrao: boolean }[]
  equipeSugerida: string | null
}

/**
 * O prontuário tem tudo que o sistema escolhido exige? Espelha a check
 * constraint. No cadastro comum, o CRM já exige credencial completa: basta haver
 * unidade no painel e as credenciais abrirem.
 */
export function prontuarioCompleto(c: ClinicaNoSetup): boolean {
  if (c.cadastroComum) return c.unidades.length > 0 && c.unidades.every((u) => !u.credenciaisIlegiveis)
  return c.sistemaProntuario === 'eclinica'
    ? c.eclinica.tokenConfigurado
    : !!c.clinicorp.usuarioApi && c.clinicorp.tokenConfigurado && !!c.clinicorp.subscriberId
}

export const NOME_DO_SISTEMA = { eclinica: 'e-Clínica', clinicorp: 'Clinicorp' } as const

export const NOME_DO_FUSO: Record<string, string> = {
  'America/Sao_Paulo': 'Brasília (UTC−3)',
  'America/Manaus': 'Manaus (UTC−4)',
  'America/Rio_Branco': 'Rio Branco (UTC−5)',
  'America/Noronha': 'Fernando de Noronha (UTC−2)',
}
