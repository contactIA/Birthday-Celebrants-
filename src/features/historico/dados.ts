import { db, type EnvioRow } from '@/shared/db'
import type { Clinica } from '@/shared/clinica/repositorio'
import { SITUACOES, type FiltrosDoHistorico } from './filtros'
import { linhaDoTempo, oQueFazer, type PassoDaLinhaDoTempo } from './ficha'

/** Página padrão e teto. O app anterior devolvia a tabela inteira, sem limite. */
export const POR_PAGINA_PADRAO = 50
export const POR_PAGINA_MAXIMO = 200

export interface ItemDoHistorico {
  id: string
  pacienteNome: string
  pacienteTelefone: string
  status: EnvioRow['status']
  agendadoPara: string | null
  criadoEm: string
  /** Nome do modelo usado. `null` se o modelo foi apagado depois. */
  modeloNome: string | null
  /** `false` quando não há id na plataforma: cancelar não é possível. */
  podeCancelar: boolean
  /** O número por onde a mensagem foi agendada. `null` nos envios gravados antes de 2026-10-10. */
  remetente: string | null
  /** Por que a plataforma diz que falhou. Só em falha; `null` nas falhas de antes de 2026-10-21. */
  motivoDaFalha: string | null
}

export interface PaginaDoHistorico {
  itens: ItemDoHistorico[]
  total: number
  pagina: number
  porPagina: number
  /**
   * O remetente atual da unidade: o número que a tela mostra nos envios gravados
   * sem o número (antes de 2026-10-10, quando tudo saía por ele).
   */
  remetente: string | null
}

const CANCELAVEIS = new Set<EnvioRow['status']>(['scheduled', 'processed'])

type Linha = Pick<
  EnvioRow,
  | 'id'
  | 'paciente_nome'
  | 'paciente_telefone'
  | 'status'
  | 'scheduled_for'
  | 'created_at'
  | 'scheduled_message_id'
  | 'remetente'
  | 'motivo_da_falha'
> & { aniversariantes_templates: { nome: string } | null }

export async function buscarHistorico(
  clinica: Clinica,
  pagina: number,
  porPagina: number,
  filtros: FiltrosDoHistorico
): Promise<PaginaDoHistorico> {
  const de = (pagina - 1) * porPagina
  const coluna = filtros.ordem === 'criacao' ? 'created_at' : 'scheduled_for'

  let consulta = db()
    .from('aniversariantes_envios')
    .select(
      'id, paciente_nome, paciente_telefone, status, scheduled_for, created_at, scheduled_message_id, remetente, motivo_da_falha, aniversariantes_templates(nome)',
      { count: 'exact' }
    )
    .eq('clinica_id', clinica.id)
    .eq('unidade_id', clinica.unidade.id)

  if (filtros.situacao) consulta = consulta.in('status', [...SITUACOES[filtros.situacao]])
  if (filtros.busca) {
    // `filtros.busca` já vem sem vírgula e parênteses (ver lerFiltros): é o que
    // impede a busca de virar outra condição dentro do `or`.
    const condicoes = [`paciente_nome.ilike.%${filtros.busca}%`]
    if (filtros.buscaDigitos) condicoes.push(`paciente_telefone.ilike.%${filtros.buscaDigitos}%`)
    consulta = consulta.or(condicoes.join(','))
  }

  const { data, error, count } = await consulta
    // `created_at` desempata quando `scheduled_for` é nulo ou igual, senão a
    // ordem fica indefinida entre páginas, e item repetido ou pulado na
    // paginação é difícil de diagnosticar depois.
    .order(coluna, { ascending: filtros.crescente, nullsFirst: false })
    .order('created_at', { ascending: filtros.crescente })
    .range(de, de + porPagina - 1)
    .returns<Linha[]>()

  if (error) throw new Error(`Erro ao buscar o histórico: ${error.message}`)

  return {
    itens: (data ?? []).map((linha) => ({
      id: linha.id,
      pacienteNome: linha.paciente_nome,
      pacienteTelefone: linha.paciente_telefone,
      status: linha.status,
      agendadoPara: linha.scheduled_for,
      criadoEm: linha.created_at,
      modeloNome: linha.aniversariantes_templates?.nome ?? null,
      podeCancelar: CANCELAVEIS.has(linha.status) && linha.scheduled_message_id !== null,
      remetente: linha.remetente,
      motivoDaFalha: linha.status === 'failed' ? linha.motivo_da_falha : null,
    })),
    total: count ?? 0,
    pagina,
    porPagina,
    remetente: clinica.credenciais.mensageria.from,
  }
}

// ── A ficha de um envio ─────────────────────────────────────────────────────

/** Um parabéns do mesmo paciente em outro ano. */
export interface OutroEnvioDoPaciente {
  id: string
  status: EnvioRow['status']
  ano: number
  agendadoPara: string | null
}

