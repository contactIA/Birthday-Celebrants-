'use client'

import { useEffect, useMemo, useState } from 'react'
import { Aviso, Botao, Carregando } from '@/ui/primitivos'
import { renderizar } from '@/shared/template/parametros'
import type { Aniversariante } from './Agenda'

// O painel do lado direito mostra O QUE SERÁ ENVIADO, com o nome do primeiro
// selecionado já preenchido. É o que separa "confio no que vai sair" de
// "aperto e torço".
//
// A prévia chama `renderizar` — a MESMA função que o servidor usa para montar
// os parâmetros do envio. No app anterior havia duas implementações do
// mapeamento, e elas divergiam no campo ausente: o envio preenchia vazio, a
// prévia mantinha o `{{n}}` literal. A prévia mentia sobre o envio.
//
// Painel fixo em vez de modal: ele reflete a seleção da lista em tempo real, e
// um modal esconderia justamente a lista que a pessoa está montando.

interface ModeloNaTela {
  modeloId: string
  nome: string
  conteudo: string
  config: {
    id: string
    parametros: Record<string, string>
    diaEnvio: string
    horarioEnvio: string
    ehPadrao: boolean
    ativo: boolean
  } | null
}

interface ResultadoDeEnvio {
  pacienteId: string
  nome: string | null
  ok: boolean
  erro?: string
  aviso?: string
}

const QUANDO: Record<string, string> = {
  aniversario: 'No dia do aniversário',
  '1_dia_antes': 'Um dia antes',
  '3_dias_antes': 'Três dias antes',
}

export function PainelDeEnvio({
  selecionados,
  semTelefone,
  aoAgendar,
  aoConcluir,
}: {
  selecionados: Aniversariante[]
  semTelefone: number
  aoAgendar: () => void
  aoConcluir: () => void
}) {
  const [modelos, setModelos] = useState<ModeloNaTela[]>([])
  const [escolhido, setEscolhido] = useState('')
  const [quandoManual, setQuandoManual] = useState('')
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [resultados, setResultados] = useState<ResultadoDeEnvio[] | null>(null)

  const emLote = selecionados.length > 1
  const primeiro = selecionados[0] ?? null
  const chaveDaSelecao = useMemo(
    () => selecionados.map((p) => p.id).sort().join(','),
    [selecionados]
  )

  useEffect(() => {
    let ativo = true
    fetch('/api/modelos')
      .then(async (r) => ({ ok: r.ok, corpo: await r.json() }))
      .then(({ ok, corpo }) => {
        if (!ativo) return
        if (!ok) throw new Error(corpo?.error ?? 'Não foi possível carregar os modelos')
        // Só modelos já configurados podem ser enviados: sem o mapeamento de
        // variáveis não há como preencher o texto.
        const configurados = (corpo.modelos as ModeloNaTela[]).filter((m) => m.config)
        setModelos(configurados)
        const padrao = configurados.find((m) => m.config?.ehPadrao) ?? configurados[0]
        if (padrao?.config) setEscolhido(padrao.config.id)
      })
      .catch((e: Error) => ativo && setErro(e.message))
      .finally(() => ativo && setCarregando(false))
    return () => {
      ativo = false
    }
  }, [])

  // Zera a data escolhida e o resultado anterior quando a SELEÇÃO muda de
  // fato — não a cada render, senão apaga o horário que a pessoa está digitando.
  //
  // Ajuste durante o render, e não `useEffect`: com o efeito, o painel chegaria
  // a renderizar uma vez mostrando o resultado do envio anterior ao lado da
  // seleção nova.
  const [selecaoAnterior, setSelecaoAnterior] = useState(chaveDaSelecao)
  if (chaveDaSelecao !== selecaoAnterior) {
    setSelecaoAnterior(chaveDaSelecao)
    setQuandoManual('')
    setResultados(null)
  }

  const modelo = modelos.find((m) => m.config?.id === escolhido)

  const previa = useMemo(() => {
    if (!modelo?.config) return ''
    if (!primeiro) return modelo.conteudo
    return renderizar(modelo.conteudo, modelo.config.parametros, {
      nome: primeiro.nome,
      datanascimento: primeiro.datanascimento,
      aniversario: primeiro.aniversario,
    })
  }, [modelo, primeiro])

  async function confirmar() {
    if (!modelo?.config || selecionados.length === 0) return
    setEnviando(true)
    setErro(null)
    try {
      const resposta = await fetch('/api/agendamentos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modeloConfigId: modelo.config.id,
          // Só IDS. Nome, telefone e nascimento vêm do prontuário, no servidor.
          pacienteIds: selecionados.map((p) => p.id),
          quandoManual:
            !emLote && quandoManual ? new Date(quandoManual).toISOString() : undefined,
        }),
      })
      const corpo = await resposta.json()
      if (corpo?.resultados) {
        setResultados(corpo.resultados as ResultadoDeEnvio[])
        aoAgendar()
      } else {
        throw new Error(corpo?.error ?? 'Não foi possível agendar')
      }
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <aside className="w-full shrink-0 rounded-[12px] border border-line bg-surface p-5 lg:w-[336px]">
      <h2 className="mb-3 text-xs font-semibold tracking-[0.08em] text-muted uppercase">
        O que será enviado
      </h2>

      {carregando && <Carregando>Carregando modelos…</Carregando>}

      {!carregando && erro && !resultados && (
        <Aviso tom="erro">{erro}</Aviso>
      )}

      {!carregando && modelos.length === 0 && !erro && (
        <p className="text-sm leading-relaxed text-muted">
          Nenhum modelo configurado ainda. Abra <strong className="font-medium text-ink-2">Modelos</strong> e
          ligue as variáveis de um modelo aprovado aos dados do paciente.
        </p>
      )}

      {!carregando && modelos.length > 0 && (
        <div className="flex flex-col gap-4">
          {modelos.length > 1 && (
            <select
              value={escolhido}
              onChange={(e) => setEscolhido(e.target.value)}
              aria-label="Modelo de mensagem"
              className="h-9 w-full rounded-lg border border-line bg-surface px-2.5 text-sm text-ink focus:outline-none"
            >
              {modelos.map((m) => (
                <option key={m.config!.id} value={m.config!.id}>
                  {m.nome}
                </option>
              ))}
            </select>
          )}

          {/* A prévia é o coração do painel: texto real, nome real. */}
          <div className="rounded-[10px] bg-accent-soft px-4 py-3.5">
            <p className="mb-1.5 flex items-center gap-2 text-xs font-medium text-accent-ink">
              {modelo?.nome}
              {modelo?.config?.ehPadrao && (
                <span className="rounded-full bg-accent px-1.5 py-0.5 text-[10px] text-white">
                  padrão
                </span>
              )}
            </p>
            <p className="text-sm leading-relaxed whitespace-pre-wrap text-ink">
              {previa || 'Este modelo não tem prévia de texto.'}
            </p>
            {!primeiro && (
              <p className="mt-2 text-xs text-accent-ink/70">
                Selecione alguém na lista para ver o texto preenchido.
              </p>
            )}
          </div>

          <dl className="flex flex-col gap-2 text-sm">
            <Linha rotulo="Quando">
              {quandoManual && !emLote
                ? 'Data escolhida'
                : QUANDO[modelo?.config?.diaEnvio ?? 'aniversario']}
            </Linha>
            <Linha rotulo="Horário">{modelo?.config?.horarioEnvio ?? 'Não definido'}</Linha>
            <Linha rotulo="Selecionados">
              <span className="tnum">{selecionados.length}</span>
            </Linha>
          </dl>

          {!emLote && primeiro && (
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted">Escolher outra data e hora (opcional)</span>
              <input
                type="datetime-local"
                value={quandoManual}
                onChange={(e) => setQuandoManual(e.target.value)}
                className="h-9 rounded-lg border border-line bg-surface px-2.5 text-sm text-ink focus:outline-none"
              />
            </label>
          )}

          {semTelefone > 0 && (
            <p className="text-xs leading-relaxed text-atencao">
              {semTelefone} {semTelefone === 1 ? 'paciente está' : 'pacientes estão'} sem telefone
              utilizável e não {semTelefone === 1 ? 'pode' : 'podem'} ser selecionado
              {semTelefone === 1 ? '' : 's'}. Corrija no prontuário.
            </p>
          )}

          <Botao onClick={confirmar} disabled={selecionados.length === 0 || !modelo || enviando}>
            {enviando
              ? 'Agendando…'
              : selecionados.length === 0
                ? 'Selecione na lista'
                : `Agendar ${selecionados.length} ${selecionados.length === 1 ? 'mensagem' : 'mensagens'}`}
          </Botao>

          {resultados && <Resultados resultados={resultados} aoFechar={() => {
            setResultados(null)
            aoConcluir()
          }} />}
        </div>
      )}
    </aside>
  )
}

