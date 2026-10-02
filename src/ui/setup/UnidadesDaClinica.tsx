'use client'

import { useState } from 'react'
import { Aviso, Botao } from '@/ui/primitivos'
import { chamarApi, NOME_DO_SISTEMA, type ClinicaNoSetup, type UnidadeNoSetup } from './api'
import { Campo, CampoSecreto, Escolha, Secao } from './campos'
import { EscolhaDeCanal } from './EscolhaDeCanal'
import { ResultadoDoTesteDeConexao, Sincronizacao, type ResultadoDaConexao } from './FormularioDeClinica'

// As unidades de uma clínica na área de setup.
//
// Uma clínica (um company_id, um token de mensagens) pode ter várias unidades,
// cada uma com prontuário e número remetente próprios. A PRINCIPAL é a própria
// clínica: suas credenciais são as do formulário acima, e aqui só o nome se
// edita. As demais têm formulário completo.

type Sistema = 'eclinica' | 'clinicorp'

interface FormularioDaUnidade {
  nome: string
  sistemaProntuario: Sistema
  eclinicaToken: string
  eclinicaBaseUrl: string
  clinicorpUsuarioApi: string
  clinicorpTokenApi: string
  clinicorpSubscriberId: string
  clinicorpBaseUrl: string
  mensageriaFrom: string
  mensageriaChannelId: string
  mensageriaEquipeId: string
}

const EM_BRANCO: FormularioDaUnidade = {
  nome: '',
  sistemaProntuario: 'clinicorp',
  eclinicaToken: '',
  eclinicaBaseUrl: '',
  clinicorpUsuarioApi: '',
  clinicorpTokenApi: '',
  clinicorpSubscriberId: '',
  clinicorpBaseUrl: '',
  mensageriaFrom: '',
  mensageriaChannelId: '',
  mensageriaEquipeId: '',
}

function doSalvo(u: UnidadeNoSetup): FormularioDaUnidade {
  return {
    ...EM_BRANCO,
    nome: u.nome,
    sistemaProntuario: u.sistemaProntuario,
    eclinicaBaseUrl: u.eclinica.baseUrl,
    clinicorpUsuarioApi: u.clinicorp.usuarioApi ?? '',
    clinicorpSubscriberId: u.clinicorp.subscriberId ?? '',
    clinicorpBaseUrl: u.clinicorp.baseUrl,
    mensageriaFrom: u.mensageria.from ?? '',
    mensageriaChannelId: u.mensageria.channelId ?? '',
    mensageriaEquipeId: u.mensageria.equipeId ?? '',
  }
}

export function UnidadesDaClinica({
  clinica,
  aoMudar,
}: {
  clinica: ClinicaNoSetup
  aoMudar: (c: ClinicaNoSetup) => void
}) {
  const [adicionando, setAdicionando] = useState(false)

  return (
    <Secao
      titulo="Unidades"
      descricao="Cada unidade tem prontuário, número remetente, pacientes e modelos próprios. O token da plataforma de mensagens é o da clínica. O painel só mostra o seletor de unidade quando há mais de uma."
    >
      <ul className="flex flex-col gap-3">
        {clinica.unidades.map((u) => (
          <li key={u.id} className="rounded-[10px] border border-line-soft">
            <Unidade clinicaId={clinica.id} unidade={u} aoMudar={aoMudar} />
          </li>
        ))}
      </ul>

      {adicionando ? (
        <div className="rounded-[10px] border border-line-soft">
          <NovaUnidade
            clinicaId={clinica.id}
            aoCriar={(c) => {
              aoMudar(c)
              setAdicionando(false)
            }}
            aoCancelar={() => setAdicionando(false)}
          />
        </div>
      ) : (
        <div>
          <Botao type="button" variante="secundario" onClick={() => setAdicionando(true)}>
            Adicionar unidade
          </Botao>
        </div>
      )}
    </Secao>
  )
}

function Resumo({ u }: { u: UnidadeNoSetup }) {
  return (
    <span className="min-w-0 flex-1 truncate">
      <span className="font-medium text-ink">{u.nome}</span>{' '}
      <span className="text-[13px] text-muted">
        · {NOME_DO_SISTEMA[u.sistemaProntuario]}
        {u.principal ? ' · principal' : ''}
      </span>
    </span>
  )
}

