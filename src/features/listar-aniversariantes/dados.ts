import { db } from '@/shared/db'
import type { Clinica } from '@/shared/clinica/repositorio'
import type { EnvioResumo } from './consulta'

// Acesso a dados desta fatia.
//
// `aniversariantes_envios` não tem consumidor externo, então a consulta mora
// aqui mesmo, sem repositório intermediário — ADR 0001. A única tabela que
// ganhou acessor compartilhado é `aniversariantes_clinicas`.

/**
 * Os agendamentos da clínica naquele ano.
 *
 * `select` estreito de propósito: a tela precisa de status e data, não da linha
 * inteira — que carrega nome e telefone de paciente já gravados.
 */
export async function buscarEnviosDoAno(clinica: Clinica, ano: number): Promise<EnvioResumo[]> {
  const { data, error } = await db()
    .from('aniversariantes_envios')
    .select('paciente_id_eclinica, status, scheduled_for')
    .eq('clinica_id', clinica.id)
    .eq('ano', ano)
    .returns<{ paciente_id_eclinica: string; status: EnvioResumo['status']; scheduled_for: string | null }[]>()

  if (error) throw new Error(`Erro ao buscar envios: ${error.message}`)

  return (data ?? []).map((linha) => ({
    // A coluna tem nome legado: guarda o id do paciente em qualquer prontuário.
    pacienteId: linha.paciente_id_eclinica,
    status: linha.status,
    scheduledFor: linha.scheduled_for,
  }))
}
