import type { StatusEnvio } from '@/shared/db'

// O resumo de uso do app, por clínica: o que a Mensageria lê em
// `GET /api/integracao/uso` para responder "quais clínicas têm o módulo ligado e
// nunca enviaram nada, ou não enviam há 30 dias?" (ADR 0008 da Mensageria,
// docs/adr/0006-resumo-de-uso-para-a-mensageria.md).
//
// Função pura: as linhas chegam lidas (`dados.ts`) e o instante entra por
// parâmetro. O MESMO contrato vale no app de aniversários; mudar a forma aqui é
// mudar lá também, e na Mensageria.

export type Modulo = 'lembretes' | 'aniversariantes'

/** As situações de um envio, no vocabulário da resposta. */
export type SituacaoNoResumo = 'agendado' | 'processando' | 'enviado' | 'entregue' | 'lido' | 'cancelado' | 'falhou'

export const SITUACAO_DO_STATUS: Record<StatusEnvio, SituacaoNoResumo> = {
  scheduled: 'agendado',
  processed: 'processando',
  sent: 'enviado',
  delivered: 'entregue',
  read: 'lido',
  canceled: 'cancelado',
  failed: 'falhou',
}

/**
 * O que conta como ENVIADO: `sent`, `delivered` e `read`. É o grupo "Enviadas"
 * do Histórico (`SITUACOES.enviadas` em features/historico/filtros.ts; o teste
 * confere que os dois não se separam). Agendado, cancelado e falho não contam:
 * nenhum deles chegou ao paciente.
 */
export const STATUS_ENVIADOS: readonly StatusEnvio[] = ['sent', 'delivered', 'read']

const DIA_MS = 24 * 60 * 60 * 1000

/** Uma clínica da tabela local do app (`id` é o id local, o da tela de setup). */
export interface ClinicaLocal {
  id: string
  companyId: string
  nome: string
}

export interface UnidadeLocal {
  id: string
  clinicaId: string
  nome: string
}

/** Uma clínica como a lista do setup a mostra: as que têm o módulo ligado. */
export interface ClinicaDoSetup {
  /** O id local: o da tela `/setup/clinicas/<id>`. */
  id: string
  companyId: string
  nome: string
  /** As unidades que o app usa, na ordem do setup. */
  unidades: { id: string; nome: string }[]
}

/** Só as colunas de um envio que o resumo usa. */
export interface EnvioDoResumo {
  clinicaId: string
  status: StatusEnvio
  /** Quando a plataforma diz que saiu. Só nos envios reconciliados desde 2026-10-21. */
  enviadoEm: string | null
  /** `scheduled_for`: o horário marcado para sair. */
  agendadoPara: string | null
  criadoEm: string
}

export interface EntradaDoResumo {
  modulo: Modulo
  agora: Date
  /** A origem pública do app (`URL_PUBLICA`); a barra no fim não conta. `null`: o `setupUrl` sai nulo. */
  baseUrl: string | null
  clinicasLocais: ClinicaLocal[]
  unidadesLocais: UnidadeLocal[]
  clinicasDoSetup: ClinicaDoSetup[]
  /** As contas (company_id) com o módulo ligado, em qualquer caixa. */
  contasLigadas: Iterable<string>
  envios: EnvioDoResumo[]
}

export interface EnviosNoResumo {
  total: number
  porSituacao: Record<SituacaoNoResumo, number>
  /** O instante do envio mais recente que conta como enviado. `null`: nunca enviou. */
  ultimoEnvioEm: string | null
  /** Enviados com o instante nos últimos 30 dias (desde `agora` menos 30 x 24 h). */
  ultimos30Dias: number
  ultimos90Dias: number
}

export interface ClinicaNoResumo {
  companyId: string
  nome: string
  ligado: boolean
  /** O id local da clínica neste app: o de `/setup/clinicas/<id>`. `null`: sem linha local. */
  setupId: string | null
  /** A tela de setup da clínica, com a `URL_PUBLICA`. `null` sem a variável, ou fora da lista do setup. */
  setupUrl: string | null
  unidades: { id: string; nome: string }[]
  envios: EnviosNoResumo
}

export interface ResumoDeUso {
  modulo: Modulo
  geradoEm: string
  clinicas: ClinicaNoResumo[]
}

function semEnvios(): EnviosNoResumo {
  return {
    total: 0,
    porSituacao: { agendado: 0, processando: 0, enviado: 0, entregue: 0, lido: 0, cancelado: 0, falhou: 0 },
    ultimoEnvioEm: null,
    ultimos30Dias: 0,
    ultimos90Dias: 0,
  }
}

function instante(texto: string | null): number | null {
  if (!texto) return null
  const ms = Date.parse(texto)
  return Number.isNaN(ms) ? null : ms
}

