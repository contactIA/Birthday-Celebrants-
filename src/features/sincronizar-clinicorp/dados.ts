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
  const base = (linha: LinhaDeCache) => ({
    clinica_id: clinica.id,
    paciente_id: linha.pacienteId,
    nome: linha.nome,
    telefone: linha.telefone,
    datanascimento: linha.datanascimento,
    mes_aniversario: linha.mes,
    dia_aniversario: linha.dia,
    synced_at: carimbo,
  })

  // Dois upserts porque o PostgREST exige as mesmas colunas em todas as linhas
  // de um lote. O das não verificadas OMITE `situacao`: no conflito o upsert só
  // atualiza as colunas enviadas, então o status que o cache já tinha fica — e
  // paciente novo nasce com `null`, o default da coluna.
  const verificadas = linhas.filter((l) => l.situacaoVerificada)
  const naoVerificadas = linhas.filter((l) => !l.situacaoVerificada)

  const lotes = [
    verificadas.map((l) => ({ ...base(l), situacao: l.situacao })),
    naoVerificadas.map(base),
  ].filter((lote) => lote.length > 0)

  for (const lote of lotes) {
    const { error } = await db()
      .from('aniversariantes_pacientes_cache')
      .upsert(lote, { onConflict: 'clinica_id,paciente_id' })
    if (error) throw new Error(`Erro ao gravar o cache: ${error.message}`)
  }
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
    .order('synced_at', { ascending: false })
    .limit(1)

  if (error) throw new Error(`Erro ao ler o cache: ${error.message}`)
  return { pacientes: count ?? 0, sincronizadoEm: data?.[0]?.synced_at ?? null }
}