function Unidade({
  clinicaId,
  unidade,
  aoMudar,
}: {
  clinicaId: string
  unidade: UnidadeNoSetup
  aoMudar: (c: ClinicaNoSetup) => void
}) {
  const [aberta, setAberta] = useState(false)

  return (
    <div>
      <button
        type="button"
        onClick={() => setAberta((a) => !a)}
        aria-expanded={aberta}
        className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm"
      >
        <Resumo u={unidade} />
        <span className="shrink-0 text-[13px] text-ink-2">{aberta ? 'Fechar' : 'Editar'}</span>
      </button>
      {aberta && (
        <div className="border-t border-line-soft px-4 py-4">
          <FormularioDeUnidade
            clinicaId={clinicaId}
            unidade={unidade}
            aoSalvar={aoMudar}
            aoRemover={aoMudar}
          />
        </div>
      )}
    </div>
  )
}

function NovaUnidade({
  clinicaId,
  aoCriar,
  aoCancelar,
}: {
  clinicaId: string
  aoCriar: (c: ClinicaNoSetup) => void
  aoCancelar: () => void
}) {
  return (
    <div className="px-4 py-4">
      <p className="mb-3 text-sm font-medium text-ink">Nova unidade</p>
      <FormularioDeUnidade clinicaId={clinicaId} unidade={null} aoSalvar={aoCriar} aoCancelar={aoCancelar} />
    </div>
  )
}

