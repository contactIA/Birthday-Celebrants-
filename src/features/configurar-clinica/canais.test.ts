import { describe, expect, it } from 'vitest'
import type { CanalDaConta, EquipeDaConta } from '@/providers/mensageria'
import { canaisParaEscolher } from './canais'

const canal = (id: string, nome: string, ativo = true): CanalDaConta => ({ id, numero: '553821000921', nome, ativo })
const equipe = (id: string, nome: string, canais: EquipeDaConta['canais'], padrao = false): EquipeDaConta => ({
  id,
  nome,
  padrao,
  canais,
})

describe('canaisParaEscolher', () => {
  it('a padrão que atende o canal vem marcada e em primeiro', () => {
    const [c] = canaisParaEscolher(
      [canal('c1', 'Recepção')],
      [equipe('e1', 'Comercial', ['c1']), equipe('e2', 'Atendimento', 'todos', true)]
    )
    expect(c?.equipes.map((e) => e.id)).toEqual(['e2', 'e1'])
    expect(c?.equipeSugerida).toBe('e2')
  })

  it('a padrão que NÃO atende fica de fora, e a sugerida é a primeira que atende', () => {
    // O caso real: a padrão da conta não atendia o número da clínica.
    const [c] = canaisParaEscolher(
      [canal('c1', 'Recepção')],
      [equipe('e1', 'Padrão', ['outro'], true), equipe('e2', 'Recepção', ['c1']), equipe('e3', 'Agenda', ['c1'])]
    )
    expect(c?.equipes.map((e) => e.nome)).toEqual(['Agenda', 'Recepção'])
    expect(c?.equipeSugerida).toBe('e3')
  })

  it('canal que nenhuma equipe atende vem sem sugestão', () => {
    const [c] = canaisParaEscolher([canal('c1', 'Recepção')], [equipe('e1', 'Padrão', [], true)])
    expect(c?.equipes).toEqual([])
    expect(c?.equipeSugerida).toBeNull()
  })

  it('só canais ativos, por nome, com o número formatado', () => {
    const lista = canaisParaEscolher([canal('c2', 'Unidade Sul'), canal('c1', 'Matriz'), canal('c3', 'Velho', false)], [])
    expect(lista.map((c) => c.nome)).toEqual(['Matriz', 'Unidade Sul'])
    expect(lista[0]?.numeroFormatado).toBe('(38) 2100-0921')
  })
})
