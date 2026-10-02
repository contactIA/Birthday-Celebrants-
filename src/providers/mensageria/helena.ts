import type { Clinica } from '@/shared/clinica/repositorio'
import {
  CanalForaDaEquipeError,
  MensageriaIndisponivelError,
  MensagemNaoEstaAgendadaError,
  RecursoNaoHabilitadoError,
  RemetenteNaoEncontradoError,
  TIMEOUT_MS,
  type AgendamentoCriado,
  type AgendamentoSolicitado,
  type CampoDeData,
  type CanalDaConta,
  type ContatoDoPaciente,
  type ContatoSalvo,
  type EquipeDaConta,
  type ListagemDeModelos,
  type MensagemNaPlataforma,
  type ModeloDeMensagem,
  type ProvedorDeMensageria,
} from './porta'
import type { StatusEnvio } from '@/shared/db'
import { digitosComPais, formatarTelefoneBR } from '@/shared/telefone/e164'

// Adapter da plataforma de mensagens atual.
//
// LIMITAÇÕES REAIS, descobertas em produção:
//
//  · O texto do modelo vem em `text`, não em `content`.
//  · O campo `type` do objeto retornado NÃO é a mesma coisa que o parâmetro de
//    query `Type`. O `type` da resposta descreve o CONTEÚDO (modelos comuns vêm
//    como "TEMPLATE" mesmo aprovados e usáveis em agendamento); o filtro `Type`
//    da query seleciona a categoria de uso. Não dá para validar um pelo outro.
//  · Respostas de sucesso nem sempre têm corpo. O cancelamento responde 200
//    vazio, e `res.json()` direto estourava "Unexpected end of JSON input" — um
//    cancelamento bem-sucedido virava 500 do nosso lado.
//  · Os erros vêm como {"key": "ENTITY_NOT_FOUND", "text": "<frase>"}, e a
//    MESMA chave cobre coisas bem diferentes — só o `text` as separa:
//      "App Mensagens agendadas não está habilitado" → recurso desligado na conta;
//      "Esse canal não esta associado a esse departamento." → a equipe que agenda
//        não atende o remetente (500). Sem equipe no pedido, vale a padrão.
//    Ler só a chave fez um canal fora da equipe aparecer como "recurso
//    desativado" — e a equipe foi procurar o problema no lugar errado.
//  · Cancelar mensagem que já não está agendada devolve ENTITY_ERROR_SAVE.
//  · Remetente (`from`) que não é canal da conta devolve **500** com
//    "Canal de comunicação não encontrado (<número>)" — não 4xx. Os canais
//    estão em `/chat/v1/channel`, com o número em `number` no formato
//    "+55|6231930175".
//  · Contato inexistente na busca por telefone devolve **500** com "Contato não
//    encontrado", não 404. O telefone no caminho é aceito em qualquer formato
//    (com ou sem +55, até sem o nono dígito): a plataforma normaliza.
//  · Campo personalizado de data volta como LISTA: {"data-de-nascimento":
//    ["2006/03/01"]}.
//  · Equipes ("department") ficam em `/core/v2/department`, mas os canais de
//    cada uma só vêm certos em `/core/v1/department/{id}/channel`, que diz o
//    escopo: ALL (todos os canais da conta), NONE ou SELECTED (os listados).
//
// O nome do fornecedor não aparece em nenhuma string que possa chegar à tela.

const BASE_URL = 'https://api.wts.chat'

/** Máximo aceito pela listagem. */
const TAMANHO_DA_PAGINA = 100

/**
 * Freio de segurança na paginação. Uma clínica gera ~1 mensagem por paciente
 * por ano; 20 páginas são 2000 mensagens, muito além do real. Existe para o
 * caso de a API ignorar `PageNumber` e devolver a primeira página para sempre.
 */
const MAXIMO_DE_PAGINAS = 20

interface ModeloBruto {
  id: string
  name: string
  text: string | null
}

