'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import clsx from 'clsx'
import { Aviso, Botao, Carregando, Estado, Vazio } from '@/ui/primitivos'
import { CampoDeHorario } from '@/ui/campos-de-data'
import {
  CAMPOS_DISPONIVEIS,
  campoPeloNome,
  completarMapeamento,
  resolverParametros,
  trechosDoTexto,
  type Trecho,
  type Variavel,
} from '@/shared/template/parametros'
import { motivoDeNaoSair, type EnvioDoModelo } from '@/shared/mensageria/canal-do-modelo'
import {
  REGRAS_DA_MIDIA,
  aceitoPara,
  fraseSemArquivo,
  problemaNoArquivo,
  type ArquivoDoModelo,
  type TipoDeMidia,
} from '@/shared/mensageria/midia'
import {
  NumeroDeEnvio,
  SituacaoDoNumero,
  agruparPorNumero,
  rotuloDoNumero,
  type GrupoDeNumero,
} from '@/ui/NumeroDeEnvio'
import { pedacosDaPrevia } from './previa'

// A tela responde, nesta ordem: qual modelo o painel de envio já traz
// escolhido, quando ele sai e como o paciente vai ler. O padrão vem aberto no
// topo; os outros, recolhidos, com a situação de cada um numa linha.
//
// A prévia é uma conversa de WhatsApp montada com `trechosDoTexto` — a MESMA
// conta do envio — num paciente de exemplo, com os valores que o app preenche
// marcados. Ver o texto montado é o que torna o mapeamento verificável: "{{1}}"
// não diz nada, "Olá, Marina" diz tudo.
//
// As variáveis cujo nome já diz o campo (`[NOME]`, `[ANIVERSÁRIO]`) vêm
// ligadas, e assim saem no envio mesmo antes de a clínica salvar:
// `completarMapeamento` é a mesma conta aqui e no lote.

const EXEMPLO = {
  nome: 'Marina Duarte Alves',
  datanascimento: '14/03/1988',
  aniversario: '03/14',
}

/** O que cada campo vira no paciente de exemplo: "Primeiro nome · Marina". */
const VALORES_DO_EXEMPLO = resolverParametros(
  Object.fromEntries(CAMPOS_DISPONIVEIS.map((c) => [c.valor, c.valor])),
  EXEMPLO
)

const ROTULO_DO_CAMPO = new Map<string, string>(CAMPOS_DISPONIVEIS.map((c) => [c.valor, c.rotulo]))

const DIAS_DE_ENVIO = [
  { valor: 'aniversario', rotulo: 'no dia do aniversário', frase: 'no dia do aniversário', antes: 0 },
  { valor: '1_dia_antes', rotulo: 'um dia antes', frase: 'um dia antes do aniversário', antes: 1 },
  { valor: '3_dias_antes', rotulo: 'três dias antes', frase: 'três dias antes do aniversário', antes: 3 },
]

const SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']

/** "09:00" → "9h"; "14:30" → "14h30". */
function horaCurta(horario: string): string {
  const [hh, mm] = horario.split(':')
  return mm === '00' ? `${Number(hh)}h` : `${Number(hh)}h${mm}`
}

/** "um dia antes do aniversário, às 9h" */
function quandoSai(diaEnvio: string, horario: string): string {
  const dia = DIAS_DE_ENVIO.find((d) => d.valor === diaEnvio) ?? DIAS_DE_ENVIO[0]!
  return `${dia.frase}, às ${horaCurta(horario)}`
}

/** O dia em que a mensagem chega ao paciente de exemplo: "sexta, 13/03". */
function diaDaChegada(diaEnvio: string): string {
  const antes = DIAS_DE_ENVIO.find((d) => d.valor === diaEnvio)?.antes ?? 0
  const [mes, dia] = EXEMPLO.aniversario.split('/').map(Number)
  const chega = new Date(Date.UTC(2026, mes! - 1, dia! - antes))
  const dd = String(chega.getUTCDate()).padStart(2, '0')
  const mm = String(chega.getUTCMonth() + 1).padStart(2, '0')
  return `${SEMANA[chega.getUTCDay()]}, ${dd}/${mm}`
}

