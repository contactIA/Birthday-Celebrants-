import {
  buscarClinica,
  buscarClinicaPublica,
  type Clinica,
  type ClinicaPublica,
} from '@/shared/clinica/repositorio'
import type { ConfiguracaoParaSalvar, ListagemParaTela } from '@/features/configurar-modelo/modelos'
import { arquivoSalvoDoModelo, modelosDaUnidade, salvarModeloDaUnidade } from '@/features/configurar-modelo/servico'
import { aniversariantesDoMes, type AniversariantesDoMes } from '@/features/listar-aniversariantes/servico'
import { buscarFicha, buscarHistorico, type FichaDoEnvio, type PaginaDoHistorico } from '@/features/historico/dados'
import type { FiltrosDoHistorico } from '@/features/historico/filtros'
import type { ResultadoDoCancelamento } from '@/features/cancelar-envio/cancelamento'
import { cancelarEnvioDaUnidade } from '@/features/cancelar-envio/servico'
import { buscarResumoDeUso } from '@/features/resumo-de-uso/dados'
import type { ResumoDeUso } from '@/features/resumo-de-uso/resumo'

// O que a API de integração pede ao app: os MESMOS serviços que a tela usa.
// Nenhuma regra mora aqui nem nas rotas; esta lista só existe para os testes
// trocarem o banco, o prontuário e a plataforma por dublês.
//
// Toda operação de dado recebe a `Clinica` já resolvida pelo caminho
// (`escopo.ts`): é ela que filtra cada consulta pela clínica e pela unidade.

export interface Servicos {
  /** A clínica com credenciais, no contexto de uma unidade. Unidade inválida cai na principal. */
  buscarClinica: (companyId: string, unidadeId: string | null) => Promise<Clinica>
  buscarClinicaPublica: (companyId: string) => Promise<ClinicaPublica>
  modelos: (clinica: Clinica) => Promise<ListagemParaTela>
  /** Salva a configuração do modelo. O arquivo é o já salvo pela tela: a API não sobe arquivo. */
  salvarModelo: (clinica: Clinica, config: Omit<ConfiguracaoParaSalvar, 'arquivo'>) => Promise<void>
  /** `mes` de 1 a 12; `null` vale o mês de hoje no fuso da clínica. */
  aniversariantes: (clinica: Clinica, mes: number | null, agora: Date) => Promise<AniversariantesDoMes>
  historico: (clinica: Clinica, pagina: number, porPagina: number, filtros: FiltrosDoHistorico) => Promise<PaginaDoHistorico>
  /** `null` quando o envio não é desta unidade (ou não existe). */
  ficha: (clinica: Clinica, envioId: string) => Promise<FichaDoEnvio | null>
  cancelarEnvio: (clinica: Clinica, envioId: string) => Promise<ResultadoDoCancelamento>
  /** O resumo de uso só desta clínica. */
  uso: (clinica: Clinica, agora: Date) => Promise<ResumoDeUso>
}

export const servicosDoApp: Servicos = {
  buscarClinica,
  buscarClinicaPublica: (companyId) => buscarClinicaPublica(companyId),
  modelos: modelosDaUnidade,
  salvarModelo: async (clinica, config) =>
    salvarModeloDaUnidade(clinica, { ...config, arquivo: await arquivoSalvoDoModelo(clinica, config.modeloId) }),
  aniversariantes: aniversariantesDoMes,
  historico: buscarHistorico,
  ficha: buscarFicha,
  cancelarEnvio: cancelarEnvioDaUnidade,
  uso: (clinica, agora) => buscarResumoDeUso(agora, process.env.URL_PUBLICA || null, clinica.id),
}
