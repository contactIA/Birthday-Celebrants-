import type { Clinica } from '@/shared/clinica/repositorio'
import { db, type PacienteCacheRow } from '@/shared/db'
import type { Aniversariante, ProvedorDeProntuario } from './porta'

// Adapter da Clinicorp: lê o NOSSO cache, não a API deles.
//
// POR QUE. A API da Clinicorp só tem "aniversariantes de UM dia". Reconstruir
// "o mês" ao vivo custaria até ~31 requests a cada carregamento de tela.
//
// ┌──────────────────────────────────────────────────────────────────────────┐
// │ DEPENDÊNCIA ENTRE FATIAS — a única do sistema.                           │
// │                                                                          │
// │ Quem ESCREVE este cache é `features/sincronizar-clinicorp` (cron diário).│
// │ Quem LÊ é este adapter. As duas precisam concordar sobre o conteúdo da   │
// │ tabela `aniversariantes_pacientes_cache`, e nada no compilador garante   │
// │ isso — a tabela é a interface. Mexeu numa, olhe a outra.                 │
// └──────────────────────────────────────────────────────────────────────────┘

/**
 * Status que escondem o paciente. O sync de hoje só grava ACTIVE (a listagem
 * da Clinicorp já filtra), então o filtro não pega nada novo — fica como defesa
 * para linhas antigas e para o caso de a Clinicorp mudar o comportamento.
 */
const SITUACOES_EXCLUIDAS = new Set(['INACTIVE', 'DELETED'])

export function provedorClinicorp(clinica: Clinica): ProvedorDeProntuario {
  return {
    async listarDoMes(mes: number): Promise<Aniversariante[]> {
      const { data, error } = await db()
        .from('aniversariantes_pacientes_cache')
        .select('*')
        .eq('clinica_id', clinica.id)
        .eq('mes_aniversario', mes)

      if (error) throw new Error(`Erro ao ler o cache de pacientes: ${error.message}`)
      return normalizar((data ?? []) as PacienteCacheRow[])
    },

    async buscarPorIds(ids: string[]): Promise<Aniversariante[]> {
      if (ids.length === 0) return []
      const { data, error } = await db()
        .from('aniversariantes_pacientes_cache')
        .select('*')
        .eq('clinica_id', clinica.id)
        .in('paciente_id', ids)

      if (error) throw new Error(`Erro ao ler o cache de pacientes: ${error.message}`)
      return normalizar((data ?? []) as PacienteCacheRow[])
    },

    /**
     * Cache sem NENHUMA linha da clínica, em mês nenhum: a sincronização ainda
     * não rodou para ela (clínica recém-cadastrada, ou sync sempre falhando).
     *
     * Heurística, e o limite dela fica registrado: uma clínica sem nenhum
     * aniversariante nos dois meses sincronizados também cairia aqui. Numa
     * base real de consultório isso não acontece; se acontecer, a tela diz
     * "aguardando sincronização" em vez de "ninguém faz aniversário" — erra
     * para o lado que manda alguém olhar.
     */
    async aguardandoPrimeiraSincronizacao(): Promise<boolean> {
      const { count, error } = await db()
        .from('aniversariantes_pacientes_cache')
        .select('id', { count: 'exact', head: true })
        .eq('clinica_id', clinica.id)

      if (error) throw new Error(`Erro ao ler o cache de pacientes: ${error.message}`)
      return (count ?? 0) === 0
    },
  }
}

/** Uma normalização só, para listar e buscar não divergirem. */
function normalizar(linhas: PacienteCacheRow[]): Aniversariante[] {
  const itens: Aniversariante[] = []

  for (const linha of linhas) {
    // `situacao` null = linha gravada pela versão antiga do sync quando a
    // consulta de status falhou. Não filtramos: esconder paciente por falha
    // nossa é pior que mostrar a mais. A próxima sincronização grava ACTIVE.
    if (linha.situacao && SITUACOES_EXCLUIDAS.has(linha.situacao)) continue

    const [ano, mesStr, diaStr] = (linha.datanascimento ?? '').split('-')

    itens.push({
      id: linha.paciente_id,
      nome: linha.nome,
      telefone: linha.telefone,
      aniversario: `${String(linha.mes_aniversario).padStart(2, '0')}/${String(linha.dia_aniversario).padStart(2, '0')}`,
      datanascimento: ano && mesStr && diaStr ? `${diaStr}/${mesStr}/${ano}` : '',
      situacao: linha.situacao ?? '',
    })
  }

  return itens
}
