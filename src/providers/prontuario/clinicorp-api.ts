import type { Clinica } from '@/shared/clinica/repositorio'
import { ProntuarioMalConfiguradoError, TIMEOUT_MS } from './porta'

// Cliente HTTP da API da Clinicorp.
//
// NÃO confundir com `clinicorp.ts`, ao lado: aquele é o adapter da PORTA de
// prontuário, e lê o NOSSO cache. Este fala com a API deles de verdade.
//
// POR QUE MORA EM `providers/`: nasceu dentro da fatia `sincronizar-clinicorp`,
// que era a única a usá-lo. O teste de conexão da área de setup virou o segundo
// usuário — e fatias não importam umas das outras (ADR 0001), então ele subiu
// para cá, junto do adapter do mesmo fornecedor.
//
// AUTENTICAÇÃO: HTTP Basic (usuário API + token API), não Bearer. O spec deles
// chama o scheme de "bearerAuth" mas o `scheme` de fato é "basic" — nome
// enganoso que já custou tempo. Toda rota também exige `subscriber_id`: um
// mesmo usuário pode enxergar mais de um assinante.

const BASE_URL_PADRAO = 'https://api.clinicorp.com/rest/v1'

/** Tentativas por chamada, contando a primeira. */
export const TENTATIVAS = 4

/** Respostas que valem nova tentativa: limite de taxa e indisponibilidade. */
const RETENTAVEIS = new Set([429, 503])

/** A espera mais longa que vale a pena fazer antes de tentar de novo, em segundos. */
export const ESPERA_MAXIMA_S = 30

/**
 * Quanto esperar antes da próxima tentativa, em ms — ou `null` para NÃO tentar.
 *
 * Respeita o `Retry-After` quando a Clinicorp manda (em segundos). Se ele pede
 * mais que ESPERA_MAXIMA_S, a resposta é `null`: a cota da hora acabou (a
 * Clinicorp limita 500 chamadas/hora por usuário de API) e ela está dizendo
 * quando volta — em produção veio 2286s. A versão anterior cortava a espera em
 * 30s e tentava de novo, o que não tinha como passar e só alongava a
 * sincronização em dezenas de minutos de 429.
 *
 * Sem `Retry-After`, espera crescente (1s, 2s, 4s) com um pouco de sorteio —
 * sem o sorteio, as chamadas que tomaram 429 juntas voltariam juntas.
 */
export function esperaAntesDaTentativa(
  tentativa: number,
  retryAfter: string | null,
  sorteio: number = Math.random()
): number | null {
  const segundos = retryAfter === null ? NaN : Number(retryAfter)
  if (Number.isFinite(segundos) && segundos >= 0) {
    return segundos > ESPERA_MAXIMA_S ? null : segundos * 1000
  }
  return 1000 * 2 ** (tentativa - 1) + Math.floor(sorteio * 250)
}

/**
 * A cota de chamadas da Clinicorp acabou e só volta daqui a minutos.
 *
 * `interrompeSincronizacao`: quem estiver num lote deve PARAR, não seguir
 * tentando os itens restantes — todos tomariam o mesmo 429. A sincronização lê
 * esta marca sem conhecer o tipo (ver sincronizacao.ts).
 */
export class CotaEsgotadaError extends Error {
  readonly status = 429
  readonly codigo = 'COTA_ESGOTADA' as const
  readonly interrompeSincronizacao = true
  constructor(readonly liberaEmSegundos: number) {
    super(
      `Limite de chamadas por hora da Clinicorp atingido. Libera em ${Math.ceil(liberaEmSegundos / 60)} min`
    )
    this.name = 'CotaEsgotadaError'
  }
}

const esperar = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * `/patient/birthdays` responde **400** para dia sem aniversariante — o spec
 * aponta o 400 para a resposta `NotFound`, com corpo
 * `{"Message":"Nenhum paciente ativo faz aniversário na data informada!"}`.
 *
 * Tratar isso como erro adiava a limpeza do cache PARA SEMPRE em toda clínica
 * que tivesse um dia vazio no período (quase todas). A distinção é pela
 * mensagem porque parâmetro faltando também volta 400, e esse é erro de verdade.
 */
export function ehDiaSemAniversariante(status: number, corpo: string): boolean {
  return status === 400 && /nenhum paciente/i.test(corpo)
}

/** Um paciente como a API de aniversariantes o devolve. */
export interface PacienteBruto {
  PatientId: number | string
  Name: string
  BirthDate: string | null
  MobilePhone: string | null
}

/**
 * Só a listagem de aniversariantes. Havia também `statusDoPaciente`
 * (`/patient/get`), removido: a listagem já só devolve pacientes ativos — ver
 * o topo de `features/sincronizar-clinicorp/sincronizacao.ts`.
 */
export interface ClienteClinicorp {
  aniversariantesDoDia: (data: string) => Promise<PacienteBruto[]>
}

export function clienteClinicorp(clinica: Clinica): ClienteClinicorp {
  const { usuarioApi, tokenApi, subscriberId, baseUrl } = clinica.credenciais.clinicorp
  if (!usuarioApi || !tokenApi || !subscriberId) {
    throw new ProntuarioMalConfiguradoError('Clínica sem credenciais de prontuário completas')
  }

  const basic = Buffer.from(`${usuarioApi}:${tokenApi}`).toString('base64')

  /** `vazio` = o que devolver quando a resposta é o 400 de "nada encontrado". */
  async function chamar<T>(
    caminho: string,
    params: Record<string, string>,
    vazio?: T
  ): Promise<T> {
    const query = new URLSearchParams({ subscriber_id: subscriberId!, ...params })

    for (let tentativa = 1; ; tentativa++) {
      let resposta: Response
      try {
        resposta = await fetch(`${baseUrl || BASE_URL_PADRAO}${caminho}?${query}`, {
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            Authorization: `Basic ${basic}`,
          },
          cache: 'no-store',
          signal: AbortSignal.timeout(TIMEOUT_MS),
        })
      } catch (err) {
        const causa = (err as Error).name === 'TimeoutError' ? 'timeout' : 'sem resposta'
        throw new Error(`${caminho}: ${causa}`)
      }

      if (resposta.ok) return (await resposta.json()) as T

      if (RETENTAVEIS.has(resposta.status)) {
        const retryAfter = resposta.headers.get('retry-after')
        const espera = esperaAntesDaTentativa(tentativa, retryAfter)
        if (espera === null) {
          await resposta.body?.cancel()
          throw new CotaEsgotadaError(Number(retryAfter))
        }
        if (tentativa < TENTATIVAS) {
          // Descarta o corpo para liberar a conexão antes de esperar.
          await resposta.body?.cancel()
          await esperar(espera)
          continue
        }
      }

      // O corpo vai para o LOG, truncado, e nunca para a exceção: a exceção
      // sobe até o relatório do cron, e o corpo pode trazer dado de paciente.
      // Sem ele não havia como saber por que a Clinicorp recusava dias com 400.
      const corpo = (await resposta.text().catch(() => '')).slice(0, 300)
      if (vazio !== undefined && ehDiaSemAniversariante(resposta.status, corpo)) return vazio
      console.error(
        `[clinicorp] ${caminho} HTTP ${resposta.status} (tentativa ${tentativa}/${TENTATIVAS}): ${corpo}`
      )
      throw new Error(`${caminho}: HTTP ${resposta.status}`)
    }
  }

  return {
    async aniversariantesDoDia(data: string): Promise<PacienteBruto[]> {
      const lista = await chamar<PacienteBruto[]>('/patient/birthdays', { date: data }, [])
      return Array.isArray(lista) ? lista : []
    },
  }
}
