'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Aviso, Carregando, Estado, Vazio } from '@/ui/primitivos'
import { chamarApi, NOME_DO_SISTEMA, prontuarioCompleto, type ClinicaNoSetup } from './api'

// A lista de clínicas da área de setup. O que importa numa olhada é QUAL
// clínica está com integração incompleta — por isso o estado das credenciais
// fica na própria linha, sem precisar abrir cada uma.
//
// Com o cadastro comum ligado, a lista é a das clínicas com os Aniversariantes
// ligados no setup do CRM, e clínica nova se cadastra lá.

export function ListaDeClinicas() {
  const [clinicas, setClinicas] = useState<ClinicaNoSetup[] | null>(null)
  const [cadastroComum, setCadastroComum] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    chamarApi<{ clinicas: ClinicaNoSetup[]; cadastroComum?: boolean }>('/api/setup/clinicas')
      .then((r) => {
        setClinicas(r.clinicas)
        setCadastroComum(!!r.cadastroComum)
      })
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
        {/* Escondido só enquanto carrega, para não piscar com o cadastro comum
            ligado. Com erro ao carregar, aparece como antes: ligado, a página de
            nova clínica explica, do servidor, que o cadastro é no CRM. */}
        {(clinicas || erro) && !cadastroComum && (
          <Link
            href="/setup/clinicas/nova"
            className="botao-marca inline-flex h-10 items-center rounded-[10px] px-4 text-sm font-medium"
          >
            Nova clínica
          </Link>
        )}
      </div>

      {cadastroComum && (
        <Aviso tom="neutro" titulo="Cadastro comum dos produtos">
          As clínicas, as unidades, o prontuário e o remetente vêm do setup do CRM e se editam lá. Aparece aqui a
          clínica com os Aniversariantes ligados no CRM. Os modelos de mensagem continuam no painel de cada clínica.
        </Aviso>
      )}

      {erro && <Aviso tom="erro">{erro}</Aviso>}
      {!clinicas && !erro && <Carregando>Carregando clínicas…</Carregando>}

      {clinicas?.length === 0 && (
        <Vazio titulo="Nenhuma clínica cadastrada">
          {cadastroComum
            ? 'Ligue os Aniversariantes numa clínica, no setup do CRM, para liberar o painel para ela.'
            : 'Cadastre a primeira para liberar o painel de aniversariantes para ela.'}
        </Vazio>
      )}

      {clinicas && clinicas.length > 0 && (
        <ul className="entrar overflow-hidden rounded-[14px] border border-line-soft bg-surface">
          {clinicas.map((c) => (
            <li key={c.id} className="border-b border-line-soft last:border-b-0">
              <Link
                href={`/setup/clinicas/${c.id}`}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4 transition-colors hover:bg-ground"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{c.nome}</p>
                  <p className="tnum mt-0.5 truncate font-mono text-xs text-muted">{c.companyId}</p>
                  {c.unidades.length > 1 && (
                    <p className="mt-0.5 text-xs text-ink-2">{c.unidades.length} unidades</p>
                  )}
                </div>
                <span className="text-[13px] text-ink-2">
                  {c.sistemaProntuario ? NOME_DO_SISTEMA[c.sistemaProntuario] : 'Sem prontuário'}
                </span>
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
