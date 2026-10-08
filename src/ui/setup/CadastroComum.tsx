'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Aviso, Botao, Estado } from '@/ui/primitivos'
import { formatarTelefoneBR } from '@/shared/telefone/e164'
import { chamarApi, NOME_DO_FUSO, NOME_DO_SISTEMA, type ClinicaNoSetup, type UnidadeNoSetup } from './api'
import { Secao } from './campos'
import {
  LinkDoPainel,
  ResultadoDoTesteDeConexao,
  Sincronizacao,
  type ResultadoDaConexao,
} from './FormularioDeClinica'

// A clínica na área de setup quando a leitura pelo cadastro comum está ligada
// (CADASTRO_UNIFICADO, ADR 0005): os campos do cadastro aparecem só para
// leitura, com o aviso de que se editam no setup do CRM. Seguem aqui o que é
// deste app: testar a conexão, sincronizar a Clinicorp e gerar o link do painel.
// Os modelos de mensagem continuam no painel da clínica.

const AVISO_DO_CADASTRO =
  'O nome, o fuso, as unidades, o prontuário, o remetente e o campo da data de nascimento vêm do cadastro comum dos produtos e se editam no setup do CRM. Aqui ficam só para leitura.'

const MOTIVO = { inativa: 'unidade inativa', sem_prontuario: 'sem prontuário configurado' } as const

function Linha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <dt className="w-48 shrink-0 text-[13px] font-medium text-ink-2">{rotulo}</dt>
      <dd className="min-w-0 flex-1 text-sm break-words text-ink">{children}</dd>
    </div>
  )
}

function Configurado({ sim }: { sim: boolean }) {
  return sim ? <Estado tom="ok">● Configurado</Estado> : <Estado tom="erro">○ Não configurado</Estado>
}

function Voltar() {
  return (
    <Link href="/setup" className="text-sm text-ink-2 hover:text-ink">
      ← Clínicas
    </Link>
  )
}

