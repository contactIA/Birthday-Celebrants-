'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import clsx from 'clsx'
import { Aviso, Vazio } from '@/ui/primitivos'
import { PainelDeEnvio } from './PainelDeEnvio'
import { temMensagemValida } from '@/ui/statusDoEnvio'
import { EstadoComIcone, SituacaoDoEnvio } from '@/ui/SituacaoDoEnvio'
import { BotaoAtualizar, CampoDeBusca, Contato, ESTILO_CONTROLE, Marcador } from '@/ui/tabela'
import { formatarTelefoneBR, paraE164BR } from '@/shared/telefone/e164'
import {
  MESES_TITULO,
  aniversarioParaExibicao,
  idadeQueFaz,
  listaEmPortugues,
  rotuloDoDia,
  type DataDaClinica,
} from './rotulos'

// O desenho segue o Histórico, que por sua vez segue a tela de mensagens
// agendadas da plataforma: avatar com telefone embaixo, situação com ícone,
// colunas com cabeçalho. Os dias viram faixas dentro da mesma tabela.
//
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
  /** Aniversário depois de hoje. O de hoje não passou e também não é agendável. */
  agendavel: boolean
  envio: { status: string; scheduledFor: string | null } | null
}

type Filtro = 'pendentes' | 'agendados' | 'corrigir' | 'todos'

interface Resposta {
  itens: Aniversariante[]
  mes: number
  hoje: DataDaClinica
  /**
   * O prontuário ainda não tem dado nenhum desta clínica (Clinicorp antes da
   * primeira sincronização). Lista vazia aqui NÃO é "ninguém faz aniversário".
   */
  aguardandoSincronizacao?: boolean
}

/** Telefone só é "a corrigir" quando o cadastro não tem número utilizável. */
/**
 * Telefone utilizável pelo MESMO critério do agendamento (`paraE164BR`). Antes
 * a tela só contava dígitos, e um número que o servidor recusa ("000000000000",
 * DDD inexistente) aparecia selecionável e falhava na hora de agendar.
 */
function temTelefone(p: Aniversariante) {
  return paraE164BR(p.telefone) !== null
}

/**
 * Já tem parabéns resolvido este ano: agendado, a caminho ou entregue.
 * Cancelado e falho ficam de fora — a mensagem não vai sair, e a pessoa volta
 * para "Sem mensagem" para poder agendar de novo.
 */
function estaAgendado(p: Aniversariante) {
  return temMensagemValida(p.envio?.status)
}

/**
 * A regra vem do servidor (`agendavel`), não é recalculada aqui: a tela não
 * pode oferecer o que o agendamento vai recusar. Aniversário de HOJE fica de
 * fora — o parabéns precisa ser agendado com antecedência.
 */
