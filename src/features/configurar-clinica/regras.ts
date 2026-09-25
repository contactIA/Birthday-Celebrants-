import { FUSOS_SUPORTADOS } from '@/shared/data/fuso'
import type { Clinica } from '@/shared/clinica/repositorio'
import type { SistemaProntuario } from '@/shared/db'

// A regra do cadastro de clínica na área de setup.
//
// O ponto delicado é a SEMÂNTICA DOS SEGREDOS. A tela nunca recebe o valor de
// um token (ver `ClinicaNoSetup`), então o campo chega vazio em toda edição.
// Vazio precisa significar "manter" — senão salvar o nome da clínica apagaria
// todos os tokens dela. Para os campos que NÃO são segredo (a tela mostra o
// valor atual), vazio significa o que parece: limpar.
//
// O que NÃO mora aqui: a regra "credenciais completas para o sistema escolhido".
// Ela é a check constraint do banco, e o repositório traduz a recusa em frase.
// Uma cópia em TypeScript divergiria dela na primeira mudança (ADR 0002).

export const BASE_URL_ECLINICA = 'https://eclinica.app/api/v2'
export const BASE_URL_CLINICORP = 'https://api.clinicorp.com/rest/v1'
export const FUSO_PADRAO = 'America/Sao_Paulo'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SISTEMAS: SistemaProntuario[] = ['eclinica', 'clinicorp']

/** Os campos do formulário, como chegam no corpo. Todos opcionais. */
export interface EntradaDeClinica {
  companyId?: string
  nome?: string
  timezone?: string
  sistemaProntuario?: string
  eclinicaToken?: string
  eclinicaBaseUrl?: string
  clinicorpUsuarioApi?: string
  clinicorpTokenApi?: string
  clinicorpSubscriberId?: string
  clinicorpBaseUrl?: string
  mensageriaToken?: string
  mensageriaFrom?: string
  mensageriaChannelId?: string
  mensageriaCampoNascimento?: string
}

const CAMPOS: (keyof EntradaDeClinica)[] = [
  'companyId',
  'nome',
  'timezone',
  'sistemaProntuario',
  'eclinicaToken',
  'eclinicaBaseUrl',
  'clinicorpUsuarioApi',
  'clinicorpTokenApi',
  'clinicorpSubscriberId',
  'clinicorpBaseUrl',
  'mensageriaToken',
  'mensageriaFrom',
  'mensageriaChannelId',
  'mensageriaCampoNascimento',
]

export class CadastroInvalidoError extends Error {
  readonly status = 400
  readonly codigo = 'CADASTRO_INVALIDO' as const
  constructor(mensagem: string) {
    super(mensagem)
    this.name = 'CadastroInvalidoError'
  }
}

/**
 * Lê o corpo do request. Só aceita string nos campos conhecidos e IGNORA o
 * resto — um campo a mais no JSON não pode virar coluna no banco.
 */
export function lerEntrada(corpo: unknown): EntradaDeClinica {
  if (typeof corpo !== 'object' || corpo === null) {
    throw new CadastroInvalidoError('Corpo da requisição inválido')
  }
  const entrada: EntradaDeClinica = {}
  for (const campo of CAMPOS) {
    const valor = (corpo as Record<string, unknown>)[campo]
    if (valor === undefined || valor === null) continue
    if (typeof valor !== 'string') throw new CadastroInvalidoError(`Campo inválido: ${campo}`)
    entrada[campo] = valor
  }
  return entrada
}

function texto(v: string | undefined): string | null {
  const t = v?.trim()
  return t ? t : null
}

/** Segredo: vazio = manter o atual. */
function segredo(novo: string | undefined, atual: string | null): string | null {
  return texto(novo) ?? atual
}

/** Não-segredo: ausente = manter; presente e vazio = limpar. */
function aberto(novo: string | undefined, atual: string | null): string | null {
  return novo === undefined ? atual : texto(novo)
}

function baseUrl(novo: string | undefined, atual: string | undefined, padrao: string, rotulo: string): string {
  if (novo === undefined) return atual ?? padrao
  const t = texto(novo)
  if (!t) return padrao
  let url: URL
  try {
    url = new URL(t)
  } catch {
    throw new CadastroInvalidoError(`URL da API ${rotulo} inválida`)
  }
  // HTTPS obrigatório: o token vai no header de toda chamada.
  if (url.protocol !== 'https:') throw new CadastroInvalidoError(`A URL da API ${rotulo} precisa ser https`)
  return t.replace(/\/+$/, '')
}

/**
 * A chave do campo de nascimento. Vem de um select alimentado pela própria
 * plataforma, então só se confere o formato: uma chave, não uma frase.
 */
function campoNascimento(novo: string | undefined, atual: string | null): string | null {
  const valor = aberto(novo, atual)
  if (valor === null) return null
  if (valor.length > 120 || !/^[\p{L}\p{N}_-]+$/u.test(valor)) {
    throw new CadastroInvalidoError('Campo de data de nascimento inválido')
  }
  return valor
}

/**
 * A clínica resultante: a entrada mesclada sobre a existente (ou sobre nada,
 * no cadastro). Lança `CadastroInvalidoError` com frase para a tela.
 *
 * O `id` de uma clínica nova sai vazio — quem cria é o banco.
 */