export function ClinicaDoCadastroComum({ clinica }: { clinica: ClinicaNoSetup }) {
  return (
    <div className="flex flex-col gap-5 pb-12">
      <div>
        <Voltar />
        <h1 className="mt-3 text-xl font-semibold tracking-[-0.01em] text-ink">{clinica.nome}</h1>
        <p className="tnum mt-1 font-mono text-xs text-muted">{clinica.companyId}</p>
      </div>

      <Aviso tom="neutro" titulo="Cadastro comum dos produtos">
        {AVISO_DO_CADASTRO} Os modelos de mensagem continuam no painel da clínica.
      </Aviso>

      <Secao titulo="Identificação">
        <dl className="flex flex-col gap-3">
          <Linha rotulo="Nome da clínica">{clinica.nome}</Linha>
          <Linha rotulo="Fuso horário">{NOME_DO_FUSO[clinica.timezone] ?? clinica.timezone}</Linha>
          <Linha rotulo="Company ID">
            <span className="font-mono text-xs">{clinica.companyId}</span>
          </Linha>
        </dl>
      </Secao>

      <Secao titulo="Plataforma de mensagens" descricao="A conta que agenda e envia os parabéns pelo WhatsApp da clínica.">
        <dl className="flex flex-col gap-3">
          <Linha rotulo="Token de acesso">
            <Configurado sim={clinica.mensageria.tokenConfigurado} />
          </Linha>
          <Linha rotulo="Data de nascimento no contato">
            {clinica.mensageria.campoNascimento ? (
              <span className="font-mono text-xs">{clinica.mensageria.campoNascimento}</span>
            ) : (
              'Nenhum campo: não preencher o nascimento'
            )}
          </Linha>
        </dl>
      </Secao>

      <Secao
        titulo="Unidades"
        descricao="Cada unidade tem prontuário, número remetente, pacientes e modelos próprios. O painel só mostra o seletor de unidade quando há mais de uma."
      >
        {clinica.unidades.length === 0 && (
          <Aviso tom="atencao" titulo="Nenhuma unidade no painel">
            Nenhuma unidade ativa desta clínica tem o prontuário configurado, e o painel não abre sem ele. Configure o
            prontuário de uma unidade no setup do CRM.
          </Aviso>
        )}
        <ul className="flex flex-col gap-3">
          {clinica.unidades.map((u) => (
            <li key={u.id} className="rounded-[10px] border border-line-soft px-4 py-4">
              <UnidadeSomenteLeitura clinicaId={clinica.id} unidade={u} />
            </li>
          ))}
        </ul>
        {clinica.foraDoPainel.length > 0 && (
          <div className="text-[13px] leading-relaxed text-muted">
            <p className="font-medium text-ink-2">Fora do painel</p>
            <ul className="mt-1 list-inside list-disc">
              {clinica.foraDoPainel.map((u, i) => (
                <li key={`${u.nome}-${i}`}>
                  {u.nome}: {MOTIVO[u.motivo]}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Secao>

      <LinkDoPainel id={clinica.id} />
    </div>
  )
}

function UnidadeSomenteLeitura({ clinicaId, unidade: u }: { clinicaId: string; unidade: UnidadeNoSetup }) {
  const [testando, setTestando] = useState(false)
  const [teste, setTeste] = useState<ResultadoDaConexao | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  async function testar() {
    setTestando(true)
    setTeste(null)
    setErro(null)
    try {
      setTeste(
        await chamarApi<ResultadoDaConexao>(`/api/setup/clinicas/${clinicaId}/unidades/conexao`, {
          method: 'POST',
          body: JSON.stringify({ unidadeId: u.id }),
        })
      )
    } catch (e) {
      setErro((e as Error).message)
    }
    setTestando(false)
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm">
        <span className="font-medium text-ink">{u.nome}</span>{' '}
        <span className="text-[13px] text-muted">
          · {NOME_DO_SISTEMA[u.sistemaProntuario]}
          {u.principal ? ' · principal' : ''}
        </span>
      </p>

      {u.credenciaisIlegiveis && (
        <Aviso tom="erro" titulo="As credenciais do prontuário não abriram">
          A chave do cadastro deste servidor (CADASTRO_CHAVE_CIFRAGEM) não abre as credenciais desta unidade. Confira se
          ela é a mesma do CRM.
        </Aviso>
      )}

      <dl className="flex flex-col gap-3">
        {u.sistemaProntuario === 'clinicorp' ? (
          <>
            <Linha rotulo="Usuário API">{u.clinicorp.usuarioApi ?? 'Não informado'}</Linha>
            <Linha rotulo="Subscriber ID">{u.clinicorp.subscriberId ?? 'Não informado'}</Linha>
            <Linha rotulo="Token API">
              <Configurado sim={u.clinicorp.tokenConfigurado} />
            </Linha>
            <Linha rotulo="URL da API">
              <span className="font-mono text-xs">{u.clinicorp.baseUrl}</span>
            </Linha>
          </>
        ) : (
          <>
            <Linha rotulo="Token da e-Clínica">
              <Configurado sim={u.eclinica.tokenConfigurado} />
            </Linha>
            <Linha rotulo="URL da API">
              <span className="font-mono text-xs">{u.eclinica.baseUrl}</span>
            </Linha>
          </>
        )}
        <Linha rotulo="Número remetente">
          {u.mensageria.from
            ? formatarTelefoneBR(u.mensageria.from)
            : 'Nenhum canal escolhido: vale o canal da conta, pela equipe padrão.'}
        </Linha>
        {u.mensageria.from && (
          <Linha rotulo="Equipe que agenda">
            {u.mensageria.equipeId ? (
              <span className="font-mono text-xs">{u.mensageria.equipeId}</span>
            ) : (
              'A equipe padrão da conta'
            )}
          </Linha>
        )}
      </dl>

      {teste && <ResultadoDoTesteDeConexao teste={teste} />}
      {erro && <Aviso tom="erro">{erro}</Aviso>}

      <div>
        <Botao type="button" variante="secundario" onClick={testar} disabled={testando || !!u.credenciaisIlegiveis}>
          {testando ? 'Testando…' : 'Testar conexão'}
        </Botao>
      </div>

      {u.sistemaProntuario === 'clinicorp' && !u.credenciaisIlegiveis && (
        <Sincronizacao id={clinicaId} unidadeId={u.id} />
      )}
    </div>
  )
}

/** A página de nova clínica com o cadastro comum ligado: o cadastro é no CRM. */
export function NovaClinicaNoCadastroComum() {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <Voltar />
        <h1 className="mt-3 text-xl font-semibold tracking-[-0.01em] text-ink">Nova clínica</h1>
      </div>
      <Aviso tom="neutro" titulo="Clínica nova se cadastra no setup do CRM">
        Com o cadastro comum dos produtos, a clínica, as unidades, o prontuário e o remetente se cadastram no setup do
        CRM. Ligue os Aniversariantes na clínica, lá, e ela aparece na lista deste setup.
      </Aviso>
    </div>
  )
}