function podeAgendar(p: Aniversariante) {
  return temTelefone(p) && p.agendavel
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

  /** Marca (ou desmarca, se já estão todos) quem é selecionável naquele dia. */
  function alternarDia(pessoas: Aniversariante[]) {
    const doDia = pessoas.filter((p) => podeAgendar(p) && !estaAgendado(p)).map((p) => p.id)
    setSelecionados((anterior) => {
      const proximo = new Set(anterior)
      const todos = doDia.every((id) => proximo.has(id))
      for (const id of doDia) {
        if (todos) proximo.delete(id)
        else proximo.add(id)
      }
      return proximo
    })
  }

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
      grupos.agendados.length > 0 && `${grupos.agendados.length} com mensagem`,
      grupos.corrigir.length > 0 && `${grupos.corrigir.length} sem telefone`,
    ].filter(Boolean) as string[]
  )

  const filtros: { chave: Filtro; rotulo: string; total: number }[] = [
    { chave: 'pendentes', rotulo: 'Sem mensagem', total: grupos.pendentes.length },
    { chave: 'agendados', rotulo: 'Com mensagem', total: grupos.agendados.length },
    { chave: 'corrigir', rotulo: 'Sem telefone', total: grupos.corrigir.length },
    { chave: 'todos', rotulo: 'Todos', total: grupos.todos.length },
  ]

  return (
    <div className={clsx('flex flex-col gap-5', pacientesSelecionados.length > 0 && 'pb-20 lg:pb-0')}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold tracking-[-0.01em] text-ink">
            {mes !== null ? MESES_TITULO[mes - 1] : 'Aniversariantes'}
          </h1>
          <p className="mt-0.5 text-sm text-muted">
            {carregando
              ? 'Buscando aniversariantes…'
              : dados?.aguardandoSincronizacao
                ? 'Aguardando a primeira sincronização com o prontuário'
                : resumo || 'Nenhum aniversariante neste mês'}
          </p>
        </div>

        <BotaoAtualizar aoClicar={recarregar} girando={carregando} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <CampoDeBusca
          valor={busca}
          aoMudar={setBusca}
          placeholder="Buscar por nome"
          className="min-w-[220px] flex-1 sm:max-w-xs"
        />
        <label>
          <span className="sr-only">Mês</span>
          <select
            value={mes ?? ''}
            onChange={(e) => setMes(Number(e.target.value))}
            className={clsx(ESTILO_CONTROLE, 'pr-8 pl-3.5')}
          >
            {MESES_TITULO.map((nome, i) => (
              <option key={nome} value={i + 1}>
                {nome}
              </option>
            ))}
          </select>
        </label>
        <span aria-hidden className="mx-1 hidden h-6 w-px bg-line sm:block" />
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

      </div>

      {erro ? (
        <Aviso tom="erro" titulo="Não foi possível carregar a lista" acao={{ rotulo: 'Tentar de novo', aoClicar: recarregar }}>
          {erro} Os agendamentos já confirmados não foram afetados.
        </Aviso>
      ) : (
        <div className="flex flex-col items-start gap-5 lg:flex-row">
          <div className="min-w-0 flex-1">
            {carregando && (
              <div
                aria-label="Carregando aniversariantes"
                className="flex flex-col gap-px overflow-hidden rounded-[12px] border border-line bg-line-soft"
              >
                {Array.from({ length: 5 }, (_, i) => (
                  <div key={i} className="flex items-center gap-3 bg-surface px-4 py-4">
                    <span className="h-9 w-9 animate-pulse rounded-full bg-sunk" />
                    <span className="h-3 w-48 animate-pulse rounded bg-sunk" />
                    <span className="ml-auto h-6 w-24 animate-pulse rounded-full bg-sunk" />
                  </div>
                ))}
              </div>
            )}

            {!carregando && dados?.aguardandoSincronizacao && (
              <Vazio titulo="Aguardando a primeira sincronização">
                Os aniversariantes desta clínica vêm do sistema de prontuário numa sincronização que roda
                todo dia de madrugada. Assim que ela acontecer, eles aparecem aqui.
              </Vazio>
            )}

            {!carregando && !dados?.aguardandoSincronizacao && porDia.length === 0 && (
              <Vazio titulo={filtro === 'todos' ? 'Nenhum aniversariante neste mês' : 'Nada nesta lista'}>
                {filtro === 'todos'
                  ? 'Nenhum paciente da base faz aniversário no mês selecionado.'
                  : 'Experimente outro filtro ou outro mês.'}
              </Vazio>
            )}

            {!carregando && hoje && porDia.length > 0 && (
              <div className="overflow-hidden rounded-[12px] border border-line bg-surface">
                <div className={clsx(GRADE, 'border-b border-line bg-sunk/50 py-3 text-[13px] font-medium text-ink-2')}>
                  <span>
                    <Marcador
                      marcado={todosMarcados}
                      aoMudar={() =>
                        setSelecionados(todosMarcados ? new Set() : new Set(selecionaveis.map((p) => p.id)))
                      }
                      desabilitado={selecionaveis.length === 0}
                      rotulo={`os ${selecionaveis.length} aniversariantes que podem receber mensagem`}
                    />
                  </span>
                  <span>Paciente</span>
                  <span>Aniversário</span>
                  <span>Situação</span>
                  <span className="hidden sm:block">Envio</span>
                </div>

                {porDia.map((grupo) => {
                  const selecionaveisDoDia = grupo.pessoas.filter((p) => podeAgendar(p) && !estaAgendado(p))
                  const diaTodoMarcado =
                    selecionaveisDoDia.length > 0 && selecionaveisDoDia.every((p) => selecionados.has(p.id))
                  return (
                    <section key={grupo.dia} aria-label={grupo.rotulo}>
                      <div className="flex items-center gap-3 border-b border-line-soft bg-ground/70 px-4 py-2">
                        <h2 className="text-[13px] font-semibold text-ink">{grupo.rotulo}</h2>
                        <span className="tnum text-xs text-muted">
                          {grupo.pessoas.length} {grupo.pessoas.length === 1 ? 'pessoa' : 'pessoas'}
                        </span>
                        {/* Só com 2+: num dia de uma pessoa o botão repete a caixa da linha. */}
                        {selecionaveisDoDia.length > 1 && (
                          <button
                            onClick={() => alternarDia(grupo.pessoas)}
                            aria-label={
                              diaTodoMarcado
                                ? `Desmarcar os aniversariantes de ${grupo.rotulo}`
                                : `Selecionar os ${selecionaveisDoDia.length} aniversariantes de ${grupo.rotulo}`
                            }
                            className="ml-auto rounded-full px-2.5 py-0.5 text-xs font-medium text-accent-ink hover:bg-accent-soft"
                          >
                            {diaTodoMarcado ? 'Desmarcar dia' : 'Selecionar todos'}
                          </button>
                        )}
                      </div>

                      <ul>
                        {grupo.pessoas.map((p) => (
                          <Linha
                            key={p.id}
                            paciente={p}
                            hoje={hoje}
                            marcado={selecionados.has(p.id)}
                            aoAlternar={() => alternar(p.id)}
                            // Dentro de "Sem mensagem", a etiqueta igual em toda
                            // linha é ruído: só o que foge da regra aparece.
                            ocultarSemMensagem={filtro === 'pendentes'}
                          />
                        ))}
                      </ul>
                    </section>
                  )
                })}
              </div>
            )}
          </div>

          {/* Em tela larga o painel acompanha a rolagem: numa lista de centenas de
              linhas ele sumia de vista junto com o topo da página. */}
          <div id="painel-de-envio" className="w-full scroll-mt-4 lg:sticky lg:top-0 lg:w-auto lg:self-start">
            <PainelDeEnvio
              selecionados={pacientesSelecionados}
              semTelefone={grupos.corrigir.length}
              aoAgendar={recarregar}
              aoConcluir={() => setSelecionados(new Set())}
            />
          </div>
        </div>
      )}

      {/* Tela estreita: o painel de envio fica DEPOIS da lista — com centenas de
          aniversariantes, o botão de agendar ficava a centenas de linhas de
          distância. A barra leva até ele. Em tela larga o painel já está ao
          lado, e a barra não aparece. */}
      {pacientesSelecionados.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur lg:hidden">
          <div className="flex items-center gap-3">
            <p className="tnum text-sm text-ink">
              <span className="font-semibold">{pacientesSelecionados.length}</span>{' '}
              {pacientesSelecionados.length === 1 ? 'selecionado' : 'selecionados'}
            </p>
            <button
              onClick={() => setSelecionados(new Set())}
              className="text-[13px] text-ink-2 hover:text-ink hover:underline"
            >
              Limpar
            </button>
            <button
              onClick={() =>
                document.getElementById('painel-de-envio')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }
              className="ml-auto inline-flex h-9 items-center rounded-full bg-accent px-4 text-sm font-medium text-white hover:bg-accent-ink"
            >
              Revisar e agendar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/** As colunas, iguais no cabeçalho e nas linhas. */
const GRADE =
  'grid grid-cols-[28px_minmax(0,1.7fr)_minmax(0,1fr)_minmax(0,1fr)] items-center gap-x-3 px-4 sm:grid-cols-[28px_minmax(0,1.7fr)_minmax(0,0.9fr)_minmax(0,1fr)_minmax(0,1fr)]'

function formatarEnvio(iso: string | null | undefined): string {
  if (!iso) return ''
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function Linha({
  paciente,
  hoje,
  marcado,
  aoAlternar,
  ocultarSemMensagem,
}: {
  paciente: Aniversariante
  hoje: DataDaClinica
  marcado: boolean
  aoAlternar: () => void
  ocultarSemMensagem: boolean
}) {
  const idade = idadeQueFaz(paciente.datanascimento, hoje)
  const agendado = estaAgendado(paciente)
  const selecionavel = podeAgendar(paciente) && !agendado

  // A linha inteira seleciona, não só o quadradinho. O clique no próprio
  // checkbox já é tratado por ele (senão alternaria duas vezes), e arrastar
  // para copiar o telefone não conta como clique.
  function aoClicarNaLinha(e: React.MouseEvent<HTMLLIElement>) {
    if (!selecionavel) return
    if ((e.target as HTMLElement).closest('input, a, button')) return
    if (window.getSelection()?.toString()) return
    aoAlternar()
  }

  return (
    <li
      onClick={aoClicarNaLinha}
      className={clsx(
        GRADE,
        'border-b border-line-soft py-3 text-sm last:border-b-0',
        selecionavel && 'cursor-pointer',
        marcado ? 'bg-accent-soft/60' : 'hover:bg-sunk/40'
      )}
    >
      <span>
        <Marcador marcado={marcado} aoMudar={aoAlternar} desabilitado={!selecionavel} rotulo={paciente.nome} />
      </span>

      <Contato
        nome={paciente.nome}
        detalhe={paciente.telefone ? formatarTelefoneBR(paciente.telefone) : 'Sem telefone'}
      />

      <div className="tnum min-w-0 text-[13px] leading-snug">
        <p className="text-ink-2">{aniversarioParaExibicao(paciente.aniversario)}</p>
        {idade !== null && <p className="text-muted">faz {idade} anos</p>}
      </div>

      <div className="min-w-0">
        {agendado ? (
          // O status real (Agendada, Enviada, Entregue, Lida), o mesmo do
          // Histórico, e não "Agendado" para qualquer um deles.
          <SituacaoDoEnvio status={paciente.envio!.status} />
        ) : paciente.envio?.status === 'failed' ? (
          // Falhou: selecionável de novo, e a etiqueta diz por que está aqui.
          <SituacaoDoEnvio status="failed" />
        ) : !temTelefone(paciente) ? (
          <EstadoComIcone tom="atencao" icone="alerta">
            Sem telefone
          </EstadoComIcone>
        ) : paciente.jaPassou ? (
          <EstadoComIcone tom="parado" icone="relogio">
            Já passou
          </EstadoComIcone>
        ) : !paciente.agendavel ? (
          <EstadoComIcone tom="parado" icone="relogio">
            É hoje
          </EstadoComIcone>
        ) : ocultarSemMensagem ? null : (
          <EstadoComIcone tom="neutro" icone="relogio">
            Sem mensagem
          </EstadoComIcone>
        )}
      </div>

      <p className="tnum hidden text-[13px] text-ink-2 sm:block">
        {agendado && paciente.envio?.scheduledFor ? (
          <>
            <span className="text-muted">Envio:</span> {formatarEnvio(paciente.envio.scheduledFor)}
          </>
        ) : null}
      </p>
    </li>
  )
}
