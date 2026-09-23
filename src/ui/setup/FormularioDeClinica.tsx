'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Aviso, Botao, Carregando, Estado } from '@/ui/primitivos'
import { FUSOS_SUPORTADOS } from '@/shared/data/fuso'
import { chamarApi, NOME_DO_FUSO, NOME_DO_SISTEMA, type ClinicaNoSetup } from './api'
import { Campo, CampoSecreto, Escolha, Secao } from './campos'

// Cadastro e edição de uma clínica.
//
// Os tokens são só de escrita: a API nunca os devolve, então os campos de
// segredo começam vazios na edição e, vazios, mantêm o valor salvo. Os campos
// que não são segredo vêm preenchidos, e apagá-los apaga o valor.

type Sistema = 'eclinica' | 'clinicorp'

interface Formulario {
  companyId: string
  nome: string
  timezone: string
  sistemaProntuario: Sistema
  eclinicaToken: string
  eclinicaBaseUrl: string
  clinicorpUsuarioApi: string
  clinicorpTokenApi: string
  clinicorpSubscriberId: string
  clinicorpBaseUrl: string
  mensageriaToken: string
  mensageriaFrom: string
  mensageriaChannelId: string
}

const EM_BRANCO: Formulario = {
  companyId: '',
  nome: '',
  timezone: 'America/Sao_Paulo',
  sistemaProntuario: 'clinicorp',
  eclinicaToken: '',
  eclinicaBaseUrl: '',
  clinicorpUsuarioApi: '',
  clinicorpTokenApi: '',
  clinicorpSubscriberId: '',
  clinicorpBaseUrl: '',
  mensageriaToken: '',
  mensageriaFrom: '',
  mensageriaChannelId: '',
}

function doSalvo(c: ClinicaNoSetup): Formulario {
  return {
    ...EM_BRANCO,
    companyId: c.companyId,
    nome: c.nome,
    timezone: c.timezone,
    sistemaProntuario: c.sistemaProntuario,
    eclinicaBaseUrl: c.eclinica.baseUrl,
    clinicorpUsuarioApi: c.clinicorp.usuarioApi ?? '',
    clinicorpSubscriberId: c.clinicorp.subscriberId ?? '',
    clinicorpBaseUrl: c.clinicorp.baseUrl,
    mensageriaFrom: c.mensageria.from ?? '',
    mensageriaChannelId: c.mensageria.channelId ?? '',
  }
}

interface ResultadoDoTeste {
  ok: boolean
  mensagem: string
}

interface ResultadoDaConexao {
  prontuario: ResultadoDoTeste
  mensageria: ResultadoDoTeste
}