/**
 * Os status da plataforma são os MESMOS da nossa coluna — a coluna foi modelada
 * a partir do enum deles. Só a caixa difere.
 *
 * Status desconhecido devolve `null` e o envio é ignorado na reconciliação: um
 * valor novo no enum deles não pode virar escrita errada no nosso banco, onde a
 * check constraint rejeitaria e derrubaria o lote.
 */
const STATUS_CONHECIDOS: ReadonlySet<string> = new Set<StatusEnvio>([
  'scheduled',
  'processed',
  'sent',
  'delivered',
  'read',
  'canceled',
  'failed',
])

/** Contato não existe na plataforma. Interno: é o caminho normal de "criar". */
class ContatoNaoEncontradoError extends Error {}

interface ContatoBruto {
  name?: string | null
  customFields?: Record<string, unknown> | null
}

/**
 * Nome que não é nome: vazio ou feito só de caracteres de telefone. É o que a
 * plataforma mostra quando o número não tem contato, e o que viraria o nome
 * na mensagem.
 */
export function nomeAusente(nome: unknown): boolean {
  if (typeof nome !== 'string') return true
  const t = nome.trim()
  return t === '' || /^[+\d\s().|-]+$/.test(t)
}

/** "DD/MM/AAAA" do prontuário para o valor de um campo de data. `null` se não der. */
export function paraCampoDeData(ddmmaaaa: string | null): string | null {
  const m = ddmmaaaa?.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!m || Number(m[3]) < 1900) return null
  return `${m[3]}-${m[2]}-${m[1]}`
}

function campoVazio(valor: unknown): boolean {
  if (valor === null || valor === undefined) return true
  if (typeof valor === 'string') return valor.trim() === ''
  if (Array.isArray(valor)) return valor.every(campoVazio)
  return false
}

/**
 * O que completar num contato que já existe, ou `null` se nada. Só campos
 * vazios: um nome que a equipe deu na plataforma (ex.: "Marina ortodontia")
 * fica como está.
 */
export function oQueCompletar(
  existente: ContatoBruto,
  nome: string,
  campoNascimento: string | null,
  nascimento: string | null
): { fields: ('Name' | 'CustomFields')[]; name?: string; customFields?: Record<string, unknown> } | null {
  const fields: ('Name' | 'CustomFields')[] = []
  const corpo: { name?: string; customFields?: Record<string, unknown> } = {}

  if (nomeAusente(existente.name) && nome.trim()) {
    fields.push('Name')
    corpo.name = nome.trim()
  }
  if (campoNascimento && nascimento && campoVazio(existente.customFields?.[campoNascimento])) {
    fields.push('CustomFields')
    corpo.customFields = { [campoNascimento]: nascimento }
  }
  return fields.length ? { fields, ...corpo } : null
}

function normalizarStatus(bruto: unknown): StatusEnvio | null {
  if (typeof bruto !== 'string') return null
  const minusculo = bruto.trim().toLowerCase()
  return STATUS_CONHECIDOS.has(minusculo) ? (minusculo as StatusEnvio) : null
}

/** O que fazer com uma resposta de erro, decidido pelo corpo. */
export type ErroDaPlataforma =
  | 'contato-nao-encontrado'
  | 'remetente-nao-encontrado'
  | 'canal-fora-da-equipe'
  | 'recurso-nao-habilitado'
  | 'mensagem-nao-esta-agendada'
  | 'nao-encontrado'
  | 'outro'

