'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import clsx from 'clsx'
import { Aviso, Estado, EsqueletoDeLinha, Vazio } from '@/ui/primitivos'
import { PainelDeEnvio } from './PainelDeEnvio'
import {
  MESES_TITULO,
  aniversarioParaExibicao,
  idadeQueFaz,
  listaEmPortugues,
  rotuloDoDia,
  type DataDaClinica,
} from './rotulos'

// A tela principal é uma LISTA DE TRABALHO, não um relatório: a pessoa abre
// para zerar uma fila ("quem ainda não tem mensagem este mês?"). Por isso o
// filtro padrão é "sem mensagem" e não "todos" — abrir em "todos" faz a pessoa
// filtrar toda vez antes de começar.

export interface Aniversariante {
  id: string
  nome: string
  telefone: string | null
  aniversario: string
  datanascimento: string
  situacao: string
  jaPassou: boolean
  envio: { status: string; scheduledFor: string | null } | null
}

type Filtro = 'pendentes' | 'agendados' | 'corrigir' | 'todos'

interface Resposta {
  itens: Aniversariante[]
  mes: number
  hoje: DataDaClinica
}

/** Telefone só é "a corrigir" quando o cadastro não tem número utilizável. */
function temTelefone(p: Aniversariante) {
  return p.telefone !== null && p.telefone.replace(/\D/g, '').length >= 10
}

function estaAgendado(p: Aniversariante) {
  return p.envio !== null && p.envio.status !== 'canceled'
}

function podeAgendar(p: Aniversariante) {
  return temTelefone(p) && !p.jaPassou
}

/** Referência estável: `?? []` cria array novo a cada render e invalida memos. */
const SEM_ITENS: Aniversariante[] = []

