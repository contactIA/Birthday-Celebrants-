'use client'

import clsx from 'clsx'
import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Aviso, Botao, Carregando } from '@/ui/primitivos'
import { formatarTelefoneBR } from '@/shared/telefone/e164'
import { chamarApi, type CanalParaEscolher } from './api'

// O canal de WhatsApp que agenda, escolhido numa gaveta.
//
// Antes eram dois campos de texto: o número e o id do canal. A equipe ficava de
// fora — e na plataforma é a equipe que agenda, só pelos canais que atende. Sem
// equipe valia a padrão da conta, e quando ela não atendia o número, todo
// agendamento da clínica falhava. A gaveta lista os canais da conta com as
// equipes de cada um e já deixa marcada uma que atende: a padrão, se atende;
// senão a primeira.

/** O que o formulário guarda. Os três andam juntos: escolher um canal troca os três. */
export interface CanalEscolhido {
  from: string
  channelId: string
  equipeId: string
}

export const SEM_CANAL: CanalEscolhido = { from: '', channelId: '', equipeId: '' }

/** O canal salvo na lista: pelo id e, nos cadastros antigos (só o número), pelo número. */
function canalSalvo(canais: CanalParaEscolher[], valor: CanalEscolhido): CanalParaEscolher | undefined {
  const digitos = valor.from.replace(/\D/g, '')
  return (
    canais.find((c) => valor.channelId && c.id === valor.channelId) ??
    canais.find((c) => digitos && (c.numero === digitos || c.numero === `55${digitos}`))
  )
}

export function EscolhaDeCanal({
  clinicaId,
  tokenDigitado,
  valor,
  aoMudar,
  semCanal,
}: {
  /** Clínica salva: sem token digitado, a lista usa o token dela. */
  clinicaId: string | null
  tokenDigitado: string
  valor: CanalEscolhido
  aoMudar: (v: CanalEscolhido) => void
  /** O que vale sem canal escolhido — muda entre a clínica e uma unidade. */
  semCanal: string
}) {
  const [aberta, setAberta] = useState(false)
  const [canais, setCanais] = useState<CanalParaEscolher[] | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  // Os nomes do canal e da equipe salvos só existem na lista da conta. Sem ela
  // (falhou, ou clínica nova), o resumo mostra o número — a gaveta é que avisa.
  useEffect(() => {
    if (!clinicaId) return
    let vivo = true
    chamarApi<{ canais: CanalParaEscolher[] }>('/api/setup/canais', {
      method: 'POST',
      body: JSON.stringify({ id: clinicaId }),
    })
      .then((r) => vivo && setCanais(r.canais))
      .catch(() => {})
    return () => {
      vivo = false
    }
  }, [clinicaId])

  async function abrir() {
    setAberta(true)
    // Sempre de novo: a equipe pode ter mudado na plataforma desde a última vez.
    setCarregando(true)
    setErro(null)
    try {
      const r = await chamarApi<{ canais: CanalParaEscolher[] }>('/api/setup/canais', {
        method: 'POST',
        body: JSON.stringify({ id: clinicaId, mensageriaToken: tokenDigitado }),
      })
      setCanais(r.canais)
    } catch (e) {
      setErro((e as Error).message)
    }
    setCarregando(false)
  }

  const podeListar = !!clinicaId || !!tokenDigitado.trim()
  const atual = canais && valor.from ? canalSalvo(canais, valor) : undefined
  const equipe = atual?.equipes.find((e) => e.id === valor.equipeId)

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[13px] font-medium text-ink-2">Canal de WhatsApp (remetente)</span>
      <div className="flex flex-wrap items-center gap-3 rounded-[10px] border border-line bg-field px-3 py-2.5">
        <div className="min-w-0 flex-1 text-sm">
          {valor.from ? (
            <>
              <p className="truncate text-ink">
                {atual && <span className="font-medium">{atual.nome} · </span>}
                <span className="tnum">{formatarTelefoneBR(valor.from)}</span>
              </p>
              <p className="text-[13px] text-ink-2">
                Equipe:{' '}
                {equipe
                  ? `${equipe.nome}${equipe.padrao ? ' (padrão)' : ''}`
                  : !valor.equipeId
                    ? 'a padrão da conta'
                    : atual
                      ? 'a escolhida não atende mais este canal; troque o canal'
                      : 'escolhida'}
              </p>
            </>
          ) : (
            <p className="text-ink-2">{semCanal}</p>
          )}
        </div>
        <div className="flex gap-2">
          {valor.from && (
            <Botao type="button" variante="secundario" tamanho="sm" onClick={() => aoMudar(SEM_CANAL)}>
              Limpar
            </Botao>
          )}
          <Botao type="button" variante="discreto" tamanho="sm" onClick={abrir} disabled={!podeListar}>
            {valor.from ? 'Trocar' : 'Escolher canal'}
          </Botao>
        </div>
      </div>
      {!podeListar && (
        <span className="text-xs leading-relaxed text-muted">Informe o token de acesso para listar os canais da conta.</span>
      )}
      {valor.from && !valor.equipeId && (
        <span className="text-xs leading-relaxed text-atencao">
          Sem equipe escolhida, vale a padrão da conta, e ela pode não atender este número. Troque o canal para
          escolher a equipe.
        </span>
      )}

      {aberta &&
        createPortal(
          <Gaveta aoFechar={() => setAberta(false)}>
            {carregando ? (
              <div className="px-5 py-5">
                <Carregando>Buscando os canais e as equipes da conta…</Carregando>
              </div>
            ) : erro ? (
              <div className="px-5 py-5">
                <Aviso tom="erro" acao={{ rotulo: 'Tentar de novo', aoClicar: abrir }}>
                  {erro}
                </Aviso>
              </div>
            ) : canais ? (
              <ListaDeCanais
                canais={canais}
                valor={valor}
                aoUsar={(v) => {
                  aoMudar(v)
                  setAberta(false)
                }}
                aoCancelar={() => setAberta(false)}
              />
            ) : null}
          </Gaveta>,
          document.body
        )}
    </div>
  )
}