/**
 * Quando um envio enviado saiu: o `enviado_em` que a reconciliação grava; nos
 * de antes de 2026-10-21 (ou com o passo pulado), o horário marcado
 * (`scheduled_for`); sem ele, quando o envio foi criado.
 */
export function instanteDoEnvio(envio: EnvioDoResumo): number | null {
  return instante(envio.enviadoEm) ?? instante(envio.agendadoPara) ?? instante(envio.criadoEm)
}

const ENVIADOS = new Set<StatusEnvio>(STATUS_ENVIADOS)

function somarEnvios(envios: EnvioDoResumo[], agora: Date): Map<string, EnviosNoResumo> {
  const desde30 = agora.getTime() - 30 * DIA_MS
  const desde90 = agora.getTime() - 90 * DIA_MS
  const porClinica = new Map<string, EnviosNoResumo>()
  const ultimoPorClinica = new Map<string, number>()

  for (const envio of envios) {
    const clinica = envio.clinicaId.toLowerCase()
    let soma = porClinica.get(clinica)
    if (!soma) porClinica.set(clinica, (soma = semEnvios()))

    soma.total += 1
    const situacao = SITUACAO_DO_STATUS[envio.status]
    if (situacao) soma.porSituacao[situacao] += 1

    if (!ENVIADOS.has(envio.status)) continue
    const quando = instanteDoEnvio(envio)
    if (quando === null) continue
    if (quando >= desde30) soma.ultimos30Dias += 1
    if (quando >= desde90) soma.ultimos90Dias += 1
    if (quando > (ultimoPorClinica.get(clinica) ?? -Infinity)) ultimoPorClinica.set(clinica, quando)
  }

  for (const [clinica, quando] of ultimoPorClinica) porClinica.get(clinica)!.ultimoEnvioEm = new Date(quando).toISOString()
  return porClinica
}

/**
 * Monta o resumo.
 *
 * - **Quem entra:** toda clínica da tabela local do app e toda clínica da lista
 *   do setup (a leitura do cadastro pode ter criado a linha local depois de a
 *   tabela ser lida). Uma por id local.
 * - **`ligado`:** a conta está em `contasLigadas`. A clínica da tabela local fora
 *   delas é a que teve o módulo desligado: entra com `ligado: false`, para os
 *   envios antigos aparecerem.
 * - **`unidades`:** as da lista do setup; fora dela, as da tabela local.
 * - **`setupId`:** o id local, de qualquer clínica que tenha a linha local.
 * - **`setupUrl`:** `<origem>/setup/clinicas/<setupId>`, só para a clínica que a
 *   lista do setup mostra (a tela de setup não abre a desligada) e só com a
 *   origem pública conhecida.
 * - **`envios`:** todos os da clínica, de todas as unidades.
 */
export function resumirUso(entrada: EntradaDoResumo): ResumoDeUso {
  const ligadas = new Set([...entrada.contasLigadas].map((c) => c.toLowerCase()))
  const doSetup = new Map(entrada.clinicasDoSetup.map((c) => [c.id.toLowerCase(), c]))
  const locais = new Map(entrada.clinicasLocais.map((c) => [c.id.toLowerCase(), c]))
  const envios = somarEnvios(entrada.envios, entrada.agora)
  const base = entrada.baseUrl?.trim().replace(/\/+$/, '') || null

  const unidadesLocais = new Map<string, { id: string; nome: string }[]>()
  for (const u of entrada.unidadesLocais) {
    const clinica = u.clinicaId.toLowerCase()
    unidadesLocais.set(clinica, [...(unidadesLocais.get(clinica) ?? []), { id: u.id, nome: u.nome }])
  }

  const ids = new Set([...locais.keys(), ...doSetup.keys()])
  const clinicas = [...ids].map((id): ClinicaNoResumo => {
    const setup = doSetup.get(id)
    const local = locais.get(id)
    const companyId = (setup?.companyId ?? local!.companyId).toLowerCase()
    const setupId = setup?.id ?? local?.id ?? null
    return {
      companyId,
      nome: setup?.nome ?? local!.nome,
      ligado: ligadas.has(companyId),
      setupId,
      setupUrl: setup && base ? `${base}/setup/clinicas/${setup.id}` : null,
      unidades: setup
        ? setup.unidades.map((u) => ({ id: u.id, nome: u.nome }))
        : (unidadesLocais.get(id) ?? []).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
      envios: envios.get(id) ?? semEnvios(),
    }
  })

  clinicas.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR') || a.companyId.localeCompare(b.companyId))
  return { modulo: entrada.modulo, geradoEm: entrada.agora.toISOString(), clinicas }
}
