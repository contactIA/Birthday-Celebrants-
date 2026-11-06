import type { Clinica } from '@/shared/clinica/repositorio'
import type { ArquivoDoModelo } from '@/shared/mensageria/midia'
import { mensageriaDe } from '@/providers/mensageria'
import { listarModelos, salvarConfiguracao, type ConfiguracaoParaSalvar, type ListagemParaTela } from './modelos'
import { buscarConfiguracoes, gravarConfiguracao, limparPadrao } from './dados'

// Os modelos da unidade, com as dependências de verdade: a plataforma de
// mensagens e o banco. Quem chama é a tela (`/api/modelos`) e a API de
// integração (`/api/integracao/v1`): as duas passam pela MESMA montagem, e a
// regra continua em `modelos.ts`.

export async function modelosDaUnidade(clinica: Clinica): Promise<ListagemParaTela> {
  const mensageria = mensageriaDe(clinica)
  return listarModelos({
    listarDaPlataforma: () => mensageria.listarModelos(),
    listarEquipes: () => mensageria.listarEquipes(),
    buscarConfiguracoes: () => buscarConfiguracoes(clinica),
    unidade: clinica.credenciais.mensageria,
  })
}

export async function salvarModeloDaUnidade(clinica: Clinica, config: ConfiguracaoParaSalvar): Promise<void> {
  const mensageria = mensageriaDe(clinica)
  await salvarConfiguracao(config, {
    listarDaPlataforma: () => mensageria.listarModelos(),
    listarEquipes: () => mensageria.listarEquipes(),
    unidade: clinica.credenciais.mensageria,
    limparPadrao: () => limparPadrao(clinica),
    gravar: (c) => gravarConfiguracao(clinica, c),
  })
}

/**
 * O arquivo já salvo para o modelo, ou `null`. Para quem salva sem subir
 * arquivo (a API de integração): o arquivo que a tela enviou continua valendo.
 */
export async function arquivoSalvoDoModelo(clinica: Clinica, modeloId: string): Promise<ArquivoDoModelo | null> {
  return (await buscarConfiguracoes(clinica)).get(modeloId)?.arquivo ?? null
}
