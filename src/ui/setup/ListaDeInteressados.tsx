'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Aviso, Carregando, Estado, Vazio } from '@/ui/primitivos'
import { formatarTelefoneBR } from '@/shared/telefone/e164'
import { chamarApi } from './api'

// Pedidos de vaga no beta, feitos na página que aparece para quem abre a aba
// sem ter a clínica cadastrada. Pendentes primeiro; quem já foi cadastrado
// fica embaixo, como registro.

interface Interessado {
  companyId: string
  nomeClinica: string
  telefone: string
  sistemaProntuario: 'clinicorp' | 'eclinica' | 'outro'
  modeloMensagem: string
  pedidoEm: string
  atualizadoEm: string
  cadastrada: boolean
}

const NOME_DO_SISTEMA = { clinicorp: 'Clinicorp', eclinica: 'e-Clínica', outro: 'Outro sistema' } as const

function dataCurta(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

export function ListaDeInteressados() {
  const [lista, setLista] = useState<Interessado[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    chamarApi<{ interessados: Interessado[] }>('/api/setup/interessados')
      .then((r) => setLista(r.interessados))
      .catch((e: Error) => setErro(e.message))
  }, [])

  const pendentes = lista?.filter((i) => !i.cadastrada) ?? []
  const cadastrados = lista?.filter((i) => i.cadastrada) ?? []

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold tracking-[-0.01em] text-ink">Interessados no beta</h1>
        <p className="mt-1 text-sm text-muted">
          {lista
            ? `${pendentes.length} ${pendentes.length === 1 ? 'pedido aguardando cadastro' : 'pedidos aguardando cadastro'}`
            : 'Clínicas que pediram vaga pela aba do app'}
        </p>
      </div>

      {erro && <Aviso tom="erro">{erro}</Aviso>}
      {!lista && !erro && <Carregando>Carregando pedidos…</Carregando>}

      {lista?.length === 0 && (
        <Vazio titulo="Nenhum pedido ainda">
          Quando uma clínica sem cadastro abrir a aba do app e pedir a vaga, o pedido aparece aqui.
        </Vazio>
      )}

      {pendentes.length > 0 && (
        <ul className="flex flex-col gap-3">
          {pendentes.map((i) => (
            <Cartao key={i.companyId} interessado={i} />
          ))}
        </ul>
      )}

      {cadastrados.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer text-sm text-ink-2 select-none hover:text-ink">
            Já cadastradas ({cadastrados.length})
          </summary>
          <ul className="mt-3 flex flex-col gap-3">
            {cadastrados.map((i) => (
              <Cartao key={i.companyId} interessado={i} />
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}

function Cartao({ interessado: i }: { interessado: Interessado }) {
  const cadastrar = `/setup/clinicas/nova?${new URLSearchParams({ companyId: i.companyId, nome: i.nomeClinica })}`
  return (
    <li className="rounded-[12px] border border-line bg-surface px-5 py-4">
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-ink">{i.nomeClinica}</p>
          <p className="tnum mt-0.5 text-xs text-muted">
            {formatarTelefoneBR(i.telefone)} · pedido em {dataCurta(i.pedidoEm)}
            {i.atualizadoEm !== i.pedidoEm && ` · atualizado em ${dataCurta(i.atualizadoEm)}`}
          </p>
          <p className="tnum mt-0.5 truncate font-mono text-[11px] text-muted">{i.companyId}</p>
        </div>
        <div className="flex items-center gap-2">
          {i.sistemaProntuario === 'outro' ? (
            <Estado tom="atencao">○ {NOME_DO_SISTEMA.outro}</Estado>
          ) : (
            <Estado tom="neutro">{NOME_DO_SISTEMA[i.sistemaProntuario]}</Estado>
          )}
          {i.cadastrada ? (
            <Estado tom="ok">● Cadastrada</Estado>
          ) : i.sistemaProntuario !== 'outro' ? (
            <Link
              href={cadastrar}
              className="inline-flex h-8 items-center rounded-full bg-accent px-3.5 text-[13px] font-medium text-white hover:bg-accent-ink"
            >
              Cadastrar esta clínica
            </Link>
          ) : null}
        </div>
      </div>
      <blockquote className="mt-3 rounded-[10px] bg-sunk px-4 py-3 text-[13px] leading-relaxed whitespace-pre-wrap text-ink-2">
        {i.modeloMensagem}
      </blockquote>
      {i.sistemaProntuario === 'outro' && !i.cadastrada && (
        <p className="mt-2 text-xs text-atencao">
          Usa um prontuário que o app ainda não integra — não dá para cadastrar por enquanto.
        </p>
      )}
    </li>
  )
}
