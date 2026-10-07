import { db } from '@/shared/db'
import type { Clinica } from '@/shared/clinica/repositorio'
import type { StatusEnvio } from '@/shared/db'
import type { ConfiguracaoDeModelo, EnvioExistente, EnvioParaGravar } from './agendamento'

/**
 * A configuração do modelo, escopada à clínica.
 *
 * O `.eq('clinica_id')` NÃO é redundante com o gate de acesso: sem ele bastava
 * mandar o id de um modelo de outra clínica para usá-lo com as credenciais
 * desta. Escopar a busca é o que transforma "de outra clínica" na resposta
 * certa — "não encontrado".
 */
export async function buscarModeloConfig(
  clinica: Clinica,
  modeloConfigId: string
): Promise<ConfiguracaoDeModelo | null> {
  const { data, error } = await db()
    .from('aniversariantes_templates')
    .select('id, helena_template_id, param_mapping, dia_envio, horario_envio')
    .eq('id', modeloConfigId)
    .eq('clinica_id', clinica.id)
    .eq('unidade_id', clinica.unidade.id)
    .maybeSingle<{
      id: string
      helena_template_id: string
      param_mapping: Record<string, string>
      dia_envio: ConfiguracaoDeModelo['diaEnvio']
      horario_envio: string
    }>()

  if (error) throw new Error(`Erro ao buscar o modelo: ${error.message}`)
  if (!data) return null

  return {
    id: data.id,
    modeloId: data.helena_template_id,
    parametros: data.param_mapping ?? {},
    diaEnvio: data.dia_envio,
    horarioEnvio: data.horario_envio,
  }
}

/**
 * Os envios já gravados desses pacientes, de qualquer ano.
 *
 * Sem filtro de ano: o ano de cada paciente depende do mês do aniversário (em
 * dezembro, janeiro já é do ano que vem), e quem decide é a regra.
 */
export async function buscarEnvios(clinica: Clinica, pacienteIds: string[]): Promise<EnvioExistente[]> {
  const { data, error } = await db()
    .from('aniversariantes_envios')
    .select('paciente_id_eclinica, ano, status')
    .eq('clinica_id', clinica.id)
    .eq('unidade_id', clinica.unidade.id)
    .in('paciente_id_eclinica', pacienteIds)
    .returns<{ paciente_id_eclinica: string; ano: number; status: StatusEnvio }[]>()

  if (error) throw new Error(`Erro ao buscar os envios: ${error.message}`)

  return (data ?? []).map((linha) => ({
    // Nome legado da coluna: guarda o id em qualquer prontuário.
    pacienteId: linha.paciente_id_eclinica,
    ano: linha.ano,
    status: linha.status,
  }))
}

/**
 * Grava o agendamento.
 *
 * `upsert` na chave (unidade, paciente, ano): um parabéns por paciente por ano.
 * Só chega aqui por cima de linha cancelada ou falha — a regra recusa antes
 * quem já tem mensagem valendo. Sobrescrever uma agendada deixaria a anterior
 * viva na plataforma, sem ninguém aqui que a conheça.
 */
export async function registrarEnvio(clinica: Clinica, envio: EnvioParaGravar): Promise<void> {
  const { error } = await db()
    .from('aniversariantes_envios')
    .upsert(
      {
        clinica_id: clinica.id,
        unidade_id: clinica.unidade.id,
        template_id: envio.modeloConfigId,
        // Nome legado da coluna: guarda o id em qualquer prontuário.
        paciente_id_eclinica: envio.pacienteId,
        paciente_nome: envio.pacienteNome,
        paciente_telefone: envio.pacienteTelefone,
        data_nascimento: envio.dataNascimento,
        ano: envio.ano,
        scheduled_message_id: envio.mensagemId,
        status: 'scheduled' as const,
        scheduled_for: envio.agendadoPara,
      },
      { onConflict: 'unidade_id,paciente_id_eclinica,ano' }
    )

  if (error) throw new Error(`Erro ao registrar o envio: ${error.message}`)
}
