import { db, type TemplateRow } from '@/shared/db'
import type { Clinica } from '@/shared/clinica/repositorio'
import type { ConfiguracaoSalva, ConfiguracaoParaSalvar } from './modelos'

type LinhaDeConfig = Pick<
  TemplateRow,
  'id' | 'helena_template_id' | 'param_mapping' | 'dia_envio' | 'horario_envio' | 'is_default' | 'ativo'
>

/** Configurações da clínica, indexadas pelo id do modelo na plataforma. */
export async function buscarConfiguracoes(clinica: Clinica): Promise<Map<string, ConfiguracaoSalva>> {
  const { data, error } = await db()
    .from('aniversariantes_templates')
    .select('id, helena_template_id, param_mapping, dia_envio, horario_envio, is_default, ativo')
    .eq('clinica_id', clinica.id)
    .returns<LinhaDeConfig[]>()

  if (error) throw new Error(`Erro ao buscar as configurações: ${error.message}`)

  return new Map(
    (data ?? []).map((linha) => [
      linha.helena_template_id,
      {
        id: linha.id,
        parametros: linha.param_mapping ?? {},
        diaEnvio: linha.dia_envio,
        horarioEnvio: linha.horario_envio,
        ehPadrao: linha.is_default,
        ativo: linha.ativo,
      },
    ])
  )
}

export async function limparPadrao(clinica: Clinica): Promise<void> {
  const { error } = await db()
    .from('aniversariantes_templates')
    .update({ is_default: false })
    .eq('clinica_id', clinica.id)

  if (error) throw new Error(`Erro ao atualizar o modelo padrão: ${error.message}`)
}

export async function gravarConfiguracao(
  clinica: Clinica,
  config: ConfiguracaoParaSalvar
): Promise<void> {
  const { error } = await db()
    .from('aniversariantes_templates')
    .upsert(
      {
        clinica_id: clinica.id,
        helena_template_id: config.modeloId,
        nome: config.nome,
        param_mapping: config.parametros,
        dia_envio: config.diaEnvio,
        horario_envio: config.horarioEnvio,
        is_default: config.ehPadrao,
        ativo: config.ativo,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'clinica_id,helena_template_id' }
    )

  if (error) throw new Error(`Erro ao salvar a configuração: ${error.message}`)
}