export function Agenda() {
  const [mes, setMes] = useState<number | null>(null)
  const [dados, setDados] = useState<Resposta | null>(null)
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('pendentes')
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  /** Incrementado pelo "Tentar de novo" para refazer a busca. */
  const [tentativa, setTentativa] = useState(0)

  const recarregar = useCallback(() => setTentativa((n) => n + 1), [])

  useEffect(() => {
    const abortar = new AbortController()

    async function buscar() {
      setCarregando(true)
      setErro(null)
      try {
        // Sem `mes` na primeira carga: o servidor responde com o mês corrente
        // no fuso da clínica, que o navegador não tem como saber sozinho.
        const resposta = await fetch(`/api/aniversariantes${mes === null ? '' : `?mes=${mes}`}`, {
          signal: abortar.signal,
        })
        const corpo = await resposta.json()
        if (!resposta.ok) throw new Error(corpo?.error ?? 'Não foi possível carregar a lista')
        setDados(corpo as Resposta)
        setMes((atual) => atual ?? (corpo as Resposta).mes)
      } catch (e) {
        // Troca rápida de mês aborta a busca anterior — não é erro para mostrar.
        if (!abortar.signal.aborted) setErro((e as Error).message)
      } finally {
        if (!abortar.signal.aborted) setCarregando(false)
      }
    }

    void buscar()
    return () => abortar.abort()
  }, [mes, tentativa])

  // Limpa a seleção quando a lista muda de contexto: manter marcados de outro
  // mês ou de outra busca agendaria pessoas que já não estão na tela.
  //
  // Ajuste DURANTE O RENDER, não em `useEffect`: é o padrão que o React
  // recomenda para estado que deriva de outro estado. O efeito renderizaria uma
  // vez com a seleção errada antes de corrigi-la.
  const contexto = `${mes}|${busca}`
  const [contextoAnterior, setContextoAnterior] = useState(contexto)
  if (contexto !== contextoAnterior) {
    setContextoAnterior(contexto)
    setSelecionados(new Set())
  }

  const itens = dados?.itens ?? SEM_ITENS
  const hoje = dados?.hoje

  const visiveisPorBusca = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    return termo ? itens.filter((p) => p.nome.toLowerCase().includes(termo)) : itens
  }, [itens, busca])

  const grupos = useMemo(() => {
    const pendentes = visiveisPorBusca.filter((p) => podeAgendar(p) && !estaAgendado(p))
    const agendados = visiveisPorBusca.filter(estaAgendado)
    const corrigir = visiveisPorBusca.filter((p) => !temTelefone(p))
    return { pendentes, agendados, corrigir, todos: visiveisPorBusca }
  }, [visiveisPorBusca])

  const visiveis = grupos[filtro]
  const selecionaveis = visiveis.filter((p) => podeAgendar(p) && !estaAgendado(p))
  const todosMarcados =
    selecionaveis.length > 0 && selecionaveis.every((p) => selecionados.has(p.id))

  const porDia = useMemo(() => {
    if (!hoje) return []
    const mapa = new Map<number, Aniversariante[]>()
    for (const p of visiveis) {
      const dia = Number(p.aniversario.split('/')[1])
      mapa.set(dia, [...(mapa.get(dia) ?? []), p])
    }
    return [...mapa.entries()]
      .sort(([a], [b]) => a - b)
      .map(([dia, pessoas]) => ({
        dia,
        rotulo: rotuloDoDia(Number(pessoas[0]!.aniversario.split('/')[0]), dia, hoje),
        pessoas,
      }))
  }, [visiveis, hoje])

  function alternar(id: string) {
    setSelecionados((anterior) => {
      const proximo = new Set(anterior)
      if (proximo.has(id)) proximo.delete(id)
      else proximo.add(id)
      return proximo
    })
  }

  const pacientesSelecionados = itens.filter((p) => selecionados.has(p.id))

  const resumo = listaEmPortugues(
    [
      grupos.pendentes.length > 0 && `${grupos.pendentes.length} sem mensagem`,
      grupos.agendados.length > 0 && `${grupos.agendados.length} agendado${grupos.agendados.length > 1 ? 's' : ''}`,
      grupos.corrigir.length > 0 && `${grupos.corrigir.length} sem telefone`,
    ].filter(Boolean) as string[]
  )

  const filtros: { chave: Filtro; rotulo: string; total: number }[] = [
    { chave: 'pendentes', rotulo: 'Sem mensagem', total: grupos.pendentes.length },
    { chave: 'agendados', rotulo: 'Agendados', total: grupos.agendados.length },
    { chave: 'corrigir', rotulo: 'Sem telefone', total: grupos.corrigir.length },
    { chave: 'todos', rotulo: 'Todos', total: grupos.todos.length },
  ]

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold tracking-[-0.01em] text-ink">
            {mes !== null ? MESES_TITULO[mes - 1] : 'Aniversariantes'}
          </h1>
          <p className="mt-0.5 text-sm text-muted">
            {carregando ? 'Buscando aniversariantes…' : resumo || 'Nenhum aniversariante neste mês'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome"
            aria-label="Buscar por nome"
            className="h-9 w-48 rounded-full border border-line bg-surface px-4 text-sm text-ink placeholder:text-muted focus:outline-none"
          />
          <select
            value={mes ?? ''}
            onChange={(e) => setMes(Number(e.target.value))}
            aria-label="Mês"
            className="h-9 rounded-full border border-line bg-surface px-3 text-sm text-ink focus:outline-none"
          >
            {MESES_TITULO.map((nome, i) => (
              <option key={nome} value={i + 1}>
                {nome}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {filtros.map(({ chave, rotulo, total }) => {
          const ativo = filtro === chave
          return (
            <button
              key={chave}
              onClick={() => setFiltro(chave)}
              aria-pressed={ativo}
              className={clsx(
                'flex items-center gap-2 rounded-full py-1.5 pr-2 pl-3.5 text-[13px] transition-colors',
                ativo
                  ? 'bg-accent font-medium text-white'
                  : 'border border-line bg-surface text-ink-2 hover:bg-sunk'
              )}
            >
              {rotulo}
              <span
                className={clsx(
                  'tnum flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-semibold',
                  ativo ? 'bg-white/20' : 'bg-sunk text-muted'
                )}
              >
                {total}
              </span>
            </button>
          )
        })}

        {selecionaveis.length > 0 && (
          <button
            onClick={() =>
              setSelecionados(todosMarcados ? new Set() : new Set(selecionaveis.map((p) => p.id)))
            }
            className="ml-auto text-[13px] font-medium text-accent-ink hover:underline"
          >
            {todosMarcados ? 'Limpar seleção' : `Selecionar ${selecionaveis.length}`}
          </button>
        )}
      </div>

      {erro ? (
        <Aviso tom="erro" titulo="Não foi possível carregar a lista" acao={{ rotulo: 'Tentar de novo', aoClicar: recarregar }}>
          {erro} Os agendamentos já confirmados não foram afetados.
        </Aviso>
      ) : (
        <div className="flex flex-col items-start gap-5 lg:flex-row">
          <div className="min-w-0 flex-1">
            {carregando && (
              <div className="overflow-hidden rounded-[12px] border border-line bg-surface">
                {Array.from({ length: 5 }, (_, i) => (
                  <EsqueletoDeLinha key={i} />
                ))}
              </div>
            )}

            {!carregando && porDia.length === 0 && (
              <Vazio titulo={filtro === 'todos' ? 'Nenhum aniversariante neste mês' : 'Nada nesta lista'}>
                {filtro === 'todos'
                  ? 'Nenhum paciente da base faz aniversário no mês selecionado.'
                  : 'Experimente outro filtro ou outro mês.'}
              </Vazio>
            )}

            {!carregando &&
              hoje &&
              porDia.map((grupo) => (
                <section key={grupo.dia} className="mb-6 last:mb-0">
                  <div className="mb-2 flex items-center gap-3">
                    <h2 className="text-sm font-semibold text-ink">{grupo.rotulo}</h2>
                    <span className="h-px flex-1 bg-line" />
                    <span className="tnum text-xs text-muted">
                      {grupo.pessoas.length} {grupo.pessoas.length === 1 ? 'pessoa' : 'pessoas'}
                    </span>
                  </div>

                  <ul className="overflow-hidden rounded-[12px] border border-line bg-surface">
                    {grupo.pessoas.map((p) => (
                      <Linha
                        key={p.id}
                        paciente={p}
                        hoje={hoje}
                        marcado={selecionados.has(p.id)}
                        aoAlternar={() => alternar(p.id)}
                      />
                    ))}
                  </ul>
                </section>
              ))}
          </div>

          <PainelDeEnvio
            selecionados={pacientesSelecionados}
            semTelefone={grupos.corrigir.length}
            aoAgendar={recarregar}
            aoConcluir={() => setSelecionados(new Set())}
          />
        </div>
      )}
    </div>
  )
}

function Linha({
  paciente,
  hoje,
  marcado,
  aoAlternar,
}: {
  paciente: Aniversariante
  hoje: DataDaClinica
  marcado: boolean
  aoAlternar: () => void
}) {
  const idade = idadeQueFaz(paciente.datanascimento, hoje)
  const agendado = estaAgendado(paciente)
  const selecionavel = podeAgendar(paciente) && !agendado

  return (
    <li className="flex items-center gap-4 border-b border-line-soft px-4 py-3 last:border-b-0">
      <input
        type="checkbox"
        checked={marcado}
        onChange={aoAlternar}
        disabled={!selecionavel}
        aria-label={`Selecionar ${paciente.nome}`}
        className="h-4 w-4 shrink-0 accent-[var(--color-accent)] disabled:opacity-30"
      />

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink">{paciente.nome}</p>
        <p className="tnum truncate text-xs text-muted">
          {idade !== null
            ? `faz ${idade} anos`
            : aniversarioParaExibicao(paciente.aniversario)}
        </p>
      </div>

      <span className="tnum hidden w-40 shrink-0 truncate text-sm text-ink-2 sm:block">
        {paciente.telefone ?? '—'}
      </span>

      <div className="w-36 shrink-0 text-right">
        {agendado ? (
          <Estado tom="ok">Agendado</Estado>
        ) : !temTelefone(paciente) ? (
          <Estado tom="atencao">Sem telefone</Estado>
        ) : paciente.jaPassou ? (
          <Estado tom="parado">Já passou</Estado>
        ) : (
          <Estado tom="neutro">Sem mensagem</Estado>
        )}
      </div>
    </li>
  )
}
