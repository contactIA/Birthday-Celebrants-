'use client'

import { useCallback, useEffect, useState } from 'react'
import clsx from 'clsx'
import { Aviso, Botao, Carregando, Vazio } from '@/ui/primitivos'
import { CAMPOS_DISPONIVEIS, renderizar } from '@/shared/template/parametros'

// Onde a clínica liga as variáveis de um modelo aprovado aos dados do paciente.
//
// A prévia usa `renderizar` com um paciente de exemplo — a MESMA função do
// envio. Ver o texto montado é o que torna o mapeamento verificável: "{{1}}"
// não diz nada, "Olá, Marina" diz tudo.

const EXEMPLO = {
  nome: 'Marina Duarte Alves',
  datanascimento: '14/03/1988',
  aniversario: '03/14',
}

interface Modelo {
  modeloId: string
  nome: string
  conteudo: string
  parametrosDoTexto: string[]
  config: {
    id: string
    parametros: Record<string, string>
    diaEnvio: string
    horarioEnvio: string
    ehPadrao: boolean
    ativo: boolean
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

      {!carregando && modelos.length > 0 && (
        <div className="grid items-start gap-5 xl:grid-cols-2">
          {modelos.map((modelo) => (
            <Cartao key={modelo.modeloId} modelo={modelo} aoSalvar={recarregar} />
          ))}
        </div>
      )}
    </div>
  )
}

function Cartao({ modelo, aoSalvar }: { modelo: Modelo; aoSalvar: () => void }) {
  // Modelo ainda não configurado começa SEM campo em cada variável. Antes, todas
  // vinham como "Primeiro nome": num modelo "completa {{2}} anos" a prévia saía
  // "completa Marina anos", e um clique em Salvar sem reparar mandava isso a
  // todos os pacientes.
  const [parametros, setParametros] = useState<Record<string, string>>(
    modelo.config?.parametros ?? Object.fromEntries(modelo.parametrosDoTexto.map((p) => [p, '']))
  )
  const faltando = modelo.parametrosDoTexto.filter((p) => !parametros[p])
  const [diaEnvio, setDiaEnvio] = useState(modelo.config?.diaEnvio ?? 'aniversario')
  const [horario, setHorario] = useState(modelo.config?.horarioEnvio ?? '09:00')
  const [ehPadrao, setEhPadrao] = useState(modelo.config?.ehPadrao ?? false)
  const [salvando, setSalvando] = useState(false)
  const [resultado, setResultado] = useState<{ ok: boolean; mensagem: string } | null>(null)

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
          parametros,
          diaEnvio,
          horarioEnvio: horario,
          ehPadrao,
          ativo: true,
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

  // Só as variáveis já ligadas entram na prévia: as que faltam ficam como
  // `{{n}}` no texto, que é exatamente o que ainda precisa de escolha.
  const previa = renderizar(
    modelo.conteudo,
    Object.fromEntries(Object.entries(parametros).filter(([, campo]) => campo)),
    EXEMPLO
  )

  return (
    <section className="overflow-hidden rounded-[12px] border border-line bg-surface">
      <header className="flex items-center gap-2.5 border-b border-line-soft px-5 py-3">
        <h2 className="text-sm font-semibold text-ink">{modelo.nome}</h2>
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
        <div className="rounded-[10px] bg-sunk px-4 py-3">
          <p className="mb-1 text-xs text-muted">Prévia com um paciente de exemplo</p>
          <p className="text-sm leading-relaxed whitespace-pre-wrap text-ink">
            {previa || 'Este modelo não tem texto para pré-visualizar.'}
          </p>
        </div>

        {modelo.parametrosDoTexto.length === 0 ? (
          <p className="text-sm text-muted">Este modelo não tem variáveis para ligar.</p>
        ) : (
          <div className="grid gap-2.5 sm:grid-cols-2">
            {modelo.parametrosDoTexto.map((p) => (
              <label key={p} className="flex items-center gap-2.5">
                <span className="w-12 shrink-0 font-mono text-xs text-muted">{`{{${p}}}`}</span>
                <select
                  value={parametros[p] ?? ''}
                  onChange={(e) => setParametros((m) => ({ ...m, [p]: e.target.value }))}
                  className={clsx(
                    'h-9 min-w-0 flex-1 rounded-lg border bg-surface px-2.5 text-sm focus:outline-none',
                    parametros[p] ? 'border-line text-ink' : 'border-atencao/50 text-muted'
                  )}
                >
                  <option value="" disabled>
                    Escolha o campo…
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
              className="h-9 rounded-lg border border-line bg-surface px-2.5 text-sm text-ink focus:outline-none"
            >
              <option value="aniversario">no dia do aniversário</option>
              <option value="1_dia_antes">um dia antes</option>
              <option value="3_dias_antes">três dias antes</option>
            </select>
          </label>

          <label className="flex items-center gap-2 text-sm text-ink-2">
            às
            <input
              type="time"
              value={horario}
              onChange={(e) => setHorario(e.target.value)}
              className="tnum h-9 rounded-lg border border-line bg-surface px-2.5 text-sm text-ink focus:outline-none"
            />
          </label>

          <label className="flex items-center gap-2 text-sm text-ink-2">
            <input
              type="checkbox"
              checked={ehPadrao}
              onChange={(e) => setEhPadrao(e.target.checked)}
              className="h-4 w-4 accent-[var(--color-accent)]"
            />
            Usar como modelo padrão
          </label>

          <Botao tamanho="sm" onClick={salvar} disabled={salvando || faltando.length > 0} className="ml-auto">
            {salvando ? 'Salvando…' : 'Salvar configuração'}
          </Botao>
        </div>

        {faltando.length > 0 && (
          <p className="text-sm text-atencao">
            Escolha o campo de {faltando.map((p) => `{{${p}}}`).join(', ')} para poder salvar.
          </p>
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
