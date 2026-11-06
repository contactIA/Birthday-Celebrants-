import type { Clinica } from '@/shared/clinica/repositorio'
import { mensageriaDe } from '@/providers/mensageria'
import { cancelarEnvio, type ResultadoDoCancelamento } from './cancelamento'
import { buscarEnvio, marcarComoCancelado } from './dados'

// O cancelamento com as dependências de verdade. Quem chama: a tela
// (`/api/agendamentos/{id}/cancelar`) e a API de integração.

export async function cancelarEnvioDaUnidade(clinica: Clinica, envioId: string): Promise<ResultadoDoCancelamento> {
  const mensageria = mensageriaDe(clinica)
  return cancelarEnvio(envioId, {
    buscarEnvio: (id) => buscarEnvio(clinica, id),
    cancelarNaPlataforma: (mensagemId) => mensageria.cancelar(mensagemId),
    marcarComoCancelado: (id) => marcarComoCancelado(clinica, id),
  })
}
