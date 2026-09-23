import { db, type ClinicaRow } from '@/shared/db'
import { buscarClinica, type Clinica } from '@/shared/clinica/repositorio'
import type { LinhaDeCache } from './sincronizacao'

/** As clínicas que usam Clinicorp — as únicas que este cron toca. */
export async function clinicasClinicorp(): Promise<Clinica[]> {
  const { data, error } = await db()
    .from('aniversariantes_clinicas')
    .select('slug')
    .eq('sistema_prontuario', 'clinicorp')
    .returns<Pick<ClinicaRow, 'slug'>[]>()

  if (error) throw new Error(`Erro ao listar clínicas: ${error.message}`)

  // Relê cada uma pelo acessor compartilhado, para a tradução de `slug` para
  // `companyId` acontecer num lugar só.
  return Promise.all((data ?? []).map((linha) => buscarClinica(linha.slug)))
}

/**
 * Grava o lote com um carimbo de execução.
 *
 * O carimbo é o que torna a limpeza segura: em vez de apagar tudo antes de
 * reconstruir, gravamos e depois removemos o que ficou com carimbo anterior.
 */
export async function gravarLote(
  clinica: Clinica,
  linhas: LinhaDeCache[],
  carimbo: string
): Promise<void> {
  const { error } = await db()
    .from('aniversariantes_pacientes_cache')
    .upsert(
      linhas.map((linha) => ({
        clinica_id: clinica.id,
        paciente_id: linha.pacienteId,
        nome: linha.nome,
        telefone: linha.telefone,
        datanascimento: linha.datanascimento,
        mes_aniversario: linha.mes,
        dia_aniversario: linha.dia,
        situacao: linha.situacao,
        synced_at: carimbo,
      })),
      { onConflict: 'clinica_id,paciente_id' }
    )

  if (error) throw new Error(`Erro ao gravar o cache: ${error.message}`)
}

/** Remove o que não foi tocado nesta execução. */
export async function removerObsoletos(clinica: Clinica, carimbo: string): Promise<void> {
  const { error } = await db()
    .from('aniversariantes_pacientes_cache')
    .delete()
    .eq('clinica_id', clinica.id)
    .lt('synced_at', carimbo)

  if (error) throw new Error(`Erro ao limpar o cache: ${error.message}`)
}
