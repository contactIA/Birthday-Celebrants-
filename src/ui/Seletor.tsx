'use client'

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import clsx from 'clsx'
import * as Popover from '@radix-ui/react-popover'
import { Quadro } from '@/ui/campos-de-data'
import { porLetra, pontaAtiva, proximaAtiva } from '@/ui/teclas-do-seletor'

// O seletor de uma opção, no lugar do <select> do navegador: o mesmo gatilho e
// o mesmo quadro flutuante dos campos de data e horário, para a tela não
// misturar duas linguagens. Teclado de listbox: setas, Home/End, Enter ou
// espaço para escolher, Esc para fechar, e uma letra para pular até a opção.

// A forma do gatilho dos campos de data; a cor da borda vem da variante, para
// duas cores de borda nunca disputarem a mesma classe.
const GATILHO =
  'flex h-9 w-full min-w-0 cursor-pointer items-center gap-2 rounded-[10px] border px-3 text-left text-sm text-ink transition-[border-color,box-shadow,background-color] outline-none focus-visible:border-accent-line focus-visible:ring-[3px] focus-visible:ring-accent/15 data-[state=open]:border-accent-line data-[state=open]:bg-field data-[state=open]:ring-[3px] data-[state=open]:ring-accent/15'

export interface OpcaoDoSeletor {
  valor: string
  rotulo: string
  /** O que a opção vira, em cinza ao lado: "Data da consulta · 24/09". */
  detalhe?: string
  desativada?: boolean
}

export function Seletor({
  valor,
  opcoes,
  aoMudar,
  rotulo,
  vazio = 'Escolher…',
  atencao,
  discreto,
  className,
}: {
  valor: string
  opcoes: OpcaoDoSeletor[]
  aoMudar: (valor: string) => void
  /** O nome do campo, para o leitor de tela. */
  rotulo: string
  vazio?: string
  /** Sem escolha e precisando de uma: a borda em âmbar. */
  atencao?: boolean
  /** Sem borda até passar o mouse: dentro de uma lista, lê como texto. */
  discreto?: boolean
  className?: string
}) {
  const [aberto, setAberto] = useState(false)
  const [ativa, setAtiva] = useState(-1)
  const lista = useRef<HTMLDivElement>(null)
  const id = useId()
  const escolhida = opcoes.find((o) => o.valor === valor)

  function abrir(quer: boolean) {
    setAberto(quer)
    if (!quer) return
    const marcada = opcoes.findIndex((o) => o.valor === valor && !o.desativada)
    setAtiva(marcada >= 0 ? marcada : pontaAtiva(opcoes, 'inicio'))
  }

  function escolher(i: number) {
    const opcao = opcoes[i]
    if (!opcao || opcao.desativada) return
    aoMudar(opcao.valor)
    setAberto(false)
  }

  // A opção ativa sempre à vista, quando a lista rola por dentro.
  useEffect(() => {
    if (aberto && ativa >= 0) document.getElementById(`${id}-${ativa}`)?.scrollIntoView({ block: 'nearest' })
  }, [aberto, ativa, id])

  function teclas(e: KeyboardEvent<HTMLDivElement>) {
    const mover = (para: number) => {
      e.preventDefault()
      if (para >= 0) setAtiva(para)
    }
    if (e.key === 'ArrowDown') return mover(proximaAtiva(opcoes, ativa, 1))
    if (e.key === 'ArrowUp') return mover(proximaAtiva(opcoes, ativa, -1))
    if (e.key === 'Home') return mover(pontaAtiva(opcoes, 'inicio'))
    if (e.key === 'End') return mover(pontaAtiva(opcoes, 'fim'))
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      return escolher(ativa)
    }
    if (e.key === 'Tab') return setAberto(false)
    if (e.key.length === 1 && /\p{L}|\p{N}/u.test(e.key)) mover(porLetra(opcoes, ativa, e.key))
  }

  return (
    <Popover.Root open={aberto} onOpenChange={abrir}>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-haspopup="listbox"
          aria-label={`${rotulo}: ${escolhida?.rotulo ?? vazio}`}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault()
              abrir(true)
            }
          }}
          className={clsx(
            GATILHO,
            atencao && !escolhida
              ? 'border-atencao/50 bg-field hover:border-atencao'
              : discreto
                ? 'border-transparent bg-transparent hover:border-line hover:bg-field'
                : 'border-line bg-field hover:border-line-strong',
            className
          )}
        >
          <span className="min-w-0 flex-1 truncate">
            {escolhida ? (
              <>
                {escolhida.rotulo}
                {escolhida.detalhe && <span className="text-muted"> · {escolhida.detalhe}</span>}
              </>
            ) : (
              <span className={atencao ? 'text-atencao' : 'text-muted-2'}>{vazio}</span>
            )}
          </span>
          <svg aria-hidden viewBox="0 0 16 16" className="h-4 w-4 shrink-0 text-muted">
            <path d="M4.5 6.5 8 10l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </Popover.Trigger>
      <Quadro
        className="min-w-(--radix-popover-trigger-width) p-1"
        onOpenAutoFocus={(e) => {
          // O foco vai para a lista, e a opção ativa é anunciada por aria-activedescendant.
          e.preventDefault()
          lista.current?.focus()
        }}
      >
        <div
          ref={lista}
          role="listbox"
          tabIndex={-1}
          aria-label={rotulo}
          aria-activedescendant={ativa >= 0 ? `${id}-${ativa}` : undefined}
          onKeyDown={teclas}
          className="outline-none"
        >
          {opcoes.map((o, i) => {
            const marcada = o.valor === valor
            return (
              <div
                key={o.valor}
                id={`${id}-${i}`}
                role="option"
                aria-selected={marcada}
                aria-disabled={o.desativada || undefined}
                onPointerMove={() => !o.desativada && setAtiva(i)}
                onClick={() => escolher(i)}
                className={clsx(
                  'flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm transition-colors',
                  o.desativada ? 'cursor-not-allowed opacity-45' : 'cursor-pointer',
                  i === ativa && !o.desativada && 'bg-sunk',
                  marcada ? 'font-medium text-accent-ink' : 'text-ink'
                )}
              >
                <span className="min-w-0 flex-1 truncate">
                  {o.rotulo}
                  {o.detalhe && <span className="font-normal text-muted"> · {o.detalhe}</span>}
                </span>
                <svg aria-hidden viewBox="0 0 16 16" className={clsx('h-4 w-4 shrink-0', !marcada && 'invisible')}>
                  <path d="M3.5 8.5 6.5 11.5 12.5 5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            )
          })}
        </div>
      </Quadro>
    </Popover.Root>
  )
}
