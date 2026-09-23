import type { StatusEnvio } from '@/shared/db'
import type { MensagemNaPlataforma } from '@/providers/mensageria'

// Traz de volta o status real de cada mensagem já agendada.
//
// POR QUE EXISTE: até aqui o status local só saía de `scheduled` no
// cancelamento. `sent`, `delivered`, `read` e `failed` existiam na coluna, na
// tela e no enum — e eram inalcançáveis. O histórico mostrava "Agendada" para
// sempre, inclusive para mensagens que falharam. Quem opera não tinha como
// saber se o parabéns realmente saiu.
//
// EM LOTE, NÃO UMA POR UMA. A listagem da plataforma aceita filtro por data de
// agendamento, então reconciliar cem envios custa uma ou duas chamadas. Uma
// consulta por mensagem multiplicaria isso por cem, todo dia.

export interface EnvioPendente {
  id: string
  /** Id na plataforma. Sem ele não há o que reconciliar. */
  mensagemId: string
  /** ISO. Usado para montar a janela de consulta. */
  agendadoPara: string
  statusAtual: StatusEnvio
}

export interface RelatorioDeReconciliacao {
  companyId: string
  /** Envios que estavam aguardando resposta da plataforma. */
  pendentes: number
  /** Quantos mudaram de status de fato. */
  atualizados: number
  /**
   * Pendentes que a plataforma não devolveu na janela.
   *
   * Não é erro por si: pode ser mensagem apagada por lá. Mas um número alto e
   * persistente indica que a janela ou o casamento de ids está errado — e sem
   * contar, isso seria invisível.
   */
  naoEncontrados: number
  erro: string | null
}

export interface DependenciasDaReconciliacao {
  buscarPendentes: () => Promise<EnvioPendente[]>
  listarNaPlataforma: (janela: { de: string; ate: string }) => Promise<MensagemNaPlataforma[]>
  atualizarStatus: (envioId: string, status: StatusEnvio) => Promise<void>
}

/**
 * Margem no início da janela.
 *
 * A plataforma pode registrar o agendamento com deslocamento de fuso ou
 * arredondamento em relação ao que pedimos. Um dia de folga evita perder a
 * mensagem exatamente na borda do intervalo.
 */
const MARGEM_MS = 24 * 60 * 60 * 1000

export async function reconciliarStatus(
  companyId: string,
  agora: Date,
  deps: DependenciasDaReconciliacao
): Promise<RelatorioDeReconciliacao> {
  const vazio = { companyId, pendentes: 0, atualizados: 0, naoEncontrados: 0, erro: null }

  let pendentes: EnvioPendente[]
  try {
    pendentes = await deps.buscarPendentes()
  } catch (err) {
    return { ...vazio, erro: `buscar pendentes: ${(err as Error).message}` }
  }

  // Nenhum pendente, nenhuma chamada externa. A clínica que não agendou nada
  // este mês não deve custar requisição nenhuma.
  if (pendentes.length === 0) return vazio

  const maisAntigo = pendentes.reduce(
    (menor, envio) => Math.min(menor, new Date(envio.agendadoPara).getTime()),
    Number.POSITIVE_INFINITY
  )

  const janela = {
    de: new Date(maisAntigo - MARGEM_MS).toISOString(),
    ate: new Date(agora.getTime() + MARGEM_MS).toISOString(),
  }

  let naPlataforma: MensagemNaPlataforma[]
  try {
    naPlataforma = await deps.listarNaPlataforma(janela)
  } catch (err) {
    return { ...vazio, pendentes: pendentes.length, erro: `listar: ${(err as Error).message}` }
  }

  const statusPorId = new Map(naPlataforma.map((m) => [m.id, m.status]))

  let atualizados = 0
  let naoEncontrados = 0
  const falhas: string[] = []

  for (const envio of pendentes) {
    const status = statusPorId.get(envio.mensagemId)
    if (!status) {
      naoEncontrados++
      continue
    }
    // Só escreve o que mudou: um `update` por envio a cada execução diária
    // encheria o banco de escrita sem informação nova.
    if (status === envio.statusAtual) continue

    try {
      await deps.atualizarStatus(envio.id, status)
      atualizados++
    } catch (err) {
      falhas.push(`${envio.id}: ${(err as Error).message}`)
    }
  }

  return {
    companyId,
    pendentes: pendentes.length,
    atualizados,
    naoEncontrados,
    erro: falhas.length > 0 ? `atualizar: ${falhas.join('; ')}` : null,
  }
}
