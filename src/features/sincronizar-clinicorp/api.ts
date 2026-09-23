import type { Clinica } from '@/shared/clinica/repositorio'
import { ProntuarioMalConfiguradoError, TIMEOUT_MS } from '@/providers/prontuario'
import type { PacienteBruto } from './sincronizacao'

// Cliente HTTP da API da Clinicorp.
//
// POR QUE ELE VIVE NA FATIA, e não em `providers/`: `providers/` guarda as duas
// PORTAS que variam, e o adapter Clinicorp que está lá lê o NOSSO cache. Este
// cliente é uma dependência concreta de um único job — o cron — e nada mais o
// usa. Pela regra do Vertical Slice, mora com quem o usa.
//
// AUTENTICAÇÃO: HTTP Basic (usuário API + token API), não Bearer. O spec deles
// chama o scheme de "bearerAuth" mas o `scheme` de fato é "basic" — nome
// enganoso que já custou tempo. Toda rota também exige `subscriber_id`: um
// mesmo usuário pode enxergar mais de um assinante.

const BASE_URL_PADRAO = 'https://api.clinicorp.com/rest/v1'

interface PacienteDetalhado {
  Status: 'ACTIVE' | 'INACTIVE' | 'DELETED'
}

export interface ClienteClinicorp {
  aniversariantesDoDia: (data: string) => Promise<PacienteBruto[]>
  statusDoPaciente: (pacienteId: string) => Promise<string | null>
}

export function clienteClinicorp(clinica: Clinica): ClienteClinicorp {
  const { usuarioApi, tokenApi, subscriberId, baseUrl } = clinica.credenciais.clinicorp
  if (!usuarioApi || !tokenApi || !subscriberId) {
    throw new ProntuarioMalConfiguradoError('Clínica sem credenciais de prontuário completas')
  }

  const basic = Buffer.from(`${usuarioApi}:${tokenApi}`).toString('base64')

  async function chamar<T>(caminho: string, params: Record<string, string>): Promise<T> {
    const query = new URLSearchParams({ subscriber_id: subscriberId!, ...params })
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

    if (!resposta.ok) {
      // O corpo pode trazer dado de paciente: fica no log, não sobe na exceção.
      console.error(`[clinicorp] ${caminho} HTTP ${resposta.status}`)
      throw new Error(`${caminho}: HTTP ${resposta.status}`)
    }
    return (await resposta.json()) as T
  }

  return {
    async aniversariantesDoDia(data: string): Promise<PacienteBruto[]> {
      const lista = await chamar<PacienteBruto[]>('/patient/birthdays', { date: data })
      return Array.isArray(lista) ? lista : []
    },

    async statusDoPaciente(pacienteId: string): Promise<string | null> {
      const p = await chamar<PacienteDetalhado>('/patient/get', { PatientId: pacienteId })
      return p?.Status ?? null
    },
  }
}
