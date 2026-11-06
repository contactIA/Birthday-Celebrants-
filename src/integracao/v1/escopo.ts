import { ClinicaNaoProvisionadaError, UnidadeNaoEncontradaError, type Clinica } from '@/shared/clinica/repositorio'
import type { Servicos } from './servicos'

/**
 * A clínica do caminho, no contexto da unidade pedida (ou da principal).
 *
 * É o escopo de toda rota: o `companyId` vem do caminho, e todo serviço recebe
 * esta `Clinica`, que filtra cada consulta por ela e pela unidade.
 *
 * Na tela, a unidade é uma preferência em cookie, e a inválida cai na principal
 * em silêncio (`escolherUnidade`). Aqui, quem pede diz a unidade: a de outra
 * clínica, ou um id que não existe, é 404, e não a principal de outra conta de
 * dados.
 */
export async function clinicaDoEscopo(servicos: Servicos, companyId: string, unidade: string | undefined): Promise<Clinica> {
  const clinica = await servicos.buscarClinica(companyId, unidade ?? null)
  // Defesa a mais: a clínica resolvida tem de ser a do caminho.
  if (clinica.companyId.toLowerCase() !== companyId.toLowerCase()) throw new ClinicaNaoProvisionadaError(companyId)
  if (unidade && clinica.unidade.id.toLowerCase() !== unidade.toLowerCase()) throw new UnidadeNaoEncontradaError()
  return clinica
}