export interface FichaDoEnvio {
  id: string
  pacienteNome: string
  pacienteTelefone: string
  /** "AAAA-MM-DD", como veio do prontuário. */
  dataNascimento: string | null
  /** O ano deste aniversário. */
  ano: number
  status: EnvioRow['status']
  motivoDaFalha: string | null
  /** O passo que resolve a falha, quando a frase é conhecida. */
  oQueFazer: string | null
  agendadoPara: string | null
  criadoEm: string
  modeloNome: string | null
  /** O arquivo (imagem, vídeo, documento) que vai com o modelo, pelo nome. */
  arquivoNome: string | null
  /** O número por onde saiu; nos envios antigos, o remetente atual da unidade. */
  remetente: string | null
  /** A mensagem como saiu. `null` nos envios de antes de 2026-10-21. */
  texto: string | null
  podeCancelar: boolean
  linhaDoTempo: PassoDaLinhaDoTempo[]
  /** Os parabéns do mesmo paciente em outros anos, do mais recente ao mais antigo. */
  outros: OutroEnvioDoPaciente[]
}

type LinhaDaFicha = Pick<
  EnvioRow,
  | 'id'
  | 'paciente_id_eclinica'
  | 'paciente_nome'
  | 'paciente_telefone'
  | 'data_nascimento'
  | 'ano'
  | 'status'
  | 'motivo_da_falha'
  | 'scheduled_for'
  | 'created_at'
  | 'scheduled_message_id'
  | 'remetente'
  | 'texto'
  | 'enviado_em'
  | 'entregue_em'
  | 'lido_em'
  | 'falhou_em'
  | 'cancelado_em'
> & { aniversariantes_templates: { nome: string; arquivo_nome: string | null } | null }

/** A ficha do envio, ou `null` quando ele não é desta unidade (ou não existe). */
export async function buscarFicha(clinica: Clinica, envioId: string): Promise<FichaDoEnvio | null> {
  if (!/^[0-9a-f-]{36}$/i.test(envioId)) return null
  const { data: l, error } = await db()
    .from('aniversariantes_envios')
    .select(
      'id, paciente_id_eclinica, paciente_nome, paciente_telefone, data_nascimento, ano, status, motivo_da_falha, scheduled_for, created_at, scheduled_message_id, remetente, texto, enviado_em, entregue_em, lido_em, falhou_em, cancelado_em, aniversariantes_templates(nome, arquivo_nome)'
    )
    .eq('id', envioId)
    .eq('clinica_id', clinica.id)
    .eq('unidade_id', clinica.unidade.id)
    .maybeSingle<LinhaDaFicha>()

  if (error) throw new Error(`Erro ao buscar o envio: ${error.message}`)
  if (!l) return null

  // Os parabéns do mesmo paciente em outros anos: um por ano (chave única).
  const { data: outros, error: erroDosOutros } = await db()
    .from('aniversariantes_envios')
    .select('id, status, ano, scheduled_for')
    .eq('clinica_id', clinica.id)
    .eq('unidade_id', clinica.unidade.id)
    .eq('paciente_id_eclinica', l.paciente_id_eclinica)
    .neq('id', l.id)
    .order('ano', { ascending: false })
    .limit(5)
    .returns<Pick<EnvioRow, 'id' | 'status' | 'ano' | 'scheduled_for'>[]>()

  if (erroDosOutros) throw new Error(`Erro ao buscar os outros envios: ${erroDosOutros.message}`)

  return {
    id: l.id,
    pacienteNome: l.paciente_nome,
    pacienteTelefone: l.paciente_telefone,
    dataNascimento: l.data_nascimento,
    ano: l.ano,
    status: l.status,
    motivoDaFalha: l.motivo_da_falha,
    oQueFazer: l.status === 'failed' ? oQueFazer(l.motivo_da_falha) : null,
    agendadoPara: l.scheduled_for,
    criadoEm: l.created_at,
    modeloNome: l.aniversariantes_templates?.nome ?? null,
    arquivoNome: l.aniversariantes_templates?.arquivo_nome ?? null,
    remetente: l.remetente ?? clinica.credenciais.mensageria.from,
    texto: l.texto,
    podeCancelar: CANCELAVEIS.has(l.status) && l.scheduled_message_id !== null,
    linhaDoTempo: linhaDoTempo({
      status: l.status,
      criadoEm: l.created_at,
      agendadoPara: l.scheduled_for,
      enviadoEm: l.enviado_em,
      entregueEm: l.entregue_em,
      lidoEm: l.lido_em,
      falhouEm: l.falhou_em,
      canceladoEm: l.cancelado_em,
    }),
    outros: (outros ?? []).map((o) => ({ id: o.id, status: o.status, ano: o.ano, agendadoPara: o.scheduled_for })),
  }
}

/** O que o "Abrir conversa" precisa do envio. */
export async function buscarContatoDoEnvio(
  clinica: Clinica,
  envioId: string
): Promise<{ conversaId: string | null; telefone: string } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(envioId)) return null
  const { data, error } = await db()
    .from('aniversariantes_envios')
    .select('conversa_id, paciente_telefone')
    .eq('id', envioId)
    .eq('clinica_id', clinica.id)
    .eq('unidade_id', clinica.unidade.id)
    .maybeSingle<Pick<EnvioRow, 'conversa_id' | 'paciente_telefone'>>()
  if (error) throw new Error(`Erro ao buscar o envio: ${error.message}`)
  return data ? { conversaId: data.conversa_id, telefone: data.paciente_telefone } : null
}
