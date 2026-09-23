import type { Clinica } from '@/shared/clinica/repositorio'
import { parseDataYMD, parseAniversarioPronto } from '@/shared/data/parse'
import {
  ProntuarioIndisponivelError,
  ProntuarioMalConfiguradoError,
  TIMEOUT_MS,
  type Aniversariante,
  type ProvedorDeProntuario,
} from './porta'

// Adapter do e-Clínica: busca AO VIVO a cada chamada.
//
// LIMITAÇÕES REAIS DA API, descobertas testando direto — a doc pública diverge
// do comportamento:
//
//   · Os parâmetros de filtro por mês (`mes`/`mesdia`) fazem o backend deles
//     responder 500. Por isso buscamos a lista completa e filtramos aqui.
//     Isso significa baixar o cadastro INTEIRO da clínica a cada request; não
//     há paginação disponível.
//   · O shape da resposta é instável. A mesma chamada, sem nada de diferente,
//     já respondeu ora com `nome`/`aniversario`/`datanascimento`/`situacao`,
//     ora com `name`/`nascimento`/`clientesituacao_id`.
//   · Datas sentinela ("0000-00-00", "0001-01-01", "00/00") aparecem no lugar
//     de null — tratadas nos parsers de `shared/data/parse`.

/** Os dois shapes já observados, modelados como campos opcionais. */
interface ClienteEClinica {
  id: number | string
  nome?: string | null
  name?: string | null
  aniversario?: string | null
  datanascimento?: string | null
  nascimento?: string | null
  telefone?: string | null
  celular?: string | null
  situacao?: string | null
  clientesituacao_id?: string | null
}

/**
 * `situacao` NÃO é enum, ao contrário do que a doc dizia. Vêm valores livres do
 * CRM da clínica ("AGENDAMENTO", "NUTRIÇÃO", "CONSULTA"...). Só excluímos os
 * dois que claramente indicam cadastro que não deve mais receber mensagem.
 */
const SITUACOES_EXCLUIDAS = new Set(['INATIVO', 'ARQUIVO MORTO'])

const BASE_URL_PADRAO = 'https://eclinica.app/api/v2'

export function provedorEClinica(clinica: Clinica): ProvedorDeProntuario {
  const { token, baseUrl } = clinica.credenciais.eclinica
  if (!token) {
    throw new ProntuarioMalConfiguradoError('Clínica sem credencial de prontuário configurada')
  }

  async function buscarTodos(): Promise<ClienteEClinica[]> {
    let resposta: Response
    try {
      resposta = await fetch(`${baseUrl || BASE_URL_PADRAO}/aniversariantes`, {
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
        },
        cache: 'no-store',
        // O app anterior não tinha timeout. Como esta chamada baixa a base
        // inteira, um upstream pendurado segurava a function até o limite da
        // plataforma — sem erro útil no log.
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
    } catch (err) {
      const causa = (err as Error).name === 'TimeoutError' ? 'não respondeu a tempo' : 'não respondeu'
      throw new ProntuarioIndisponivelError(`O sistema de prontuário da clínica ${causa}`)
    }

    if (!resposta.ok) {
      // O corpo do erro pode conter dado de paciente — não sobe para a tela.
      console.error(`[eclinica] HTTP ${resposta.status}:`, await resposta.text().catch(() => ''))
      throw new ProntuarioIndisponivelError(
        `O sistema de prontuário da clínica respondeu ${resposta.status}`
      )
    }

    const dados = await resposta.json().catch(() => null)
    if (!Array.isArray(dados)) {
      throw new ProntuarioIndisponivelError('O sistema de prontuário devolveu um formato inesperado')
    }
    return dados as ClienteEClinica[]
  }

  /**
   * Normaliza um cliente, ou devolve `null` quando ele não serve.
   *
   * Uma implementação só, usada pelos dois métodos da porta: se o filtro de
   * situação ou o parse de data divergirem entre listar e buscar, um paciente
   * some da lista mas continua agendável — ou o contrário.
   */
  function normalizar(cliente: ClienteEClinica): Aniversariante | null {
    // Tenta a data completa nos dois nomes possíveis; cai para o "MM/DD"
    // pronto se for tudo que o cadastro tiver.
    const data =
      parseDataYMD(cliente.datanascimento) ??
      parseDataYMD(cliente.nascimento) ??
      parseAniversarioPronto(cliente.aniversario)
    if (!data) return null // sem data válida não dá para saber o aniversário

    const situacao = cliente.situacao ?? cliente.clientesituacao_id ?? ''
    if (SITUACOES_EXCLUIDAS.has(situacao.trim().toUpperCase())) return null

    return {
      id: String(cliente.id),
      nome: cliente.nome ?? cliente.name ?? '(sem nome)',
      // Celular tem precedência: é o que pode receber mensagem.
      telefone: cliente.celular || cliente.telefone || null,
      aniversario: data.aniversario,
      datanascimento: data.datanascimento ?? '',
      situacao,
    }
  }

  return {
    async listarDoMes(mes: number): Promise<Aniversariante[]> {
      const alvo = String(mes).padStart(2, '0')
      const saida: Aniversariante[] = []
      for (const cliente of await buscarTodos()) {
        const normalizado = normalizar(cliente)
        if (normalizado && normalizado.aniversario.split('/')[0] === alvo) {
          saida.push(normalizado)
        }
      }
      return saida
    },

    async buscarPorIds(ids: string[]): Promise<Aniversariante[]> {
      if (ids.length === 0) return []
      // Não há busca por id nesta API: a lista completa é o único caminho.
      // Por isso a porta recebe uma lista — um lote custa uma chamada, não N.
      const procurados = new Set(ids)
      const saida: Aniversariante[] = []
      for (const cliente of await buscarTodos()) {
        if (!procurados.has(String(cliente.id))) continue
        const normalizado = normalizar(cliente)
        if (normalizado) saida.push(normalizado)
      }
      return saida
    },
  }
}
