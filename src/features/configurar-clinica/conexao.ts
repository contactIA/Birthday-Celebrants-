import type { Clinica } from '@/shared/clinica/repositorio'

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