function semAcento(texto: string): string {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

/**
 * Classifica o erro pelo `text` da resposta (sem acento, sem caixa: a própria
 * plataforma escreve "não esta") e, só no fim, pela chave. Corpo que não é JSON
 * casa pelo texto cru.
 */
export function classificarErro(corpo: string): ErroDaPlataforma {
  let texto = corpo
  try {
    const json = JSON.parse(corpo) as { text?: unknown } | null
    if (typeof json?.text === 'string') texto = json.text
  } catch {
    // Não é JSON: segue com o corpo.
  }
  const t = semAcento(texto)

  if (t.includes('contato nao encontrado')) return 'contato-nao-encontrado'
  if (t.includes('canal de comunicacao nao encontrado')) return 'remetente-nao-encontrado'
  if (/nao esta associado a (esse|este) departamento/.test(t)) return 'canal-fora-da-equipe'
  if (t.includes('mensagens agendadas') && t.includes('habilitad')) return 'recurso-nao-habilitado'
  if (corpo.includes('ENTITY_ERROR_SAVE') || t.includes('so e possivel cancelar mensagens que estao agendadas')) {
    return 'mensagem-nao-esta-agendada'
  }
  if (corpo.includes('ENTITY_NOT_FOUND')) return 'nao-encontrado'
  return 'outro'
}

interface CanalBruto {
  id?: unknown
  active?: unknown
  number?: unknown
  name?: unknown
  identity?: { displayName?: unknown } | null
}

/**
 * Os canais de WhatsApp da listagem. Canal sem número (Instagram, Messenger,
 * WebChat) não serve de remetente e fica de fora.
 */
export function paraCanais(lista: CanalBruto[]): CanalDaConta[] {
  return lista.flatMap((canal) => {
    const numero = digitosComPais(typeof canal?.number === 'string' ? canal.number : null)
    if (!numero || typeof canal?.id !== 'string') return []
    const nome = [canal.identity?.displayName, canal.name].find(
      (n): n is string => typeof n === 'string' && n.trim() !== ''
    )
    return [{ id: canal.id, numero, nome: nome?.trim() ?? formatarTelefoneBR(numero), ativo: canal.active !== false }]
  })
}

/** O escopo de canais de uma equipe, como `/department/{id}/channel` devolve. */
export function canaisDaEquipe(bruto: unknown): 'todos' | string[] {
  const { scope, channels } = (bruto ?? {}) as { scope?: unknown; channels?: unknown }
  const escopo = typeof scope === 'string' ? scope.toUpperCase() : ''
  if (escopo === 'ALL') return 'todos'
  if (escopo === 'NONE' || !Array.isArray(channels)) return []
  return channels.flatMap((c: unknown) => {
    if (typeof c === 'string') return [c]
    const id = (c as { id?: unknown } | null)?.id
    return typeof id === 'string' ? [id] : []
  })
}

/** A listagem já veio em três formatos diferentes; aceita os três. */
function extrairLista(dados: unknown): { id?: unknown; status?: unknown }[] {
  if (!dados) return []
  if (Array.isArray(dados)) return dados
  const objeto = dados as { items?: unknown; results?: unknown; data?: unknown }
  const lista = objeto.items ?? objeto.results ?? objeto.data
  return Array.isArray(lista) ? lista : []
}

/** O que o adapter precisa da clínica: só as credenciais da conta de mensagens. */
export type CredenciaisDeMensageria = Clinica['credenciais']['mensageria']

export function provedorHelena(credenciais: CredenciaisDeMensageria): ProvedorDeMensageria {
  const { token, from, equipeId, campoNascimento } = credenciais

  function cabecalhos() {
    return {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    }
  }

  /**
   * Executa e devolve o corpo já interpretado, ou `null` quando vem vazio.
   *
   * O corpo do erro não sobe para a tela: pode conter dado de paciente ou
   * detalhe de conta. Vai para o log, e quem lê recebe frase neutra.
   */
  async function chamar(
    caminho: string,
    init: RequestInit,
    rotulo: string
  ): Promise<unknown | null> {
    let resposta: Response
    try {
      resposta = await fetch(`${BASE_URL}${caminho}`, {
        ...init,
        headers: cabecalhos(),
        cache: 'no-store',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
    } catch (err) {
      const causa = (err as Error).name === 'TimeoutError' ? 'não respondeu a tempo' : 'não respondeu'
      throw new MensageriaIndisponivelError(`A plataforma de mensagens ${causa}`)
    }

    const corpo = await resposta.text().catch(() => '')

    if (!resposta.ok) {
      const erro = classificarErro(corpo)
      // Antes do log: contato inexistente é o caminho normal de "criar", não erro.
      if (erro === 'contato-nao-encontrado') throw new ContatoNaoEncontradoError()
      console.error(`[mensageria/${rotulo}] HTTP ${resposta.status}: ${corpo}`)
      switch (erro) {
        case 'remetente-nao-encontrado':
          throw new RemetenteNaoEncontradoError()
        case 'canal-fora-da-equipe':
          throw new CanalForaDaEquipeError()
        case 'recurso-nao-habilitado':
          throw new RecursoNaoHabilitadoError()
        case 'mensagem-nao-esta-agendada':
          throw new MensagemNaoEstaAgendadaError()
        case 'nao-encontrado':
          throw new MensageriaIndisponivelError(
            'A plataforma de mensagens não encontrou um item que o pedido usa (modelo, canal ou equipe). ' +
              'Peça a quem administra a conta para conferir o cadastro da clínica.'
          )
        default:
          throw new MensageriaIndisponivelError(`A plataforma de mensagens respondeu ${resposta.status}`)
      }
    }

    if (!corpo.trim()) return null
    try {
      return JSON.parse(corpo)
    } catch {
      return null
    }
  }

  async function buscarModelos(params: URLSearchParams): Promise<ModeloDeMensagem[]> {
    const dados = await chamar(`/chat/v1/template?${params}`, { method: 'GET' }, 'listar-modelos')

    // O `unwrap` devolve null em corpo vazio — e o app anterior fazia
    // `dados.items` direto aqui, o que estourava TypeError. A correção do
    // corpo vazio existia; este ponto não tinha sido ajustado.
    if (!dados) return []

    const lista = Array.isArray(dados)
      ? dados
      : ((dados as { items?: unknown; results?: unknown }).items ??
        (dados as { results?: unknown }).results)

    if (!Array.isArray(lista)) return []

    return (lista as ModeloBruto[]).map((m) => ({
      id: m.id,
      nome: m.name,
      // `text`, não `content`.
      conteudo: m.text ?? '',
    }))
  }

  return {
    async listarModelos(): Promise<ListagemDeModelos> {
      const filtrado = await buscarModelos(
        new URLSearchParams({ ApprovedOnly: 'true', Type: 'SCHEDULEDMESSAGE', PageSize: '100' })
      )
      if (filtrado.length > 0) return { modelos: filtrado, filtradoPorTipo: true }

      // Conta em que o filtro por tipo não devolve nada: cai para "só
      // aprovados" — mesmo comportamento de antes do filtro existir — e avisa,
      // para a tela não afirmar o que não pode garantir.
      const fallback = await buscarModelos(
        new URLSearchParams({ ApprovedOnly: 'true', PageSize: '100' })
      )
      return { modelos: fallback, filtradoPorTipo: false }
    },

    async agendar(pedido: AgendamentoSolicitado): Promise<AgendamentoCriado> {
      const criado = (await chamar(
        '/chat/v1/scheduled-message',
        {
          method: 'POST',
          body: JSON.stringify({
            to: pedido.para,
            from: from ?? null,
            // Sem equipe, a plataforma usa a padrão — que pode não atender o
            // remetente. A escolhida no setup é uma que atende.
            ...(equipeId ? { department: { id: equipeId } } : {}),
            type: 'TEMPLATE',
            templateId: pedido.modeloId,
            scheduling: pedido.quando,
            templateParams: pedido.parametros,
          }),
        },
        'agendar'
      )) as { id?: string; scheduledMessageId?: string } | null

      return { id: criado?.id ?? criado?.scheduledMessageId ?? null }
    },

    async cancelar(id: string): Promise<void> {
      await chamar(`/chat/v1/scheduled-message/${id}/cancel`, { method: 'POST' }, 'cancelar')
    },

    async listarAgendadas(janela: { de: string; ate: string }): Promise<MensagemNaPlataforma[]> {
      const encontradas: MensagemNaPlataforma[] = []

      // Paginado. O teto de páginas é um freio de segurança: sem ele, uma
      // resposta que sempre devolve página cheia (ou um `PageNumber` ignorado)
      // faria o cron girar até o limite de execução.
      for (let pagina = 1; pagina <= MAXIMO_DE_PAGINAS; pagina++) {
        const params = new URLSearchParams({
          'ScheduledAt.After': janela.de,
          'ScheduledAt.Before': janela.ate,
          PageSize: String(TAMANHO_DA_PAGINA),
          PageNumber: String(pagina),
        })

        const dados = await chamar(`/chat/v1/scheduled-message?${params}`, { method: 'GET' }, 'listar-agendadas')
        const lote = extrairLista(dados)
        if (lote.length === 0) break

        for (const bruta of lote) {
          const status = normalizarStatus(bruta?.status)
          if (bruta?.id && status) encontradas.push({ id: String(bruta.id), status })
        }

        if (lote.length < TAMANHO_DA_PAGINA) break
      }

      return encontradas
    },

    async salvarContato(contato: ContatoDoPaciente): Promise<ContatoSalvo> {
      const campo = campoNascimento
      const nascimento = campo ? paraCampoDeData(contato.dataNascimento) : null
      const caminho = `/core/v1/contact/phonenumber/${encodeURIComponent(contato.telefone)}`

      let existente: ContatoBruto | null
      try {
        existente = (await chamar(`${caminho}?IncludeDetails=CustomFields`, { method: 'GET' }, 'buscar-contato')) as ContatoBruto | null
      } catch (err) {
        if (!(err instanceof ContatoNaoEncontradoError)) throw err
        existente = null
      }

      if (!existente) {
        await chamar(
          '/core/v1/contact',
          {
            method: 'POST',
            body: JSON.stringify({
              name: contato.nome.trim(),
              phoneNumber: contato.telefone,
              ...(campo && nascimento ? { customFields: { [campo]: nascimento } } : {}),
            }),
          },
          'criar-contato'
        )
        return 'criado'
      }

      const completar = oQueCompletar(existente, contato.nome, campo, nascimento)
      if (!completar) return 'mantido'
      await chamar(caminho, { method: 'PUT', body: JSON.stringify(completar) }, 'completar-contato')
      return 'completado'
    },

    async listarCamposDeData(): Promise<CampoDeData[]> {
      const dados = await chamar('/core/v1/contact/custom-field', { method: 'GET' }, 'listar-campos')
      return (extrairLista(dados) as { key?: unknown; name?: unknown; type?: unknown; entityType?: unknown }[])
        .filter((c) => c?.type === 'DATE' && c?.entityType !== 'PANEL' && typeof c?.key === 'string')
        .map((c) => ({ chave: c.key as string, nome: typeof c.name === 'string' ? c.name.trim() : (c.key as string) }))
    },

    async listarCanais(): Promise<CanalDaConta[]> {
      const dados = await chamar('/chat/v1/channel?PageSize=100', { method: 'GET' }, 'listar-canais')
      return paraCanais(extrairLista(dados) as CanalBruto[])
    },

    async listarEquipes(): Promise<EquipeDaConta[]> {
      const dados = await chamar('/core/v2/department', { method: 'GET' }, 'listar-equipes')
      const equipes = (extrairLista(dados) as { id?: unknown; name?: unknown; isDefault?: unknown }[]).filter(
        (e): e is { id: string; name?: unknown; isDefault?: unknown } => typeof e?.id === 'string'
      )

      // Uma chamada por equipe: a listagem não diz o escopo ("todos os canais"),
      // e é ele que decide se a equipe atende um canal. Contas têm poucas equipes.
      return Promise.all(
        equipes.map(async (e) => ({
          id: e.id,
          nome: typeof e.name === 'string' && e.name.trim() ? e.name.trim() : 'Equipe sem nome',
          padrao: e.isDefault === true,
          canais: canaisDaEquipe(
            await chamar(`/core/v1/department/${encodeURIComponent(e.id)}/channel`, { method: 'GET' }, 'listar-canais-da-equipe')
          ),
        }))
      )
    },
  }
}
