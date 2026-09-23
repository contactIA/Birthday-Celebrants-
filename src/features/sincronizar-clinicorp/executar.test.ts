import { describe, expect, it } from 'vitest'
import type { Clinica } from '@/shared/clinica/repositorio'
import {
  estaSincronizando,
  executarSincronizacao,
  SincronizacaoEmAndamentoError,
  ultimaExecucao,
  type Rodar,
} from './executar'

function clinica(id: string): Clinica {
  return { id, companyId: `company-${id}` } as Clinica
}

const RELATORIO_OK = {
  companyId: 'x',
  diasConsultados: 61,
  pacientes: 12,
  erros: [],
  obsoletosRemovidos: true,
}

/** Um `rodar` que só termina quando o teste manda. */
function controlado() {
  let terminar!: () => void
  const rodar: Rodar = () => new Promise((resolve) => (terminar = () => resolve(RELATORIO_OK)))
  return { rodar, terminar: () => terminar() }
}

describe('executarSincronizacao', () => {
  it('recusa uma segunda execução da mesma clínica enquanto a primeira roda', async () => {
    // O botão do setup e o cron dividem a trava: rodar junto disputaria a cota
    // e a limpeza de uma apagaria o que a outra gravou.
    const { rodar, terminar } = controlado()
    const primeira = executarSincronizacao(clinica('a'), new Date(), 'c1', rodar)

    await expect(executarSincronizacao(clinica('a'), new Date(), 'c2', rodar)).rejects.toBeInstanceOf(
      SincronizacaoEmAndamentoError
    )
    expect(estaSincronizando('a')).toBe(true)

    terminar()
    await primeira
    expect(estaSincronizando('a')).toBe(false)
  })

  it('clínicas diferentes rodam ao mesmo tempo', async () => {
    const um = controlado()
    const dois = controlado()
    const a = executarSincronizacao(clinica('b'), new Date(), 'c', um.rodar)
    const b = executarSincronizacao(clinica('c'), new Date(), 'c', dois.rodar)
    um.terminar()
    dois.terminar()
    await expect(Promise.all([a, b])).resolves.toHaveLength(2)
  })

  it('registra a execução: em curso sem fim, depois com relatório', async () => {
    const { rodar, terminar } = controlado()
    const p = executarSincronizacao(clinica('d'), new Date(), 'c', rodar)
    expect(ultimaExecucao('d')).toMatchObject({ fim: null, relatorio: null })

    terminar()
    await p
    expect(ultimaExecucao('d')).toMatchObject({ fim: expect.any(String), relatorio: RELATORIO_OK })
  })

  it('falha de integração vira erro no relatório e libera a trava', async () => {
    const quebra: Rodar = async () => {
      throw new Error('Clínica sem credenciais de prontuário completas')
    }
    const r = await executarSincronizacao(clinica('e'), new Date(), 'c', quebra)
    expect(r).toMatchObject({ companyId: 'company-e', pacientes: 0, obsoletosRemovidos: false })
    expect(r.erros).toEqual(['Clínica sem credenciais de prontuário completas'])
    expect(estaSincronizando('e')).toBe(false)
  })
})
