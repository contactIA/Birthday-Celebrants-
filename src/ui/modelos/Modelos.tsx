'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { Aviso, Botao, Carregando, Vazio } from '@/ui/primitivos'
import { CampoDeHorario } from '@/ui/campos-de-data'
import {
  CAMPOS_DISPONIVEIS,
  campoPeloNome,
  completarMapeamento,
  renderizar,
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

// Onde a clínica liga as variáveis de um modelo aprovado aos dados do paciente.
//
// A prévia usa `renderizar` com um paciente de exemplo — a MESMA função do
// envio. Ver o texto montado é o que torna o mapeamento verificável: "{{1}}"
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

  return (
    // Tela cheia, como as outras. Os cartões vão em duas colunas em tela larga:
    // esticado na largura toda, o texto da prévia ficaria longo demais para ler.
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-lg font-semibold tracking-[-0.01em] text-ink">Modelos de mensagem</h1>
        <p className="mt-0.5 text-sm text-muted">
          Ligue as variáveis de cada modelo aprovado aos dados do paciente e escolha quando enviar.
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

      {carregando && <Carregando>Carregando modelos…</Carregando>}

      {!carregando && !erro && modelos.length === 0 && (
        <Vazio titulo="Nenhum modelo aprovado nesta conta">
          Crie e aprove um modelo de mensagem na plataforma, depois volte aqui para configurá-lo.
        </Vazio>
      )}

      {/* Um bloco por número: a conta pode ter o mesmo modelo, com o mesmo nome,
          em vários números, e o número é o que separa um do outro. */}
      {!carregando && modelos.length > 0 && (
        <div className="flex flex-col gap-9">
          {agruparPorNumero(modelos).map((grupo) => (
            <section key={grupo.chave ?? 'sem-numero'} aria-label={rotuloDoGrupo(grupo)} className="flex flex-col gap-3">
              <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line pb-2.5 text-[15px]">
                {grupo.numero ? (
                  <NumeroDeEnvio numero={grupo.numero} recusado={grupo.envio.permitido === false} />
                ) : (
                  <span className="font-semibold text-ink-2">Número não identificado</span>
                )}
                <SituacaoDoNumero envio={grupo.envio} />
                <span className="tnum ml-auto text-xs text-muted">
                  {grupo.itens.length} {grupo.itens.length === 1 ? 'modelo' : 'modelos'}
                </span>
              </header>
              <div className="grid items-start gap-5 xl:grid-cols-2">
                {grupo.itens.map((modelo) => (
                  <Cartao key={modelo.modeloId} modelo={modelo} aoSalvar={recarregar} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

/** "[NOME], [DATA] e [HORÁRIO]" */
function lista(variaveis: Variavel[]): string {
  const marcacoes = variaveis.map((v) => v.marcacao)
  return marcacoes.length > 1 ? `${marcacoes.slice(0, -1).join(', ')} e ${marcacoes.at(-1)}` : (marcacoes[0] ?? '')
}

function rotuloDoGrupo(grupo: GrupoDeNumero<Modelo>): string {
  return grupo.numero ? `Modelos do número ${rotuloDoNumero(grupo.numero)}` : 'Modelos de número não identificado'
}

function Cartao({ modelo, aoSalvar }: { modelo: Modelo; aoSalvar: () => void }) {
  // Cada variável começa com o que vale no envio: o campo salvo, ou o que o
  // nome diz. A que o nome não explica começa SEM campo: antes, todas vinham
  // como "Primeiro nome", num modelo "completa {{2}} anos" a prévia saía
  // "completa Marina anos", e um clique em Salvar sem reparar mandava isso a
  // todos os pacientes.
  const [parametros, setParametros] = useState<Record<string, string>>(() => ({
    ...Object.fromEntries(modelo.variaveis.map((v) => [v.nome, ''])),
    ...completarMapeamento(modelo.conteudo, modelo.config?.parametros ?? {}),
  }))
  // Só as ligadas vão para o servidor e para a prévia: "sem campo" não é campo.
  const ligados = Object.fromEntries(Object.entries(parametros).filter(([, campo]) => campo))
  const faltando = modelo.variaveis.filter((v) => v.obrigatoria && !parametros[v.nome])
  const semCampo = modelo.variaveis.filter((v) => !v.obrigatoria && !parametros[v.nome])
  // Ligadas pelo nome e ainda não salvas: a tela diz que foi o app que escolheu.
  const pelosNomes = modelo.variaveis.filter(
    (v) => !modelo.config?.parametros[v.nome] && !!parametros[v.nome] && parametros[v.nome] === campoPeloNome(v.nome)
  )
  const [diaEnvio, setDiaEnvio] = useState(modelo.config?.diaEnvio ?? 'aniversario')
  const [horario, setHorario] = useState(modelo.config?.horarioEnvio ?? '09:00')
  const [ehPadrao, setEhPadrao] = useState(modelo.config?.ehPadrao ?? false)
  const [salvando, setSalvando] = useState(false)
  const [resultado, setResultado] = useState<{ ok: boolean; mensagem: string } | null>(null)
  const [arquivo, setArquivo] = useState<ArquivoDoModelo | null>(modelo.config?.arquivo ?? null)
  // A MESMA frase que o servidor usa para recusar o salvar e o agendamento.
  const foraDoNumero = motivoDeNaoSair(modelo.envio)
  const semArquivo = modelo.midia && !arquivo ? fraseSemArquivo(modelo.midia) : null
  // Enviado e ainda não salvo: o vídeo só vale para o modelo depois do salvar.
  const arquivoNaoSalvo = !!arquivo && arquivo.id !== modelo.config?.arquivo?.id

  async function salvar() {
    setSalvando(true)
    setResultado(null)
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
          ehPadrao,
          ativo: true,
          arquivo,
        }),
      })
      const corpo = await resposta.json()
      // O app anterior ignorava a resposta e mostrava "Salvo ✓" mesmo em erro —
      // a configuração sumia no reload seguinte e ninguém entendia por quê.
      if (!resposta.ok) throw new Error(corpo?.error ?? 'Não foi possível salvar')
      setResultado({ ok: true, mensagem: 'Configuração salva' })
      aoSalvar()
    } catch (e) {
      setResultado({ ok: false, mensagem: (e as Error).message })
    } finally {
      setSalvando(false)
    }
  }

  // As que faltam ficam como `{{n}}` ou `[NOME]` no texto, que é exatamente o
  // que ainda precisa de escolha.
  const previa = renderizar(modelo.conteudo, ligados, EXEMPLO)

  return (
    <section className="entrar overflow-hidden rounded-[14px] border border-line-soft bg-surface">
      <header className="flex items-center gap-2.5 border-b border-line-soft px-5 py-3">
        <h3 className="text-sm font-semibold text-ink">{modelo.nome}</h3>
        {modelo.midia && (
          <span className="rounded-full bg-sunk px-2 py-0.5 text-[11px] text-ink-2">
            com {REGRAS_DA_MIDIA[modelo.midia].rotulo}
          </span>
        )}
        {modelo.config?.ehPadrao && (
          <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent-ink">
            padrão
          </span>
        )}
        {!modelo.config && (
          <span className="rounded-full bg-sunk px-2 py-0.5 text-[11px] text-muted">
            não configurado
          </span>
        )}
      </header>

      <div className="flex flex-col gap-5 p-5">
        {foraDoNumero && <Aviso tom="erro">{foraDoNumero}</Aviso>}

        {modelo.midia && (
          <MidiaDoModelo
            modeloId={modelo.modeloId}
            midia={modelo.midia}
            arquivo={arquivo}
            naoSalvo={arquivoNaoSalvo}
            aoEnviar={(a) => {
              setArquivo(a)
              setResultado(null)
            }}
          />
        )}

        <div className="rounded-[10px] bg-sunk px-4 py-3">
          <p className="mb-1 text-xs text-muted">Prévia com um paciente de exemplo</p>
          <p className="text-sm leading-relaxed whitespace-pre-wrap text-ink">
            {previa || 'Este modelo não tem texto para pré-visualizar.'}
          </p>
        </div>

        {modelo.variaveis.length === 0 ? (
          <p className="text-sm text-muted">Este modelo não tem variáveis para ligar.</p>
        ) : (
          <div className="grid gap-2.5 sm:grid-cols-2">
            {modelo.variaveis.map((v) => (
              <label key={v.nome} className="flex items-center gap-2.5">
                <span title={v.marcacao} className="min-w-12 max-w-[9rem] shrink-0 truncate font-mono text-xs text-muted">
                  {v.marcacao}
                </span>
                <select
                  value={parametros[v.nome] ?? ''}
                  onChange={(e) => setParametros((m) => ({ ...m, [v.nome]: e.target.value }))}
                  className={clsx(
                    'h-9 min-w-0 flex-1 rounded-[10px] border bg-field px-2.5 text-sm focus:border-accent-line focus:ring-[3px] focus:ring-accent/15 focus:outline-none',
                    parametros[v.nome]
                      ? 'border-line text-ink'
                      : v.obrigatoria
                        ? 'border-atencao/50 text-muted'
                        : 'border-line text-muted'
                  )}
                >
                  {/* Com o nome que diz o campo, "sem campo" não existe: o lote liga pelo nome. */}
                  <option value="" disabled={v.obrigatoria || !!campoPeloNome(v.nome)}>
                    {v.obrigatoria ? 'Escolha o campo…' : 'Sem campo'}
                  </option>
                  {CAMPOS_DISPONIVEIS.map((campo) => (
                    <option key={campo.valor} value={campo.valor}>
                      {campo.rotulo}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          <label className="flex items-center gap-2 text-sm text-ink-2">
            Enviar
            <select
              value={diaEnvio}
              onChange={(e) => setDiaEnvio(e.target.value)}
              className="h-9 rounded-[10px] border border-line bg-field px-2.5 text-sm text-ink focus:border-accent-line focus:ring-[3px] focus:ring-accent/15 focus:outline-none"
            >
              <option value="aniversario">no dia do aniversário</option>
              <option value="1_dia_antes">um dia antes</option>
              <option value="3_dias_antes">três dias antes</option>
            </select>
          </label>

          <div className="flex items-center gap-2 text-sm text-ink-2">
            às
            <CampoDeHorario valor={horario} aoMudar={setHorario} rotulo="Horário do envio" compacto className="w-[108px]" />
          </div>

          <label className="flex items-center gap-2 text-sm text-ink-2">
            <input
              type="checkbox"
              checked={ehPadrao}
              onChange={(e) => setEhPadrao(e.target.checked)}
              className="h-4 w-4 accent-[var(--color-accent)]"
            />
            Usar como modelo padrão
          </label>

          <Botao
            tamanho="sm"
            onClick={salvar}
            disabled={salvando || faltando.length > 0 || !!foraDoNumero || !!semArquivo}
            className="ml-auto"
          >
            {salvando ? 'Salvando…' : 'Salvar configuração'}
          </Botao>
        </div>

        {pelosNomes.length > 0 && (
          <p className="text-sm text-ink-2">
            O app ligou {lista(pelosNomes)} pelo nome da variável. Confira na prévia.
          </p>
        )}

        {semCampo.length > 0 && (
          <p className="text-sm text-muted">
            O app não reconhece {lista(semCampo)}: sem campo, não manda valor para{' '}
            {semCampo.length === 1 ? 'ela' : 'elas'}.
          </p>
        )}

        {faltando.length > 0 && (
          <p className="text-sm text-atencao">Escolha o campo de {lista(faltando)} para poder salvar.</p>
        )}

        {resultado && (
          <p className={resultado.ok ? 'text-sm text-ok' : 'text-sm text-erro'}>
            {resultado.mensagem}
          </p>
        )}
      </div>
    </section>
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
  naoSalvo,
  aoEnviar,
}: {
  modeloId: string
  midia: TipoDeMidia
  arquivo: ArquivoDoModelo | null
  naoSalvo: boolean
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
      {naoSalvo && <p className="text-sm text-ink-2">Enviado. Salve a configuração para usar este arquivo.</p>}
      {erro && <p className="text-sm text-erro">{erro}</p>}
    </div>
  )
}
