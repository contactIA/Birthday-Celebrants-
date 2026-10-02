import type { CanalDaConta, EquipeDaConta } from '@/providers/mensageria'
import type { Clinica } from '@/shared/clinica/repositorio'
import { digitosComPais, formatarTelefoneBR } from '@/shared/telefone/e164'
import { atende } from './canais'

// O teste de conexão da área de setup.
//
// Roda as MESMAS funções que a produção usa — listar aniversariantes e listar
// modelos — com as credenciais do formulário. Um "ping" separado provaria que a
// API responde, não que o painel vai funcionar; é a diferença entre "a Clinicorp
// está no ar" e "este token lista os aniversariantes desta clínica".

export interface ResultadoDoTeste {
  ok: boolean
  /** Frase para a tela: o que funcionou, ou por que não. */
  mensagem: string
}

export interface ResultadoDaConexao {
  prontuario: ResultadoDoTeste
  mensageria: ResultadoDoTeste
}

export interface DependenciasDoTeste {
  /** Devolve a frase de sucesso; lança quando a integração falha. */
  testarProntuario: (clinica: Clinica) => Promise<string>
  testarMensageria: (clinica: Clinica) => Promise<string>
}

async function testar(fn: () => Promise<string>, contexto: string): Promise<ResultadoDoTeste> {
  try {
    return { ok: true, mensagem: await fn() }
  } catch (err) {
    // As mensagens dos adapters são escritas para a tela e nunca carregam o
    // corpo da resposta (que pode ter dado de paciente) — ver clinicorp-api.ts.
    // O log fica com o objeto inteiro para o diagnóstico.
    console.error(`[setup/conexao] ${contexto}:`, err)
    const mensagem = err instanceof Error && err.message ? err.message : 'Falha inesperada. Veja o log do servidor'
    return { ok: false, mensagem }
  }
}

/** Os dois testes em paralelo, cada um falhando sozinho. */
export async function testarConexao(clinica: Clinica, deps: DependenciasDoTeste): Promise<ResultadoDaConexao> {
  const [prontuario, mensageria] = await Promise.all([
    testar(() => deps.testarProntuario(clinica), 'prontuário'),
    testar(() => deps.testarMensageria(clinica), 'mensageria'),
  ])
  return { prontuario, mensageria }
}

/** O que o teste de conexão confere do remetente: os canais e as equipes da conta. */
export interface ContaDeMensagens {
  canais: CanalDaConta[]
  equipes: EquipeDaConta[]
}

type Conferencia = { ok: boolean; mensagem: string }

/**
 * O número remetente é um canal da conta, e a equipe que agenda o atende?
 *
 * Compara por dígitos com país, então "(62) 3193-0175", "556231930175" e o
 * "+55|6231930175" que a plataforma devolve são o mesmo número. Sem esta
 * conferência, remetente errado só aparecia na hora de agendar, como "a
 * plataforma respondeu 500" — foi assim que ele foi descoberto.
 *
 * Remetente vazio é aceito: a plataforma usa o canal da conta. Mas com mais de
 * um canal a escolha deixa de ser óbvia, e a frase diz isso.
 *
 * A equipe é a segunda metade: um canal que a equipe não atende falha em todo
 * agendamento ("canal não associado a esse departamento"). Sem equipe
 * escolhida vale a padrão da conta — e foi uma padrão que não atendia o
 * remetente que derrubou os agendamentos de uma clínica inteira.
 */
export function conferirRemetente(remetente: string | null, equipeId: string | null, conta: ContaDeMensagens): Conferencia {
  const ativos = conta.canais.filter((c) => c.ativo)
  const disponiveis = ativos.map((c) => formatarTelefoneBR(c.numero)).join(', ') || 'nenhum'

  if (!remetente?.trim()) {
    const [unico, ...outros] = ativos
    if (!unico) return { ok: false, mensagem: 'A conta não tem nenhum canal de WhatsApp ativo' }
    if (outros.length > 0) {
      return {
        ok: true,
        mensagem: `remetente não definido: a conta tem ${ativos.length} canais (${disponiveis}); defina qual usar`,
      }
    }
    return conferirEquipe(unico, equipeId, conta.equipes, `remetente: o canal da conta, ${disponiveis}`)
  }

  const alvo = digitosComPais(remetente)
  const canal = ativos.find((c) => c.numero === alvo)
  if (!canal) {
    return {
      ok: false,
      mensagem: `O número remetente ${remetente} não é um canal desta conta. Canais disponíveis: ${disponiveis}`,
    }
  }
  return conferirEquipe(canal, equipeId, conta.equipes, `remetente ${formatarTelefoneBR(remetente)}`)
}

function conferirEquipe(canal: CanalDaConta, equipeId: string | null, equipes: EquipeDaConta[], frase: string): Conferencia {
  const numero = formatarTelefoneBR(canal.numero)

  if (equipeId) {
    const escolhida = equipes.find((e) => e.id === equipeId)
    if (!escolhida) {
      return {
        ok: false,
        mensagem: `A equipe escolhida para o remetente ${numero} não existe mais na conta. Escolha o canal de novo.`,
      }
    }
    if (!atende(escolhida, canal.id)) {
      return {
        ok: false,
        mensagem: `A equipe ${escolhida.nome} não atende o remetente ${numero}, e os agendamentos falham. Escolha o canal de novo.`,
      }
    }
    return { ok: true, mensagem: `${frase} · equipe ${escolhida.nome}` }
  }

  // Lista sem padrão: não há como saber qual a plataforma usa, e não se acusa.
  const padrao = equipes.find((e) => e.padrao)
  if (padrao && !atende(padrao, canal.id)) {
    return {
      ok: false,
      mensagem:
        `A equipe padrão da conta (${padrao.nome}) não atende o remetente ${numero}, e os agendamentos falham. ` +
        'Escolha o canal para definir a equipe.',
    }
  }
  return { ok: true, mensagem: padrao ? `${frase} · equipe padrão (${padrao.nome})` : frase }
}
