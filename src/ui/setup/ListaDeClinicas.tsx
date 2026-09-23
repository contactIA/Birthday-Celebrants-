'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Aviso, Carregando, Estado, Vazio } from '@/ui/primitivos'
import { chamarApi, NOME_DO_SISTEMA, prontuarioCompleto, type ClinicaNoSetup } from './api'

// A lista de clínicas da área de setup. O que importa numa olhada é QUAL
// clínica está com integração incompleta — por isso o estado das credenciais
// fica na própria linha, sem precisar abrir cada uma.

export function ListaDeClinicas() {
  const [clinicas, setClinicas] = useState<ClinicaNoSetup[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    chamarApi<{ clinicas: ClinicaNoSetup[] }>('/api/setup/clinicas')
      .then((r) => setClinicas(r.clinicas))
      .catch((e: Error) => setErro(e.message))
  }, [])

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-[-0.01em] text-ink">Clínicas</h1>
          <p className="mt-1 text-sm text-muted">
            {clinicas
              ? `${clinicas.length} ${clinicas.length === 1 ? 'clínica cadastrada' : 'clínicas cadastradas'}`
              : 'Cadastro e credenciais de integração'}
          </p>
        </div>
        <Link
          href="/setup/clinicas/nova"
          className="inline-flex h-10 items-center rounded-full bg-accent px-5 text-sm font-medium text-white hover:bg-accent-ink"
        >
          Nova clínica
        </Link>
      </div>

      {erro && <Aviso tom="erro">{erro}</Aviso>}
      {!clinicas && !erro && <Carregando>Carregando clínicas…</Carregando>}

      {clinicas?.length === 0 && (
        <Vazio titulo="Nenhuma clínica cadastrada">
          Cadastre a primeira para liberar o painel de aniversariantes para ela.
        </Vazio>
      )}

      {clinicas && clinicas.length > 0 && (
        <ul className="overflow-hidden rounded-[12px] border border-line bg-surface">
          {clinicas.map((c) => (
            <li key={c.id} className="border-b border-line-soft last:border-b-0">
              <Link
                href={`/setup/clinicas/${c.id}`}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4 transition-colors hover:bg-ground"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{c.nome}</p>
                  <p className="tnum mt-0.5 truncate font-mono text-xs text-muted">{c.companyId}</p>
                </div>
                <span className="text-[13px] text-ink-2">{NOME_DO_SISTEMA[c.sistemaProntuario]}</span>
                <div className="flex gap-1.5">
                  {prontuarioCompleto(c) ? (
                    <Estado tom="ok">● Prontuário</Estado>
                  ) : (
                    <Estado tom="erro">○ Prontuário incompleto</Estado>
                  )}
                  {c.mensageria.tokenConfigurado ? (
                    <Estado tom="ok">● Mensagens</Estado>
                  ) : (
                    <Estado tom="erro">○ Mensagens</Estado>
                  )}
                </div>
                <span aria-hidden className="text-muted">
                  ›
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
