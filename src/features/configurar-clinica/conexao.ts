import type { Clinica } from '@/shared/clinica/repositorio'
import { digitosComPais, formatarTelefoneBR } from '@/shared/telefone/e164'

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
    const mensagem = err instanceof Error && err.message ? err.message : 'Falha inesperada — ver o log do servidor'
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

/**
 * O número remetente é um canal da conta?
 *
 * Compara por dígitos com país, então "(62) 3193-0175", "556231930175" e o
 * "+55|6231930175" que a plataforma devolve são o mesmo número. Sem esta
 * conferência, remetente errado só aparecia na hora de agendar, como "a
 * plataforma respondeu 500" — foi assim que ele foi descoberto.
 *
 * Remetente vazio é aceito: a plataforma usa o canal da conta. Mas com mais de
 * um canal a escolha deixa de ser óbvia, e a frase diz isso.
 */
export function conferirRemetente(
  remetente: string | null,
  canais: string[]
): { ok: true; mensagem: string } | { ok: false; mensagem: string } {
  const disponiveis = canais.map((c) => formatarTelefoneBR(c)).join(', ') || 'nenhum'

  if (!remetente?.trim()) {
    if (canais.length === 0) return { ok: false, mensagem: 'A conta não tem nenhum canal de WhatsApp ativo' }
    return {
      ok: true,
      mensagem:
        canais.length === 1
          ? `remetente: o canal da conta, ${disponiveis}`
          : `remetente não definido — a conta tem ${canais.length} canais (${disponiveis}); defina qual usar`,
    }
  }

  const alvo = digitosComPais(remetente)
  if (alvo && canais.includes(alvo)) return { ok: true, mensagem: `remetente ${formatarTelefoneBR(remetente)}` }

  return {
    ok: false,
    mensagem: `O número remetente ${remetente} não é um canal desta conta. Canais disponíveis: ${disponiveis}`,
  }
}
