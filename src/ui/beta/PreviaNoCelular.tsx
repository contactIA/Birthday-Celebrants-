import { previaDoModelo } from '@/features/entrar-na-lista/regras'

// O parabéns da clínica, chegando no celular do paciente — atualizado a cada
// tecla do formulário. É o que torna a página concreta: a clínica vê a própria
// mensagem antes de ter o app.
//
// Uma conversa genérica de celular, sem marca de aplicativo: a página é white
// label, e a clínica reconhece o formato sem precisarmos nomear ninguém.

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return '✦'
  return (partes[0]![0]! + (partes.length > 1 ? partes.at(-1)![0]! : '')).toUpperCase()
}

export function PreviaNoCelular({ nomeClinica, modelo }: { nomeClinica: string; modelo: string }) {
  const texto = previaDoModelo(modelo, nomeClinica)
  const nome = nomeClinica.trim() || 'Sua clínica'

  return (
    <figure
      aria-label="Prévia da mensagem no celular do paciente"
      className="mx-auto w-full max-w-[300px] rounded-[34px] bg-ink p-2.5 shadow-[0_30px_60px_-20px_rgb(83_37_196/0.45)]"
    >
      <div className="overflow-hidden rounded-[26px] bg-[#efeae2]">
        <div className="flex items-center gap-2.5 bg-accent px-4 pt-5 pb-3 text-white">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/20 text-[13px] font-semibold">
            {iniciais(nomeClinica)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{nome}</p>
            <p className="text-[11px] text-white/75">conta comercial</p>
          </div>
        </div>

        <div className="flex min-h-[280px] flex-col justify-end gap-2 px-3 py-4">
          <span className="mx-auto rounded-md bg-white/80 px-2 py-0.5 text-[10px] font-medium text-ink-2 uppercase">
            hoje
          </span>
          {texto.trim() ? (
            <div className="max-w-[88%] self-start rounded-2xl rounded-tl-sm bg-white px-3 py-2 shadow-sm">
              <p className="text-[13px] leading-snug whitespace-pre-wrap break-words text-ink">{texto}</p>
              <p className="mt-1 text-right text-[10px] text-muted">09:00</p>
            </div>
          ) : (
            <div className="beta-digitando flex w-14 items-center justify-center gap-1 self-start rounded-2xl rounded-tl-sm bg-white px-3 py-3 shadow-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-muted" />
              <span className="h-1.5 w-1.5 rounded-full bg-muted" />
              <span className="h-1.5 w-1.5 rounded-full bg-muted" />
            </div>
          )}
        </div>
      </div>
      <figcaption className="sr-only">
        {texto.trim() ? `Mensagem: ${texto}` : 'Escreva a mensagem para ver a prévia'}
      </figcaption>
    </figure>
  )
}