export function FormularioDeClinica({ id }: { id?: string }) {
  const router = useRouter()
  const editando = !!id

  const [salva, setSalva] = useState<ClinicaNoSetup | null>(null)
  const [form, setForm] = useState<Formulario>(EM_BRANCO)
  const [erroAoCarregar, setErroAoCarregar] = useState<string | null>(null)

  const [salvando, setSalvando] = useState(false)
  const [aviso, setAviso] = useState<{ tom: 'ok' | 'erro'; texto: string } | null>(null)
  const [testando, setTestando] = useState(false)
  const [teste, setTeste] = useState<ResultadoDaConexao | null>(null)

  useEffect(() => {
    if (!id) return
    chamarApi<ClinicaNoSetup>(`/api/setup/clinicas/${id}`)
      .then((c) => {
        setSalva(c)
        setForm(doSalvo(c))
        if (new URLSearchParams(window.location.search).get('criada')) {
          setAviso({ tom: 'ok', texto: 'Clínica cadastrada.' })
        }
      })
      .catch((e: Error) => setErroAoCarregar(e.message))
  }, [id])

  function mudar<K extends keyof Formulario>(campo: K, valor: Formulario[K]) {
    setForm((f) => ({ ...f, [campo]: valor }))
    // O resultado do teste valia para os valores anteriores.
    setTeste(null)
    setAviso(null)
  }

  async function testar() {
    setTestando(true)
    setTeste(null)
    setAviso(null)
    try {
      setTeste(
        await chamarApi<ResultadoDaConexao>('/api/setup/conexao', {
          method: 'POST',
          body: JSON.stringify({ ...form, id }),
        })
      )
    } catch (e) {
      setAviso({ tom: 'erro', texto: (e as Error).message })
    }
    setTestando(false)
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    setSalvando(true)
    setAviso(null)
    try {
      if (editando) {
        const atualizada = await chamarApi<ClinicaNoSetup>(`/api/setup/clinicas/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(form),
        })
        setSalva(atualizada)
        // Os segredos digitados foram gravados; limpar os campos devolve o
        // estado "configurado — em branco mantém".
        setForm(doSalvo(atualizada))
        setAviso({ tom: 'ok', texto: 'Alterações salvas.' })
      } else {
        const criada = await chamarApi<ClinicaNoSetup>('/api/setup/clinicas', {
          method: 'POST',
          body: JSON.stringify(form),
        })
        router.replace(`/setup/clinicas/${criada.id}?criada=1`)
        return
      }
    } catch (e) {
      setAviso({ tom: 'erro', texto: (e as Error).message })
    }
    setSalvando(false)
  }

  if (erroAoCarregar) {
    return (
      <div className="flex flex-col gap-4">
        <Voltar />
        <Aviso tom="erro">{erroAoCarregar}</Aviso>
      </div>
    )
  }
  if (editando && !salva) return <Carregando>Carregando clínica…</Carregando>

  // `null` no cadastro: não há valor salvo para "manter".
  const configurado = (v: boolean | undefined) => (salva ? !!v : null)

  return (
    <form onSubmit={salvar} className="flex flex-col gap-5 pb-24">
      <div>
        <Voltar />
        <h1 className="mt-3 text-xl font-semibold tracking-[-0.01em] text-ink">
          {editando ? salva!.nome : 'Nova clínica'}
        </h1>
        {editando && (
          <p className="tnum mt-1 font-mono text-xs text-muted">{salva!.companyId}</p>
        )}
      </div>

      <Secao titulo="Identificação">
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo
            rotulo="Nome da clínica"
            required
            value={form.nome}
            onChange={(e) => mudar('nome', e.target.value)}
          />
          <Escolha
            rotulo="Fuso horário"
            valor={form.timezone}
            opcoes={FUSOS_SUPORTADOS.map((f) => ({ valor: f, rotulo: NOME_DO_FUSO[f] ?? f }))}
            aoMudar={(v) => mudar('timezone', v)}
          />
        </div>
        <Campo
          rotulo="Company ID da plataforma de mensagens"
          required={!editando}
          readOnly={editando}
          spellCheck={false}
          mono
          placeholder="7b1a1c2e-3d4f-4a5b-8c6d-0e1f2a3b4c5d"
          value={form.companyId}
          onChange={(e) => mudar('companyId', e.target.value)}
          dica={
            editando
              ? 'Não pode ser alterado: é a chave dos links já emitidos. Com valor errado, cadastre a clínica de novo.'
              : 'UUID da conta da clínica na plataforma. É o que liga a aba da plataforma a este cadastro.'
          }
        />
      </Secao>

      <Secao
        titulo="Prontuário"
        descricao="De onde vêm os aniversariantes. A e-Clínica é consultada ao vivo; a Clinicorp, por uma sincronização diária."
      >
        <Escolha<Sistema>
          rotulo="Sistema"
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
              configurado={configurado(salva?.clinicorp.tokenConfigurado)}
              valor={form.clinicorpTokenApi}
              aoMudar={(v) => mudar('clinicorpTokenApi', v)}
            />
          </>
        ) : (
          <CampoSecreto
            rotulo="Token da e-Clínica"
            obrigatorio
            configurado={configurado(salva?.eclinica.tokenConfigurado)}
            valor={form.eclinicaToken}
            aoMudar={(v) => mudar('eclinicaToken', v)}
          />
        )}

        <details className="group text-sm">
          <summary className="cursor-pointer select-none text-[13px] text-ink-2 hover:text-ink">
            Avançado: endereço da API
          </summary>
          <div className="mt-3">
            {form.sistemaProntuario === 'clinicorp' ? (
              <Campo
                rotulo="URL da API da Clinicorp"
                spellCheck={false}
                placeholder="https://api.clinicorp.com/rest/v1"
                value={form.clinicorpBaseUrl}
                onChange={(e) => mudar('clinicorpBaseUrl', e.target.value)}
                dica="Em branco volta ao endereço padrão."
              />
            ) : (
              <Campo
                rotulo="URL da API da e-Clínica"
                spellCheck={false}
                placeholder="https://eclinica.app/api/v2"
                value={form.eclinicaBaseUrl}
                onChange={(e) => mudar('eclinicaBaseUrl', e.target.value)}
                dica="Em branco volta ao endereço padrão."
              />
            )}
          </div>
        </details>
      </Secao>

      <Secao
        titulo="Plataforma de mensagens"
        descricao="A conta que agenda e envia os parabéns pelo WhatsApp da clínica."
      >
        <CampoSecreto
          rotulo="Token de acesso"
          obrigatorio
          configurado={configurado(salva?.mensageria.tokenConfigurado)}
          valor={form.mensageriaToken}
          aoMudar={(v) => mudar('mensageriaToken', v)}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo
            rotulo="Número remetente (opcional)"
            inputMode="tel"
            placeholder="5545999990000"
            value={form.mensageriaFrom}
            onChange={(e) => mudar('mensageriaFrom', e.target.value)}
          />
          <Campo
            rotulo="Channel ID (opcional)"
            spellCheck={false}
            value={form.mensageriaChannelId}
            onChange={(e) => mudar('mensageriaChannelId', e.target.value)}
          />
        </div>
      </Secao>

      {teste && <ResultadoDoTesteDeConexao teste={teste} />}

      {editando && <LinkDoPainel id={id!} />}

      <div className="fixed inset-x-0 bottom-0 border-t border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-4xl items-center gap-3 px-6 py-3">
          {aviso && (
            <p role="status" className={aviso.tom === 'ok' ? 'text-sm text-ok' : 'text-sm text-erro'}>
              {aviso.texto}
            </p>
          )}
          <div className="ml-auto flex gap-2">
            <Botao type="button" variante="secundario" onClick={testar} disabled={testando || salvando}>
              {testando ? 'Testando…' : 'Testar conexão'}
            </Botao>
            <Botao type="submit" disabled={salvando}>
              {salvando ? 'Salvando…' : editando ? 'Salvar' : 'Cadastrar clínica'}
            </Botao>
          </div>
        </div>
      </div>
    </form>
  )
}

function Voltar() {
  return (
    <Link href="/setup" className="text-sm text-ink-2 hover:text-ink">
      ← Clínicas
    </Link>
  )
}

function ResultadoDoTesteDeConexao({ teste }: { teste: ResultadoDaConexao }) {
  const linhas = [
    { rotulo: 'Prontuário', ...teste.prontuario },
    { rotulo: 'Plataforma de mensagens', ...teste.mensageria },
  ]
  return (
    <section aria-live="polite" className="rounded-[12px] border border-line bg-surface px-5 py-4">
      <h2 className="text-[15px] font-semibold text-ink">Teste de conexão</h2>
      <p className="mt-0.5 text-[13px] text-muted">Com os valores do formulário — nada foi salvo.</p>
      <ul className="mt-3 flex flex-col gap-2.5">
        {linhas.map((l) => (
          <li key={l.rotulo} className="flex flex-wrap items-start gap-x-3 gap-y-1">
            <span className="w-48 shrink-0 text-sm text-ink-2">{l.rotulo}</span>
            <Estado tom={l.ok ? 'ok' : 'erro'}>{l.ok ? '● Conectado' : '○ Falhou'}</Estado>
            <span className="min-w-0 flex-1 text-sm text-ink">{l.mensagem}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

const VALIDADES = [
  { valor: 'sem', rotulo: 'Sem expiração (aba fixa da plataforma)' },
  { valor: '30d', rotulo: '30 dias' },
  { valor: '7d', rotulo: '7 dias' },
  { valor: '24h', rotulo: '24 horas' },
] as const

type Validade = (typeof VALIDADES)[number]['valor']

function LinkDoPainel({ id }: { id: string }) {
  const [validade, setValidade] = useState<Validade>('7d')
  const [gerando, setGerando] = useState(false)
  const [link, setLink] = useState<{ url: string; expiraEm: string | null } | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [copiado, setCopiado] = useState(false)

  async function gerar() {
    setGerando(true)
    setErro(null)
    setCopiado(false)
    try {
      setLink(
        await chamarApi<{ url: string; expiraEm: string | null }>(`/api/setup/clinicas/${id}/link`, {
          method: 'POST',
          body: JSON.stringify({ validade }),
        })
      )
    } catch (e) {
      setErro((e as Error).message)
    }
    setGerando(false)
  }

  async function copiar() {
    if (!link) return
    await navigator.clipboard.writeText(link.url)
    setCopiado(true)
  }

  return (
    <Secao
      titulo="Link de acesso do painel"
      descricao="Link assinado que abre o painel desta clínica. Quem tiver o link entra, até ele expirar."
    >
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-56 flex-1">
          <Escolha<Validade>
            rotulo="Validade"
            valor={validade}
            opcoes={VALIDADES.map((v) => ({ valor: v.valor, rotulo: v.rotulo }))}
            aoMudar={(v) => {
              setValidade(v)
              setLink(null)
            }}
          />
        </div>
        <Botao type="button" variante="discreto" onClick={gerar} disabled={gerando}>
          {gerando ? 'Gerando…' : 'Gerar link'}
        </Botao>
      </div>

      {validade === 'sem' && (
        <Aviso tom="atencao">
          Um link sem expiração não pode ser revogado sozinho: invalidá-lo exige trocar o LINK_SECRET, o que
          derruba os links de todas as clínicas. Use só para a aba fixa da plataforma.
        </Aviso>
      )}

      {erro && <Aviso tom="erro">{erro}</Aviso>}

      {link && (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <input
              readOnly
              value={link.url}
              onFocus={(e) => e.target.select()}
              className="h-10 min-w-0 flex-1 rounded-lg border border-line bg-sunk px-3 font-mono text-xs text-ink-2"
            />
            <Botao type="button" variante="secundario" onClick={copiar}>
              {copiado ? 'Copiado' : 'Copiar'}
            </Botao>
          </div>
          <p className="text-xs text-muted">
            {link.expiraEm
              ? `Expira em ${new Date(link.expiraEm).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}.`
              : 'Não expira.'}
          </p>
        </div>
      )}
    </Secao>
  )
}
