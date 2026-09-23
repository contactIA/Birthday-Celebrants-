'use client'

import { useCallback, useEffect, useState } from 'react'
import { Aviso, Botao, Carregando, Estado, Vazio } from '@/ui/primitivos'
import { estadoDoEnvio } from '@/ui/statusDoEnvio'

// O histórico de envios, paginado.
//
// O app anterior devolvia a tabela inteira sem limite, e ela cresce um registro
// por paciente por ano, indefinidamente.

interface Item {
  id: string
  pacienteNome: string
  pacienteTelefone: string
  status: string
  agendadoPara: string | null
  criadoEm: string
  podeCancelar: boolean
}

interface Pagina {
  itens: Item[]
  total: number
  pagina: number
  porPagina: number
}

// Os rótulos de status vêm de `ui/statusDoEnvio.ts`, o mesmo mapa da Agenda.
// Todos são alcançáveis: a reconciliação traz o status real da plataforma a
// cada 15 minutos — é o atraso máximo do que esta tela mostra, o preço de não
// ter webhook.

function formatarData(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function Historico() {
  const [pagina, setPagina] = useState(1)
  const [dados, setDados] = useState<Pagina | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [tentativa, setTentativa] = useState(0)
  const [cancelando, setCancelando] = useState<string | null>(null)

  const recarregar = useCallback(() => setTentativa((n) => n + 1), [])

  useEffect(() => {
    const abortar = new AbortController()
    async function buscar() {
      setCarregando(true)
      setErro(null)
      try {
        const resposta = await fetch(`/api/historico?pagina=${pagina}`, {
          signal: abortar.signal,
        })
        const corpo = await resposta.json()
        if (!resposta.ok) throw new Error(corpo?.error ?? 'Não foi possível carregar o histórico')
        setDados(corpo as Pagina)
      } catch (e) {
        if (!abortar.signal.aborted) setErro((e as Error).message)
      } finally {
        if (!abortar.signal.aborted) setCarregando(false)
      }
    }
    void buscar()
    return () => abortar.abort()
  }, [pagina, tentativa])

  async function cancelar(id: string) {
    setCancelando(id)
    setErro(null)
    try {
      const resposta = await fetch(`/api/agendamentos/${id}/cancelar`, { method: 'POST' })
      const corpo = await resposta.json()
      if (!resposta.ok) throw new Error(corpo?.error ?? 'Não foi possível cancelar')
      recarregar()
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setCancelando(null)
    }
  }

  const totalDePaginas = dados ? Math.max(1, Math.ceil(dados.total / dados.porPagina)) : 1

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <div>
        <h1 className="text-lg font-semibold tracking-[-0.01em] text-ink">Histórico de envios</h1>
        <p className="mt-0.5 text-sm text-muted">
          {dados ? (
            <>
              <span className="tnum">{dados.total}</span>{' '}
              {dados.total === 1 ? 'mensagem registrada' : 'mensagens registradas'}
            </>
          ) : (
            'Todas as mensagens de aniversário desta clínica.'
          )}
        </p>
      </div>

      {erro && (
        <Aviso tom="erro" acao={{ rotulo: 'Tentar de novo', aoClicar: recarregar }}>
          {erro}
        </Aviso>
      )}

      {carregando && <Carregando>Carregando histórico…</Carregando>}

      {!carregando && dados && dados.itens.length === 0 && (
        <Vazio titulo="Nenhuma mensagem ainda">
          Quando você agendar o primeiro parabéns, ele aparece aqui.
        </Vazio>
      )}

      {!carregando && dados && dados.itens.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-[12px] border border-line bg-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line-soft text-left text-xs text-muted">
                  <th className="px-4 py-2.5 font-medium">Paciente</th>
                  <th className="px-4 py-2.5 font-medium">Telefone</th>
                  <th className="px-4 py-2.5 font-medium">Agendada para</th>
                  <th className="px-4 py-2.5 font-medium">Situação</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {dados.itens.map((item) => {
                  const status = estadoDoEnvio(item.status)
                  return (
                    <tr key={item.id} className="border-b border-line-soft last:border-b-0">
                      <td className="px-4 py-3 font-medium text-ink">{item.pacienteNome}</td>
                      <td className="tnum px-4 py-3 whitespace-nowrap text-ink-2">
                        {item.pacienteTelefone}
                      </td>
                      <td className="tnum px-4 py-3 whitespace-nowrap text-ink-2">
                        {formatarData(item.agendadoPara)}
                      </td>
                      <td className="px-4 py-3">
                        <Estado tom={status.tom}>{status.rotulo}</Estado>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {item.podeCancelar && (
                          <Botao
                            variante="secundario"
                            tamanho="sm"
                            onClick={() => cancelar(item.id)}
                            disabled={cancelando === item.id}
                          >
                            {cancelando === item.id ? 'Cancelando…' : 'Cancelar'}
                          </Botao>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {totalDePaginas > 1 && (
            <nav className="flex items-center justify-between gap-3" aria-label="Paginação">
              <Botao
                variante="secundario"
                tamanho="sm"
                onClick={() => setPagina((p) => Math.max(1, p - 1))}
                disabled={pagina <= 1}
              >
                Anterior
              </Botao>
              <span className="tnum text-sm text-muted">
                Página {pagina} de {totalDePaginas}
              </span>
              <Botao
                variante="secundario"
                tamanho="sm"
                onClick={() => setPagina((p) => Math.min(totalDePaginas, p + 1))}
                disabled={pagina >= totalDePaginas}
              >
                Próxima
              </Botao>
            </nav>
          )}
        </>
      )}
    </div>
  )
}