export function montarClinica(entrada: EntradaDeClinica, existente: Clinica | null): Clinica {
  let companyId: string
  if (existente) {
    // Imutável na edição: é a chave dos links já emitidos (ver atualizarClinica).
    const informado = texto(entrada.companyId)
    if (informado && informado.toLowerCase() !== existente.companyId.toLowerCase()) {
      throw new CadastroInvalidoError('O company_id não pode ser alterado. Cadastre a clínica de novo.')
    }
    companyId = existente.companyId
  } else {
    const informado = texto(entrada.companyId)
    if (!informado) throw new CadastroInvalidoError('Informe o company_id da clínica')
    if (!UUID.test(informado)) {
      throw new CadastroInvalidoError('O company_id é um UUID (ex.: 7b1a1c2e-…); confira o valor copiado')
    }
    companyId = informado.toLowerCase()
  }

  const nome = aberto(entrada.nome, existente?.nome ?? null)
  if (!nome) throw new CadastroInvalidoError('Informe o nome da clínica')
  if (nome.length > 120) throw new CadastroInvalidoError('Nome da clínica muito longo')

  const timezone = texto(entrada.timezone) ?? existente?.timezone ?? FUSO_PADRAO
  if (!FUSOS_SUPORTADOS.includes(timezone)) throw new CadastroInvalidoError('Fuso horário não suportado')

  const sistema = texto(entrada.sistemaProntuario) ?? existente?.sistemaProntuario
  if (!sistema) throw new CadastroInvalidoError('Escolha o sistema de prontuário')
  if (!SISTEMAS.includes(sistema as SistemaProntuario)) {
    throw new CadastroInvalidoError('Sistema de prontuário não suportado')
  }

  const antes = existente?.credenciais
  const tokenMensageria = segredo(entrada.mensageriaToken, antes?.mensageria.token ?? null)
  if (!tokenMensageria) throw new CadastroInvalidoError('Informe o token da plataforma de mensagens')

  return {
    id: existente?.id ?? '',
    companyId,
    nome,
    timezone,
    sistemaProntuario: sistema as SistemaProntuario,
    credenciais: {
      eclinica: {
        token: segredo(entrada.eclinicaToken, antes?.eclinica.token ?? null),
        baseUrl: baseUrl(entrada.eclinicaBaseUrl, antes?.eclinica.baseUrl, BASE_URL_ECLINICA, 'da e-Clínica'),
      },
      clinicorp: {
        usuarioApi: aberto(entrada.clinicorpUsuarioApi, antes?.clinicorp.usuarioApi ?? null),
        tokenApi: segredo(entrada.clinicorpTokenApi, antes?.clinicorp.tokenApi ?? null),
        subscriberId: aberto(entrada.clinicorpSubscriberId, antes?.clinicorp.subscriberId ?? null),
        baseUrl: baseUrl(entrada.clinicorpBaseUrl, antes?.clinicorp.baseUrl, BASE_URL_CLINICORP, 'da Clinicorp'),
      },
      mensageria: {
        token: tokenMensageria,
        from: aberto(entrada.mensageriaFrom, antes?.mensageria.from ?? null),
        channelId: aberto(entrada.mensageriaChannelId, antes?.mensageria.channelId ?? null),
        campoNascimento: campoNascimento(entrada.mensageriaCampoNascimento, antes?.mensageria.campoNascimento ?? null),
      },
    },
  }
}

/**
 * Os NOMES dos campos que mudaram — para o log de auditoria.
 *
 * Nomes, nunca valores: o log da VPS é lido por quem tem acesso ao servidor, e
 * não precisa conter token nenhum para dizer "o token da Clinicorp mudou".
 */
export function camposAlterados(antes: Clinica, depois: Clinica): string[] {
  const achatar = (c: Clinica): Record<string, string | null> => ({
    nome: c.nome,
    timezone: c.timezone,
    sistemaProntuario: c.sistemaProntuario,
    eclinicaToken: c.credenciais.eclinica.token,
    eclinicaBaseUrl: c.credenciais.eclinica.baseUrl,
    clinicorpUsuarioApi: c.credenciais.clinicorp.usuarioApi,
    clinicorpTokenApi: c.credenciais.clinicorp.tokenApi,
    clinicorpSubscriberId: c.credenciais.clinicorp.subscriberId,
    clinicorpBaseUrl: c.credenciais.clinicorp.baseUrl,
    mensageriaToken: c.credenciais.mensageria.token,
    mensageriaFrom: c.credenciais.mensageria.from,
    mensageriaChannelId: c.credenciais.mensageria.channelId,
    mensageriaCampoNascimento: c.credenciais.mensageria.campoNascimento,
  })
  const a = achatar(antes)
  const d = achatar(depois)
  return Object.keys(a).filter((k) => a[k] !== d[k])
}

/** Validades oferecidas para o link do painel, em segundos. `null` = sem expiração. */
export const VALIDADES_DO_LINK = {
  sem: null,
  '30d': 60 * 60 * 24 * 30,
  '7d': 60 * 60 * 24 * 7,
  '24h': 60 * 60 * 24,
} as const

export type ValidadeDoLink = keyof typeof VALIDADES_DO_LINK

export function lerValidade(bruto: unknown): ValidadeDoLink {
  if (typeof bruto === 'string' && bruto in VALIDADES_DO_LINK) return bruto as ValidadeDoLink
  throw new CadastroInvalidoError('Validade do link inválida')
}