/** A gaveta lateral: cabeçalho fixo, corpo que rola. Esc e clique fora fecham. */
function Gaveta({ aoFechar, children }: { aoFechar: () => void; children: React.ReactNode }) {
  const titulo = useId()
  const painel = useRef<HTMLDivElement>(null)
  // Por ref: quem chama passa uma função nova a cada render, e o efeito abaixo
  // roubaria o foco de volta para o painel a cada um deles.
  const fechar = useRef(aoFechar)
  useEffect(() => {
    fechar.current = aoFechar
  })

  useEffect(() => {
    painel.current?.focus()
    const anterior = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    function tecla(e: KeyboardEvent) {
      if (e.key === 'Escape') fechar.current()
    }
    document.addEventListener('keydown', tecla)
    return () => {
      document.body.style.overflow = anterior
      document.removeEventListener('keydown', tecla)
    }
  }, [])

  return (
    <div className="fixed inset-0 z-50">
      <div aria-hidden className="absolute inset-0 bg-ink/30" onClick={aoFechar} />
      <div
        ref={painel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titulo}
        tabIndex={-1}
        className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col bg-surface shadow-xl outline-none"
      >
        <header className="flex items-start gap-3 border-b border-line-soft px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 id={titulo} className="text-[15px] font-semibold tracking-[-0.01em] text-ink">
              Escolher canal
            </h2>
            <p className="mt-0.5 text-[13px] leading-relaxed text-muted">
              Os canais de WhatsApp da conta e as equipes que agendam por eles. A equipe já vem marcada: a padrão,
              se atende o canal; senão, a primeira que atende.
            </p>
          </div>
          <button
            type="button"
            onClick={aoFechar}
            aria-label="Fechar"
            className="-mr-1 shrink-0 rounded-lg px-2 py-1 text-lg leading-none text-muted hover:bg-sunk hover:text-ink"
          >
            ×
          </button>
        </header>
        {children}
      </div>
    </div>
  )
}

