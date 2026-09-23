'use client'

import { useState } from 'react'
import { Botao } from '@/ui/primitivos'

/**
 * Para onde voltar depois de entrar — só caminhos da própria área de setup.
 *
 * Sem esta checagem, `?volta=//site-malicioso.com` faria a tela de login
 * redirecionar para fora depois da senha certa: o golpe clássico de "entre de
 * novo" com a página real servindo de isca.
 */
function destinoSeguro(): string {
  const volta = new URLSearchParams(window.location.search).get('volta') ?? ''
  return /^\/setup(\/[\w\-/]*)?$/.test(volta) && volta !== '/setup/entrar' ? volta : '/setup'
}

export function Entrar() {
  const [senha, setSenha] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function entrar(e: React.FormEvent) {
    e.preventDefault()
    setEnviando(true)
    setErro(null)
    try {
      const resposta = await fetch('/api/setup/sessao', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ senha }),
      })
      if (resposta.ok) {
        window.location.assign(destinoSeguro())
        return
      }
      const corpo = await resposta.json().catch(() => null)
      setErro(corpo?.error ?? 'Não foi possível entrar')
      setSenha('')
    } catch {
      setErro('Sem resposta do servidor. Confira a conexão e tente de novo.')
    }
    setEnviando(false)
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-16">
      <form
        onSubmit={entrar}
        className="w-full max-w-sm rounded-[12px] border border-line bg-surface px-8 py-9"
      >
        <span className="rounded-full bg-ink px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white">
          Setup
        </span>
        <h1 className="mt-4 text-[17px] font-semibold leading-snug text-ink">Área da equipe</h1>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">
          Cadastro e credenciais das clínicas. Informe a senha de setup.
        </p>

        <label className="mt-6 flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-ink-2">Senha</span>
          <input
            type="password"
            autoComplete="current-password"
            autoFocus
            required
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            className="h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink focus:border-accent focus:outline-none"
          />
        </label>

        {erro && (
          <p role="alert" className="mt-3 text-sm text-erro">
            {erro}
          </p>
        )}

        <Botao type="submit" disabled={enviando || !senha} className="mt-6 w-full">
          {enviando ? 'Entrando…' : 'Entrar'}
        </Botao>
      </form>
    </div>
  )
}