function FormularioDeUnidade({
  clinicaId,
  unidade,
  aoSalvar,
  aoRemover,
  aoCancelar,
}: {
  clinicaId: string
  /** `null` = cadastro. */
  unidade: UnidadeNoSetup | null
  aoSalvar: (c: ClinicaNoSetup) => void
  aoRemover?: (c: ClinicaNoSetup) => void
  aoCancelar?: () => void
}) {
  const principal = unidade?.principal ?? false
  const [form, setForm] = useState<FormularioDaUnidade>(() => (unidade ? doSalvo(unidade) : EM_BRANCO))
  const [salvando, setSalvando] = useState(false)
  const [testando, setTestando] = useState(false)
  const [teste, setTeste] = useState<ResultadoDaConexao | null>(null)
  const [aviso, setAviso] = useState<{ tom: 'ok' | 'erro'; texto: string } | null>(null)
  const [confirmandoRemocao, setConfirmandoRemocao] = useState(false)

  const base = `/api/setup/clinicas/${clinicaId}/unidades`

  function mudar<K extends keyof FormularioDaUnidade>(campo: K, valor: FormularioDaUnidade[K]) {
    setForm((f) => ({ ...f, [campo]: valor }))
    setTeste(null)
    setAviso(null)
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    setSalvando(true)
    setAviso(null)
    try {
      const salva = await chamarApi<ClinicaNoSetup>(unidade ? `${base}/${unidade.id}` : base, {
        method: unidade ? 'PATCH' : 'POST',
        body: JSON.stringify(form),
      })
      aoSalvar(salva)
      if (unidade) {
        // Os segredos digitados foram gravados: volta ao estado "configurado".
        const atual = salva.unidades.find((u) => u.id === unidade.id)
        if (atual) setForm(doSalvo(atual))
        setAviso({ tom: 'ok', texto: 'Unidade salva.' })
      }
    } catch (err) {
      setAviso({ tom: 'erro', texto: (err as Error).message })
    }
    setSalvando(false)
  }

  async function testar() {
    setTestando(true)
    setTeste(null)
    setAviso(null)
    try {
      setTeste(
        await chamarApi<ResultadoDaConexao>(`${base}/conexao`, {
          method: 'POST',
          body: JSON.stringify({ ...form, unidadeId: unidade?.id }),
        })
      )
    } catch (err) {
      setAviso({ tom: 'erro', texto: (err as Error).message })
    }
    setTestando(false)
  }

  async function remover() {
    if (!unidade) return
    setSalvando(true)
    setAviso(null)
    try {
      aoRemover?.(await chamarApi<ClinicaNoSetup>(`${base}/${unidade.id}`, { method: 'DELETE' }))
    } catch (err) {
      setAviso({ tom: 'erro', texto: (err as Error).message })
      setConfirmandoRemocao(false)
      setSalvando(false)
    }
  }

  // `null` no cadastro: não há valor salvo para "manter".
  const configurado = (v: boolean | undefined) => (unidade ? !!v : null)

  return (
    <form onSubmit={salvar} className="flex flex-col gap-4">
      <Campo
        rotulo="Nome da unidade"
        required
        value={form.nome}
        onChange={(e) => mudar('nome', e.target.value)}
        placeholder="Ex.: Unidade Centro"
      />

      {principal ? (
        <p className="text-[13px] leading-relaxed text-muted">
          A unidade principal usa o prontuário e o número remetente da clínica, editados nas seções acima.
        </p>
      ) : (
        <>
          <Escolha<Sistema>
            rotulo="Sistema de prontuário"
            valor={form.sistemaProntuario}
            opcoes={[
              { valor: 'clinicorp', rotulo: NOME_DO_SISTEMA.clinicorp },
              { valor: 'eclinica', rotulo: NOME_DO_SISTEMA.eclinica },
            ]}
            aoMudar={(v) => mudar('sistemaProntuario', v)}
          />

          {form.sistemaProntuario === 'clinicorp' ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <Campo
                  rotulo="Usuário API"
                  spellCheck={false}
                  autoComplete="off"
                  value={form.clinicorpUsuarioApi}
                  onChange={(e) => mudar('clinicorpUsuarioApi', e.target.value)}
                />
                <Campo
                  rotulo="Subscriber ID"
                  spellCheck={false}
                  autoComplete="off"
                  value={form.clinicorpSubscriberId}
                  onChange={(e) => mudar('clinicorpSubscriberId', e.target.value)}
                />
              </div>
              <CampoSecreto
                rotulo="Token API"
                obrigatorio
                configurado={configurado(unidade?.clinicorp.tokenConfigurado)}
                valor={form.clinicorpTokenApi}
                aoMudar={(v) => mudar('clinicorpTokenApi', v)}
              />
            </>
          ) : (
            <CampoSecreto
              rotulo="Token da e-Clínica"
              obrigatorio
              configurado={configurado(unidade?.eclinica.tokenConfigurado)}
              valor={form.eclinicaToken}
              aoMudar={(v) => mudar('eclinicaToken', v)}
            />
          )}

          <EscolhaDeCanal
            clinicaId={clinicaId}
            tokenDigitado=""
            valor={{ from: form.mensageriaFrom, channelId: form.mensageriaChannelId, equipeId: form.mensageriaEquipeId }}
            aoMudar={(v) => {
              mudar('mensageriaFrom', v.from)
              mudar('mensageriaChannelId', v.channelId)
              mudar('mensageriaEquipeId', v.equipeId)
            }}
            semCanal="Nenhum canal escolhido: vale o canal da conta — que não é o da clínica principal."
          />
        </>
      )}

      {teste && <ResultadoDoTesteDeConexao teste={teste} />}

      {unidade && !principal && unidade.sistemaProntuario === 'clinicorp' && (
        <Sincronizacao id={clinicaId} unidadeId={unidade.id} />
      )}

      {aviso && (
        <p role="status" className={aviso.tom === 'ok' ? 'text-sm text-ok' : 'text-sm text-erro'}>
          {aviso.texto}
        </p>
      )}

      {confirmandoRemocao && (
        <Aviso tom="atencao" titulo="Remover esta unidade?">
          Os modelos e o cache de pacientes dela são apagados. Só é possível se ela não tiver envios no histórico.
          <div className="mt-3 flex gap-2">
            <Botao type="button" variante="secundario" onClick={remover} disabled={salvando}>
              Remover
            </Botao>
            <Botao type="button" variante="discreto" onClick={() => setConfirmandoRemocao(false)}>
              Cancelar
            </Botao>
          </div>
        </Aviso>
      )}

      <div className="flex flex-wrap gap-2">
        {!principal && (
          <Botao type="button" variante="secundario" onClick={testar} disabled={testando || salvando}>
            {testando ? 'Testando…' : 'Testar conexão'}
          </Botao>
        )}
        <Botao type="submit" disabled={salvando}>
          {salvando ? 'Salvando…' : unidade ? 'Salvar unidade' : 'Cadastrar unidade'}
        </Botao>
        {aoCancelar && (
          <Botao type="button" variante="discreto" onClick={aoCancelar}>
            Cancelar
          </Botao>
        )}
        {unidade && !principal && !confirmandoRemocao && (
          <Botao type="button" variante="discreto" onClick={() => setConfirmandoRemocao(true)} className="ml-auto">
            Remover
          </Botao>
        )}
      </div>
    </form>
  )
}