function ListaDeCanais({
  canais,
  valor,
  aoUsar,
  aoCancelar,
}: {
  canais: CanalParaEscolher[]
  valor: CanalEscolhido
  aoUsar: (v: CanalEscolhido) => void
  aoCancelar: () => void
}) {
  const grupo = useId()
  const [canalId, setCanalId] = useState<string | null>(() => {
    const salvo = canalSalvo(canais, valor)
    return salvo?.id ?? (canais.length === 1 ? (canais[0]?.id ?? null) : null)
  })
  const [equipeId, setEquipeId] = useState<string | null>(() => {
    const canal = canais.find((c) => c.id === canalId)
    if (!canal) return null
    return canal.equipes.some((e) => e.id === valor.equipeId) ? valor.equipeId : canal.equipeSugerida
  })

  const canal = canais.find((c) => c.id === canalId)
  const pronto = !!canal && !!equipeId && canal.equipes.some((e) => e.id === equipeId)

  function escolherCanal(c: CanalParaEscolher) {
    setCanalId(c.id)
    setEquipeId(c.equipeSugerida)
  }

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {canais.length === 0 ? (
          <p className="text-sm text-ink-2">A conta não tem nenhum canal de WhatsApp ativo.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {canais.map((c) => {
              const marcado = c.id === canalId
              return (
                <li key={c.id}>
                  <label
                    className={clsx(
                      'flex cursor-pointer items-center gap-3 rounded-[12px] border px-4 py-3 transition-colors',
                      marcado ? 'border-accent-line bg-accent-soft' : 'border-line-soft hover:border-line-strong'
                    )}
                  >
                    <input
                      type="radio"
                      name={`${grupo}-canal`}
                      checked={marcado}
                      onChange={() => escolherCanal(c)}
                      className="accent-accent"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">{c.nome}</span>
                      <span className="tnum block text-[13px] text-ink-2">{c.numeroFormatado}</span>
                    </span>
                    <span className={clsx('shrink-0 text-xs', c.equipes.length === 0 ? 'text-atencao' : 'text-muted')}>
                      {c.equipes.length === 0
                        ? 'nenhuma equipe'
                        : `${c.equipes.length} ${c.equipes.length === 1 ? 'equipe' : 'equipes'}`}
                    </span>
                  </label>

                  {marcado && (
                    <div className="mt-2 ml-4 border-l-2 border-accent-line pl-4">
                      {c.equipes.length === 0 ? (
                        <p className="py-1 text-[13px] leading-relaxed text-atencao">
                          Nenhuma equipe agenda por este canal. Associe-o a uma equipe na plataforma de mensagens e
                          abra a lista de novo.
                        </p>
                      ) : (
                        <fieldset>
                          <legend className="mb-1 text-[13px] font-medium text-ink-2">Equipe que agenda</legend>
                          {c.equipes.map((e) => (
                            <label
                              key={e.id}
                              className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm hover:bg-sunk"
                            >
                              <input
                                type="radio"
                                name={`${grupo}-equipe`}
                                checked={equipeId === e.id}
                                onChange={() => setEquipeId(e.id)}
                                className="accent-accent"
                              />
                              <span className="text-ink">{e.nome}</span>
                              {e.padrao && (
                                <span className="rounded-full bg-sunk px-2 py-0.5 text-[11px] font-medium text-ink-2">
                                  padrão
                                </span>
                              )}
                            </label>
                          ))}
                        </fieldset>
                      )}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
      <footer className="flex items-center gap-2 border-t border-line-soft px-5 py-3">
        <Botao type="button" variante="secundario" onClick={aoCancelar}>
          Cancelar
        </Botao>
        <Botao
          type="button"
          className="ml-auto"
          disabled={!pronto}
          onClick={() => canal && equipeId && aoUsar({ from: canal.numero, channelId: canal.id, equipeId })}
        >
          Usar este canal
        </Botao>
      </footer>
    </>
  )
}
