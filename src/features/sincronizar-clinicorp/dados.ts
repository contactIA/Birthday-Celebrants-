import { db } from '@/shared/db'
import { listarTodasAsClinicas, type Clinica } from '@/shared/clinica/repositorio'
import type { LinhaDeCache } from './sincronizacao'

/**
 * As UNIDADES que usam Clinicorp — as únicas que este cron toca. Cada unidade
 * tem credencial e cache próprios, então uma clínica com duas unidades
 * Clinicorp sincroniza duas vezes (e uma com matriz Clinicorp e filial
 * e-Clínica, uma só).
 */
export async function clinicasClinicorp(): Promise<Clinica[]> {
  // Pelo acessor compartilhado, para a tradução de `slug` para `companyId` e a
  // resolução de credenciais por unidade acontecerem num lugar só.
  return (await listarTodasAsClinicas()).filter((c) => c.sistemaProntuario === 'clinicorp')
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
        unidade_id: clinica.unidade.id,
        paciente_id: linha.pacienteId,
        nome: linha.nome,
        telefone: linha.telefone,
        datanascimento: linha.datanascimento,
        mes_aniversario: linha.mes,
        dia_aniversario: linha.dia,
        situacao: linha.situacao,
        synced_at: carimbo,
      })),
      { onConflict: 'unidade_id,paciente_id' }
    )

  if (error) throw new Error(`Erro ao gravar o cache: ${error.message}`)
}

/** Remove o que não foi tocado nesta execução. */
export async function removerObsoletos(clinica: Clinica, carimbo: string): Promise<void> {
  const { error } = await db()
    .from('aniversariantes_pacientes_cache')
    .delete()
    .eq('clinica_id', clinica.id)
    .eq('unidade_id', clinica.unidade.id)
    .lt('synced_at', carimbo)

  if (error) throw new Error(`Erro ao limpar o cache: ${error.message}`)
}

export interface ResumoDoCache {
  pacientes: number
  /** Carimbo da última execução que gravou algo. `null` = nunca sincronizou. */
  sincronizadoEm: string | null
}

/** O estado do cache da clínica, para a área de setup mostrar. */
export async function resumoDoCache(clinica: Clinica): Promise<ResumoDoCache> {
  const { data, count, error } = await db()
    .from('aniversariantes_pacientes_cache')
    .select('synced_at', { count: 'exact' })
    .eq('clinica_id', clinica.id)
    .eq('unidade_id', clinica.unidade.id)
    .order('synced_at', { ascending: false })
    .limit(1)

  if (error) throw new Error(`Erro ao ler o cache: ${error.message}`)
  return { pacientes: count ?? 0, sincronizadoEm: data?.[0]?.synced_at ?? null }
}
