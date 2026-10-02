import type { CanalDaConta, EquipeDaConta } from '@/providers/mensageria'
import { formatarTelefoneBR } from '@/shared/telefone/e164'

// A escolha do canal na área de setup.
//
// Na plataforma, todo agendamento pertence a uma equipe, e a equipe só agenda
// pelos canais que atende. Digitar o número remetente à mão deixava a equipe de
// fora: valia a padrão da conta, e quando ela não atendia o número, TODO
// agendamento da clínica falhava. Escolher o canal numa lista já traz as
// equipes que o atendem, com uma marcada.

/** Uma equipe que atende o canal, para a escolha. */
export interface EquipeDoCanal {
  id: string
  nome: string
  padrao: boolean
}

/** Um canal de WhatsApp da conta, pronto para a gaveta de escolha. */
export interface CanalParaEscolher {
  id: string
  /** Dígitos com país: o valor salvo como número remetente. */
  numero: string
  numeroFormatado: string
  nome: string
  /** As equipes que agendam por este canal: a padrão primeiro, depois por nome. */
  equipes: EquipeDoCanal[]
  /**
   * A que a gaveta já deixa marcada: a padrão, se atende o canal; senão a
   * primeira que atende. `null` = nenhuma equipe atende — o canal não agenda.
   */
  equipeSugerida: string | null
}

/** A equipe agenda por este canal? */
export function atende(equipe: EquipeDaConta, canalId: string): boolean {
  return equipe.canais === 'todos' || equipe.canais.includes(canalId)
}

/** Os canais ATIVOS, cada um com as equipes que o atendem. Ordem: por nome. */
export function canaisParaEscolher(canais: CanalDaConta[], equipes: EquipeDaConta[]): CanalParaEscolher[] {
  return canais
    .filter((c) => c.ativo)
    .map((canal) => {
      const doCanal = equipes
        .filter((e) => atende(e, canal.id))
        .sort((a, b) => Number(b.padrao) - Number(a.padrao) || a.nome.localeCompare(b.nome, 'pt-BR'))
        .map(({ id, nome, padrao }) => ({ id, nome, padrao }))
      return {
        id: canal.id,
        numero: canal.numero,
        numeroFormatado: formatarTelefoneBR(canal.numero),
        nome: canal.nome,
        equipes: doCanal,
        equipeSugerida: doCanal[0]?.id ?? null,
      }
    })
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}