interface Modelo {
  modeloId: string
  nome: string
  conteudo: string
  variaveis: Variavel[]
  envio: EnvioDoModelo
  /** A mídia do cabeçalho. `null` = só texto. */
  midia: TipoDeMidia | null
  config: {
    id: string
    parametros: Record<string, string>
    diaEnvio: string
    horarioEnvio: string
    ehPadrao: boolean
    ativo: boolean
    arquivo: ArquivoDoModelo | null
  } | null
}

export function Modelos() {
  const [modelos, setModelos] = useState<Modelo[]>([])
  const [filtradoPorTipo, setFiltradoPorTipo] = useState(true)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [tentativa, setTentativa] = useState(0)

  const recarregar = useCallback(() => setTentativa((n) => n + 1), [])
  // "Tornar padrão" lá embaixo: quando a lista volta, a página sobe até ele.
  const rolarParaPadrao = useRef(false)
  const secaoPadrao = useRef<HTMLElement>(null)
  const aoSalvar = useCallback(
    (virouPadrao: boolean) => {
      if (virouPadrao) rolarParaPadrao.current = true
      recarregar()
    },
    [recarregar]
  )

  useEffect(() => {
    const abortar = new AbortController()
    async function buscar() {
      setCarregando(true)
      setErro(null)
      try {
        const resposta = await fetch('/api/modelos', { signal: abortar.signal })
        const corpo = await resposta.json()
        if (!resposta.ok) throw new Error(corpo?.error ?? 'Não foi possível carregar os modelos')
        setModelos(corpo.modelos as Modelo[])
        setFiltradoPorTipo(corpo.filtradoPorTipo !== false)
      } catch (e) {
        if (!abortar.signal.aborted) setErro((e as Error).message)
      } finally {
        if (!abortar.signal.aborted) setCarregando(false)
      }
    }
    void buscar()
    return () => abortar.abort()
  }, [tentativa])

  const padrao = modelos.find((m) => m.config?.ehPadrao) ?? null
  const outros = modelos.filter((m) => m !== padrao)
  const algumNoPainel = modelos.some((m) => m.config)

  const idDoPadrao = padrao?.modeloId
  useEffect(() => {
    if (!rolarParaPadrao.current || !idDoPadrao) return
    rolarParaPadrao.current = false
    const reduzido = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    secaoPadrao.current?.scrollIntoView({ block: 'start', behavior: reduzido ? 'auto' : 'smooth' })
  }, [idDoPadrao])

  return (
    <div className="flex flex-col gap-7">
      <div>
        <h1 className="text-lg font-semibold tracking-[-0.01em] text-ink">Modelos de mensagem</h1>
        <p className="mt-0.5 text-sm text-muted">
          O modelo padrão já vem escolhido no painel de envio. Veja como o paciente vai ler e quando a mensagem sai.
        </p>
      </div>

      {erro && (
        <Aviso tom="erro" acao={{ rotulo: 'Tentar de novo', aoClicar: recarregar }}>
          {erro}
        </Aviso>
      )}

      {!filtradoPorTipo && !carregando && !erro && modelos.length > 0 && (
        <Aviso titulo="Nem todo modelo aqui serve para agendamento">
          Não foi possível filtrar por tipo nesta conta, então a lista mostra todos os modelos
          aprovados. Confira na plataforma de mensagens se o modelo escolhido aceita envio agendado.
        </Aviso>
      )}

      {/* Só na primeira carga: depois de salvar, a lista fica na tela enquanto atualiza. */}
      {carregando && modelos.length === 0 && <Carregando>Carregando modelos…</Carregando>}

      {!carregando && !erro && modelos.length === 0 && (
        <Vazio titulo="Nenhum modelo aprovado nesta conta">
          Crie e aprove um modelo de mensagem na plataforma, depois volte aqui para configurá-lo.
        </Vazio>
      )}

      {modelos.length > 0 && (
        <>
          {padrao ? (
            <section ref={secaoPadrao} aria-labelledby="titulo-padrao" className="flex scroll-mt-2 flex-col gap-2">
              <h2 id="titulo-padrao" className="text-[11px] font-semibold tracking-[0.06em] text-accent-ink uppercase">
                Padrão
              </h2>
              <CartaoPadrao key={padrao.modeloId} modelo={padrao} aoSalvar={aoSalvar} />
            </section>
          ) : algumNoPainel ? (
            <Aviso tom="neutro" titulo="Nenhum modelo padrão">
              O painel de envio começa pelo primeiro modelo salvo. Para escolher qual, use “Tornar padrão”.
            </Aviso>
          ) : (
            <Aviso titulo="Nenhum modelo no painel de envio">
              Escolha abaixo qual modelo pode ser usado, em “Mostrar no painel”.
            </Aviso>
          )}

          {/* Um bloco por número: a conta pode ter o mesmo modelo, com o mesmo nome,
              em vários números, e o número é o que separa um do outro. */}
          {outros.length > 0 && (
            <section aria-labelledby="titulo-outros" className="flex flex-col gap-4">
              <h2 id="titulo-outros" className="text-[15px] font-semibold text-ink">
                {padrao ? 'Outros modelos' : 'Modelos aprovados'}
              </h2>
              {agruparPorNumero(outros).map((grupo) => (
                <div key={grupo.chave ?? 'sem-numero'} role="group" aria-label={rotuloDoGrupo(grupo)} className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-sm">
                    {grupo.numero ? (
                      <NumeroDeEnvio numero={grupo.numero} recusado={grupo.envio.permitido === false} />
                    ) : (
                      <span className="font-semibold text-ink-2">Número não identificado</span>
                    )}
                    <SituacaoDoNumero envio={grupo.envio} />
                    <span className="tnum ml-auto text-xs text-muted">
                      {grupo.itens.length} {grupo.itens.length === 1 ? 'modelo' : 'modelos'}
                    </span>
                  </div>
                  <ul className="divide-y divide-line-soft overflow-hidden rounded-[14px] border border-line-soft bg-surface">
                    {grupo.itens.map((modelo) => (
                      <LinhaDoModelo key={modelo.modeloId} modelo={modelo} aoSalvar={aoSalvar} />
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          )}
        </>
      )}
    </div>
  )
}

function rotuloDoGrupo(grupo: GrupoDeNumero<Modelo>): string {
  return grupo.numero ? `Modelos do número ${rotuloDoNumero(grupo.numero)}` : 'Modelos de número não identificado'
}

/** "[NOME], [DATA] e [HORÁRIO]" */
function lista(variaveis: Variavel[]): string {
  const marcacoes = variaveis.map((v) => v.marcacao)
  return marcacoes.length > 1 ? `${marcacoes.slice(0, -1).join(', ')} e ${marcacoes.at(-1)}` : (marcacoes[0] ?? '')
}

function mesmoMapeamento(a: Record<string, string>, b: Record<string, string>): boolean {
  const chaves = Object.keys(a)
  return chaves.length === Object.keys(b).length && chaves.every((k) => a[k] === b[k])
}

/** Só as variáveis ligadas: "sem campo" não é campo, nem para o servidor nem para a prévia. */
function soLigados(parametros: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(parametros).filter(([, campo]) => campo))
}

interface Situacao {
  tom: 'ok' | 'atencao' | 'erro' | 'parado'
  texto: string
}

// ── A configuração de um modelo ─────────────────────────────────────────────

/**
 * O estado de um modelo na tela: o que está escolhido, se mudou desde o que vale
 * hoje, o que impede de usar, e as ações. O cartão padrão e cada linha recolhida
 * têm um; a linha mantém o que foi mexido mesmo fechada.
 */
function useConfiguracao(modelo: Modelo, aoSalvar: (virouPadrao: boolean) => void) {
  // O que vale hoje — o salvo, completado pelos nomes. É o ponto de partida e o
  // "Desfazer". Recalculado a cada carga: depois de salvar, o salvo é o novo início.
  const inicial = {
    parametros: {
      ...Object.fromEntries(modelo.variaveis.map((v) => [v.nome, ''])),
      ...completarMapeamento(modelo.conteudo, modelo.config?.parametros ?? {}),
    },
    diaEnvio: modelo.config?.diaEnvio ?? 'aniversario',
    horario: modelo.config?.horarioEnvio ?? '09:00',
    arquivo: modelo.config?.arquivo ?? null,
  }
  const [parametros, setParametros] = useState<Record<string, string>>(inicial.parametros)
  const [diaEnvio, setDiaEnvio] = useState(inicial.diaEnvio)
  const [horario, setHorario] = useState(inicial.horario)
  const [arquivo, setArquivo] = useState<ArquivoDoModelo | null>(inicial.arquivo)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const ligados = soLigados(parametros)
  const faltando = modelo.variaveis.filter((v) => v.obrigatoria && !parametros[v.nome])
  const semCampo = modelo.variaveis.filter((v) => !v.obrigatoria && !parametros[v.nome])
  // Ligadas pelo nome e ainda não salvas: a tela diz que foi o app que escolheu.
  const pelosNomes = modelo.variaveis.filter(
    (v) => !modelo.config?.parametros[v.nome] && !!parametros[v.nome] && parametros[v.nome] === campoPeloNome(v.nome)
  )
  // A MESMA frase que o servidor usa para recusar o salvar e o agendamento.
  const foraDoNumero = motivoDeNaoSair(modelo.envio)
  const semArquivo = modelo.midia && !arquivo ? fraseSemArquivo(modelo.midia) : null
  const alterado =
    !mesmoMapeamento(ligados, soLigados(inicial.parametros)) ||
    diaEnvio !== inicial.diaEnvio ||
    horario !== inicial.horario ||
    arquivo?.id !== inicial.arquivo?.id
  const impedido = !!foraDoNumero || !!semArquivo || faltando.length > 0

  // No painel de envio só aparece modelo salvo: é o que separa "No painel" de "Fora do painel".
  const situacao: Situacao = foraDoNumero
    ? { tom: 'erro', texto: 'Não sai por esta unidade' }
    : modelo.midia && semArquivo
      ? { tom: 'atencao', texto: `Falta enviar ${REGRAS_DA_MIDIA[modelo.midia].comArtigo}` }
      : faltando.length > 0
        ? { tom: 'atencao', texto: `Falta escolher o campo de ${lista(faltando)}` }
        : modelo.config?.ehPadrao
          ? { tom: 'ok', texto: 'Pronto' }
          : modelo.config
            ? { tom: 'ok', texto: 'No painel' }
            : { tom: 'parado', texto: 'Fora do painel' }

  function desfazer() {
    setParametros(inicial.parametros)
    setDiaEnvio(inicial.diaEnvio)
    setHorario(inicial.horario)
    setArquivo(inicial.arquivo)
    setErro(null)
  }

  /** Salva o que está na tela — e o modelo aparece no painel. `padrao`: ele já vem escolhido lá. */
  async function salvar(padrao: boolean) {
    setSalvando(true)
    setErro(null)
    try {
      const resposta = await fetch('/api/modelos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modeloId: modelo.modeloId,
          nome: modelo.nome,
          parametros: ligados,
          diaEnvio,
          horarioEnvio: horario,
          ehPadrao: padrao,
          ativo: true,
          arquivo,
        }),
      })
      const corpo = await resposta.json()
      // O app anterior ignorava a resposta e mostrava "Salvo ✓" mesmo em erro —
      // a configuração sumia no reload seguinte e ninguém entendia por quê.
      if (!resposta.ok) throw new Error(corpo?.error ?? 'Não foi possível salvar')
      aoSalvar(padrao && !modelo.config?.ehPadrao)
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setSalvando(false)
    }
  }

  return {
    parametros,
    ligar: (variavel: string, campo: string) => setParametros((m) => ({ ...m, [variavel]: campo })),
    diaEnvio,
    setDiaEnvio,
    horario,
    setHorario,
    arquivo,
    setArquivo,
    ligados,
    faltando,
    semCampo,
    pelosNomes,
    foraDoNumero,
    semArquivo,
    alterado,
    impedido,
    situacao,
    salvando,
    erro,
    desfazer,
    salvar,
  }
}

type Configuracao = ReturnType<typeof useConfiguracao>

// ── O modelo padrão e as linhas dos outros ──────────────────────────────────

function CartaoPadrao({ modelo, aoSalvar }: { modelo: Modelo; aoSalvar: (virouPadrao: boolean) => void }) {
  const c = useConfiguracao(modelo, aoSalvar)

  return (
    <article className="entrar overflow-hidden rounded-[14px] border border-accent-line bg-surface">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line-soft px-4 py-3 sm:px-5">
        <h3 className="text-[15px] font-semibold text-ink">{modelo.nome}</h3>
        {modelo.midia && <EtiquetaDaMidia midia={modelo.midia} />}
        <SituacaoDoModelo situacao={c.situacao} />
        {modelo.envio.numero && (
          <NumeroDeEnvio
            numero={modelo.envio.numero}
            recusado={modelo.envio.permitido === false}
            className="text-sm sm:ml-auto"
          />
        )}
      </header>
      <Editor modelo={modelo} c={c} padrao />
    </article>
  )
}

function LinhaDoModelo({ modelo, aoSalvar }: { modelo: Modelo; aoSalvar: (virouPadrao: boolean) => void }) {
  const c = useConfiguracao(modelo, aoSalvar)
  const [aberto, setAberto] = useState(false)
  const idDoEditor = useId()

  return (
    <li>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:px-5">
        <button
          type="button"
          aria-expanded={aberto}
          aria-controls={idDoEditor}
          onClick={() => setAberto((a) => !a)}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 rounded-md text-left"
        >
          <svg
            aria-hidden
            viewBox="0 0 16 16"
            className={clsx('h-4 w-4 shrink-0 text-muted transition-transform', aberto && 'rotate-90')}
          >
            <path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="truncate text-sm font-semibold text-ink">{modelo.nome}</span>
          {modelo.midia && <EtiquetaDaMidia midia={modelo.midia} />}
        </button>
        <SituacaoDoModelo situacao={c.situacao} />
        {modelo.config && !c.impedido && <span className="text-xs text-muted">{quandoSai(c.diaEnvio, c.horario)}</span>}
        {!c.impedido && (
          <Botao
            variante="secundario"
            tamanho="sm"
            disabled={c.salvando}
            onClick={() => void c.salvar(!!modelo.config)}
          >
            {c.salvando ? 'Salvando…' : modelo.config ? 'Tornar padrão' : 'Mostrar no painel'}
          </Botao>
        )}
      </div>
      {!aberto && c.erro && <p className="px-4 pb-3 text-sm text-erro sm:px-5">{c.erro}</p>}
      {aberto && (
        <div id={idDoEditor} className="border-t border-line-soft">
          <Editor modelo={modelo} c={c} padrao={false} />
        </div>
      )}
    </li>
  )
}

function EtiquetaDaMidia({ midia }: { midia: TipoDeMidia }) {
  return (
    <span className="shrink-0 rounded-full bg-sunk px-2 py-0.5 text-[11px] text-ink-2">
      com {REGRAS_DA_MIDIA[midia].rotulo}
    </span>
  )
}

/** A situação tem forma além de cor: ponto cheio, vazado ou quadrado. */
function SituacaoDoModelo({ situacao }: { situacao: Situacao }) {
  return (
    <Estado tom={situacao.tom}>
      <span
        aria-hidden
        className={clsx(
          'h-1.5 w-1.5',
          situacao.tom === 'ok' && 'rounded-full bg-current',
          (situacao.tom === 'atencao' || situacao.tom === 'parado') && 'rounded-full border border-current',
          situacao.tom === 'erro' && 'rounded-[1px] bg-current'
        )}
      />
      {situacao.texto}
    </Estado>
  )
}

// ── O editor ────────────────────────────────────────────────────────────────

function Editor({ modelo, c, padrao }: { modelo: Modelo; c: Configuracao; padrao: boolean }) {
  return (
    <div className="flex flex-col gap-5 px-4 py-4 sm:px-5">
      {c.foraDoNumero && <Aviso tom="erro">{c.foraDoNumero}</Aviso>}

      <QuandoSai c={c} />

      {modelo.midia && (
        <MidiaDoModelo
          modeloId={modelo.modeloId}
          midia={modelo.midia}
          arquivo={c.arquivo}
          aoEnviar={(a) => c.setArquivo(a)}
        />
      )}

      {/* A conversa tem a largura de uma tela de celular: é assim que o paciente lê. */}
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,25rem)_minmax(0,1fr)]">
        <Conversa
          trechos={trechosDoTexto(modelo.conteudo, c.ligados, EXEMPLO)}
          dia={diaDaChegada(c.diaEnvio)}
          horario={c.horario}
          midia={modelo.midia}
          arquivo={c.arquivo}
        />
        <Variaveis modelo={modelo} c={c} />
      </div>

      {(c.alterado || c.erro) && (
        <div className="-mx-4 -mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line-soft bg-sunk/70 px-4 py-3 sm:-mx-5 sm:px-5">
          <p className={clsx('text-sm', c.erro ? 'text-erro' : 'text-ink-2')}>{c.erro ?? 'Alterações não salvas'}</p>
          {c.alterado && (
            <div className="ml-auto flex gap-2">
              <Botao variante="secundario" tamanho="sm" disabled={c.salvando} onClick={c.desfazer}>
                Desfazer
              </Botao>
              <Botao tamanho="sm" disabled={c.salvando || c.impedido} onClick={() => void c.salvar(padrao)}>
                {c.salvando ? 'Salvando…' : 'Salvar alterações'}
              </Botao>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** "Envia um dia antes do aniversário, às 9h" — e os campos só quando a pessoa quer mudar. */
function QuandoSai({ c }: { c: Configuracao }) {
  const [mudando, setMudando] = useState(false)

  if (!mudando) {
    return (
      <p className="text-sm text-ink-2">
        Envia <span className="font-medium text-ink">{quandoSai(c.diaEnvio, c.horario)}</span>
        <button
          type="button"
          onClick={() => setMudando(true)}
          className="ml-2 cursor-pointer rounded text-[13px] font-medium text-accent-ink hover:underline"
        >
          alterar
        </button>
      </p>
    )
  }
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-2 text-sm text-ink-2">
      Envia
      <select
        aria-label="Quando a mensagem sai"
        value={c.diaEnvio}
        onChange={(e) => c.setDiaEnvio(e.target.value)}
        className="h-9 rounded-[10px] border border-line bg-field px-2.5 text-sm text-ink focus:border-accent-line focus:ring-[3px] focus:ring-accent/15 focus:outline-none"
      >
        {DIAS_DE_ENVIO.map((d) => (
          <option key={d.valor} value={d.valor}>
            {d.rotulo}
          </option>
        ))}
      </select>
      às
      <CampoDeHorario valor={c.horario} aoMudar={c.setHorario} rotulo="Horário do envio" compacto className="w-[108px]" />
      <button
        type="button"
        onClick={() => setMudando(false)}
        className="ml-1 cursor-pointer rounded text-[13px] font-medium text-accent-ink hover:underline"
      >
        pronto
      </button>
    </div>
  )
}

/**
 * A mensagem como chega no WhatsApp do paciente: o dia em que chega, o horário
 * do envio no canto do balão, o negrito aplicado e os valores do app marcados.
 */
function Conversa({
  trechos,
  dia,
  horario,
  midia,
  arquivo,
}: {
  trechos: Trecho[]
  dia: string
  horario: string
  midia: TipoDeMidia | null
  arquivo: ArquivoDoModelo | null
}) {
  const pedacos = pedacosDaPrevia(trechos)

  return (
    <figure className="flex flex-col gap-2">
      <div className="flex flex-col gap-2.5 rounded-[12px] bg-[#efeae2] px-3 py-4 sm:px-4">
        <span className="mx-auto rounded-md bg-white/85 px-2 py-0.5 text-[10.5px] font-medium tracking-wide text-ink-2 uppercase">
          {dia}
        </span>
        <div className="max-w-[94%] self-start rounded-[10px] rounded-tl-[3px] bg-white px-2.5 pt-1.5 pb-1 text-[13.5px] leading-[1.45] text-[#111b21] shadow-[0_1px_0.5px_rgb(11_20_26/0.13)]">
          {midia && <MidiaNaConversa midia={midia} arquivo={arquivo} />}
          <p className="break-words whitespace-pre-wrap">
            {pedacos.length === 0 && <span className="text-muted">Este modelo não tem texto.</span>}
            {pedacos.map((p, i) => (
              <span
                key={i}
                className={clsx(
                  p.negrito && 'font-semibold',
                  p.italico && 'italic',
                  p.riscado && 'line-through',
                  p.variavel && 'rounded-[3px] px-[1px] [box-decoration-break:clone]',
                  p.variavel === 'ligada' && 'bg-accent-soft text-accent-ink',
                  p.variavel === 'solta' && 'bg-atencao-soft text-atencao'
                )}
              >
                {p.texto}
              </span>
            ))}
            <span className="tnum float-right mt-1.5 ml-3 text-[10.5px] leading-none text-[#667781]">{horario}</span>
          </p>
        </div>
      </div>
      <figcaption className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-xs text-muted">
        <span>Paciente de exemplo: Marina, aniversário em 14/03</span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="h-2.5 w-2.5 rounded-[3px] bg-accent-soft ring-1 ring-accent-line" />
          preenchido pelo app
        </span>
      </figcaption>
    </figure>
  )
}

function MidiaNaConversa({ midia, arquivo }: { midia: TipoDeMidia; arquivo: ArquivoDoModelo | null }) {
  const { rotulo, comArtigo } = REGRAS_DA_MIDIA[midia]
  return (
    <div
      className={clsx(
        'mb-1.5 -mx-1 flex items-center justify-center gap-2 rounded-[7px] px-3 text-xs',
        midia === 'documento' ? 'h-12' : 'aspect-[16/9]',
        arquivo ? 'bg-sunk-2 text-ink-2' : 'bg-atencao-soft text-atencao'
      )}
    >
      {arquivo ? (
        <>
          {midia === 'video' && (
            <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-black/45 text-[11px] text-white">
              ▶
            </span>
          )}
          <span className="truncate">
            {rotulo[0]!.toUpperCase() + rotulo.slice(1)} · {arquivo.nome}
          </span>
        </>
      ) : (
        <span>Falta enviar {comArtigo}</span>
      )}
    </div>
  )
}

/** Cada variável numa frase: "[NOME] Primeiro nome · Marina — trocar". O seletor só quando precisa. */
function Variaveis({ modelo, c }: { modelo: Modelo; c: Configuracao }) {
  const [trocando, setTrocando] = useState<string | null>(null)

  if (modelo.variaveis.length === 0) {
    return <p className="text-sm text-muted">Este modelo não tem variáveis: sai igual para todos.</p>
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="px-1 text-xs font-medium text-muted">Variáveis</p>
      <ul className="divide-y divide-line-soft rounded-[12px] border border-line-soft">
        {modelo.variaveis.map((v) => {
          const campo = c.parametros[v.nome] ?? ''
          const escolhendo = trocando === v.nome || (v.obrigatoria && !campo)
          return (
            <li key={v.nome} className="flex min-h-11 items-center gap-3 px-3 py-1.5">
              <code title={v.marcacao} className="max-w-[8.5rem] min-w-[4.5rem] shrink-0 truncate font-mono text-xs text-ink-2">
                {v.marcacao}
              </code>
              {escolhendo ? (
                <select
                  aria-label={`Campo de ${v.marcacao}`}
                  autoFocus={trocando === v.nome}
                  value={campo}
                  onChange={(e) => {
                    c.ligar(v.nome, e.target.value)
                    setTrocando(null)
                  }}
                  onBlur={() => setTrocando(null)}
                  className={clsx(
                    'h-9 min-w-0 flex-1 rounded-[10px] border bg-field px-2.5 text-sm focus:border-accent-line focus:ring-[3px] focus:ring-accent/15 focus:outline-none',
                    campo ? 'border-line text-ink' : 'border-atencao/50 text-muted'
                  )}
                >
                  {/* Com o nome que diz o campo, "sem campo" não existe: o lote liga pelo nome. */}
                  <option value="" disabled={v.obrigatoria || !!campoPeloNome(v.nome)}>
                    {v.obrigatoria ? 'Escolha o campo…' : 'Sem campo'}
                  </option>
                  {CAMPOS_DISPONIVEIS.map((opcao) => (
                    <option key={opcao.valor} value={opcao.valor}>
                      {opcao.rotulo} · {VALORES_DO_EXEMPLO[opcao.valor]}
                    </option>
                  ))}
                </select>
              ) : (
                <>
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {campo ? (
                      <>
                        <span className="text-ink">{ROTULO_DO_CAMPO.get(campo)}</span>
                        <span className="text-muted"> · {VALORES_DO_EXEMPLO[campo]}</span>
                      </>
                    ) : (
                      <span className="text-muted">Sem campo</span>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => setTrocando(v.nome)}
                    aria-label={`${campo ? 'Trocar' : 'Escolher'} o campo de ${v.marcacao}`}
                    className="shrink-0 cursor-pointer rounded text-[13px] font-medium text-accent-ink hover:underline"
                  >
                    {campo ? 'trocar' : 'escolher'}
                  </button>
                </>
              )}
            </li>
          )
        })}
      </ul>

      {c.pelosNomes.length > 0 && (
        <p className="px-1 text-xs text-muted">O app ligou {lista(c.pelosNomes)} pelo nome da variável.</p>
      )}
      {c.semCampo.length > 0 && (
        <p className="px-1 text-xs text-muted">
          O app não reconhece {lista(c.semCampo)}: sem campo, não manda valor para{' '}
          {c.semCampo.length === 1 ? 'ela' : 'elas'}.
        </p>
      )}
      {c.faltando.length > 0 && (
        <p className="px-1 text-xs text-atencao">Escolha o campo de {lista(c.faltando)} para poder salvar.</p>
      )}
    </div>
  )
}

/**
 * O vídeo (ou imagem, ou documento) do modelo. A plataforma não junta sozinha o
 * arquivo do modelo ao agendamento, e a API não o entrega: sem o arquivo
 * enviado aqui, a mensagem falha no disparo.
 *
 * Confere tipo e tamanho ANTES de enviar, com a mesma regra do servidor: um
 * vídeo de 40 MB não precisa viajar até lá para ser recusado.
 */
function MidiaDoModelo({
  modeloId,
  midia,
  arquivo,
  aoEnviar,
}: {
  modeloId: string
  midia: TipoDeMidia
  arquivo: ArquivoDoModelo | null
  aoEnviar: (arquivo: ArquivoDoModelo) => void
}) {
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const seletor = useRef<HTMLInputElement>(null)
  const { rotulo, comArtigo } = REGRAS_DA_MIDIA[midia]

  async function enviar(escolhido: File) {
    setErro(null)
    const problema = problemaNoArquivo(midia, { mimeType: escolhido.type, tamanho: escolhido.size })
    if (problema) {
      setErro(problema)
      return
    }
    setEnviando(true)
    try {
      const formulario = new FormData()
      formulario.set('modeloId', modeloId)
      formulario.set('arquivo', escolhido)
      const resposta = await fetch('/api/modelos/arquivo', { method: 'POST', body: formulario })
      const corpo = await resposta.json().catch(() => null)
      if (!resposta.ok) throw new Error(corpo?.error ?? `Não foi possível enviar ${comArtigo}`)
      aoEnviar(corpo as ArquivoDoModelo)
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setEnviando(false)
      if (seletor.current) seletor.current.value = ''
    }
  }

  return (
    <div className="flex flex-col gap-2.5 rounded-[10px] border border-line-soft px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted">{rotulo[0]!.toUpperCase() + rotulo.slice(1)} do modelo</p>
          <p className={clsx('truncate text-sm', arquivo ? 'text-ink' : 'text-atencao')}>
            {arquivo ? arquivo.nome : `Nenhum ${rotulo === 'imagem' ? 'arquivo' : rotulo} enviado`}
          </p>
        </div>
        <input
          ref={seletor}
          type="file"
          accept={aceitoPara(midia)}
          className="sr-only"
          aria-label={`Escolher ${comArtigo} do modelo`}
          onChange={(e) => {
            const escolhido = e.target.files?.[0]
            if (escolhido) void enviar(escolhido)
          }}
        />
        <Botao variante="secundario" tamanho="sm" disabled={enviando} onClick={() => seletor.current?.click()}>
          {enviando ? 'Enviando…' : arquivo ? `Trocar ${rotulo}` : `Enviar ${rotulo}`}
        </Botao>
      </div>
      {!arquivo && !erro && <p className="text-sm text-atencao">{fraseSemArquivo(midia)}</p>}
      {erro && <p className="text-sm text-erro">{erro}</p>}
    </div>
  )
}
