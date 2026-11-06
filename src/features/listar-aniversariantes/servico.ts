import type { Clinica } from '@/shared/clinica/repositorio'
import { hojeNoTimezone, type DataLocal } from '@/shared/data/fuso'
import { provedorDe } from '@/providers/prontuario'
import { aguardandoPrimeiraSincronizacao, listarAniversariantes, type ItemDaLista } from './consulta'
import { buscarEnviosDoAno } from './dados'

// A lista da tela, com as dependências de verdade: os aniversariantes do mês no
// prontuário, cruzados com os parabéns já agendados. Quem chama: a tela
// (`GET /api/aniversariantes`) e a API de integração.

export interface AniversariantesDoMes {
  itens: ItemDaLista[]
  mes: number
  hoje: DataLocal
  /** A lista veio vazia porque o prontuário ainda não sincronizou esta clínica. */
  aguardandoSincronizacao: boolean
}

/** `mes` de 1 a 12; `null` vale o mês de hoje no fuso da clínica. */
export async function aniversariantesDoMes(clinica: Clinica, mes: number | null, agora: Date): Promise<AniversariantesDoMes> {
  const hoje = hojeNoTimezone(clinica.timezone, agora)
  const doMes = mes ?? hoje.mes

  const prontuario = provedorDe(clinica)
  const itens = await listarAniversariantes(
    { mes: doMes, timezone: clinica.timezone, agora },
    {
      listarDoProntuario: (m) => prontuario.listarDoMes(m),
      buscarEnvios: (ano) => buscarEnviosDoAno(clinica, ano),
    }
  )

  const aguardandoSincronizacao = await aguardandoPrimeiraSincronizacao(
    itens,
    prontuario.aguardandoPrimeiraSincronizacao?.bind(prontuario)
  )

  return { itens, mes: doMes, hoje, aguardandoSincronizacao }
}