function Linha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted">{rotulo}</dt>
      <dd className="truncate font-medium text-ink">{children}</dd>
    </div>
  )
}

function Resultados({
  resultados,
  aoFechar,
}: {
  resultados: ResultadoDeEnvio[]
  aoFechar: () => void
}) {
  const agendados = resultados.filter((r) => r.ok).length
  const falhas = resultados.filter((r) => !r.ok)
  const comAviso = resultados.filter((r) => r.ok && r.aviso)

  return (
    <div className="flex flex-col gap-2 border-t border-line pt-3">
      <p className="text-sm font-medium text-ink">
        <span className="tnum">{agendados}</span> de <span className="tnum">{resultados.length}</span>{' '}
        {resultados.length === 1 ? 'mensagem agendada' : 'mensagens agendadas'}
      </p>

      {falhas.length > 0 && (
        <ul className="rolagem-discreta flex max-h-44 flex-col gap-1.5 overflow-y-auto">
          {falhas.map((r) => (
            <li key={r.pacienteId} className="flex flex-col gap-0.5 rounded-lg bg-erro-soft px-2.5 py-1.5">
              <span className="text-xs font-medium text-ink">{r.nome ?? 'Paciente'}</span>
              {/* O motivo por extenso, não só "falhou": quase sempre há algo a
                  fazer (corrigir telefone, escolher outra data). */}
              <span className="text-xs leading-snug text-erro">{r.erro}</span>
            </li>
          ))}
        </ul>
      )}

      {comAviso.length > 0 && (
        <ul className="rolagem-discreta flex max-h-32 flex-col gap-1.5 overflow-y-auto">
          {comAviso.map((r) => (
            <li key={r.pacienteId} className="flex flex-col gap-0.5 rounded-lg bg-atencao-soft px-2.5 py-1.5">
              <span className="text-xs font-medium text-ink">{r.nome ?? 'Paciente'}</span>
              <span className="text-xs leading-snug text-atencao">{r.aviso}</span>
            </li>
          ))}
        </ul>
      )}

      <Botao variante="secundario" tamanho="sm" onClick={aoFechar}>
        Concluir
      </Botao>
    </div>
  )
}
