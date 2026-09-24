import clsx from 'clsx'
import type { EtapaDaFila, SituacaoDaTurma } from '@/features/entrar-na-lista/fila'
import type { Fila } from './PaginaBeta'

// A fila e a turma da página de beta. Os números vêm prontos da API — e ela só
// manda número real (ver features/entrar-na-lista/fila.ts). Aqui é só desenho.

const ETAPAS: { valor: EtapaDaFila; rotulo: string }[] = [
  { valor: 'recebido', rotulo: 'Pedido recebido' },
  { valor: 'em_analise', rotulo: 'Em análise' },
  { valor: 'liberada', rotulo: 'Vaga liberada' },
]

export function EtapasDaFila({ fila }: { fila: Fila }) {
  const atual = ETAPAS.findIndex((e) => e.valor === fila.etapa)

  return (
    <div className="rounded-[18px] border border-line bg-surface/90 p-5 shadow-[0_18px_40px_-28px_rgb(83_37_196/0.5)] backdrop-blur">
      <ol className="grid grid-cols-3 gap-2">
        {ETAPAS.map((e, i) => {
          // "Pedido recebido" já é etapa cumprida; o pulso fica em "Em análise"
          // só quando a equipe marca — até lá, a próxima etapa espera apagada.
          const feita = i === 0 || i < atual || fila.etapa === 'liberada'
          const agora = !feita && i === atual
          return (
            <li key={e.valor} className="relative flex flex-col items-center text-center">
              {/* Trilho até a próxima etapa */}
              {i < ETAPAS.length - 1 && (
                <span
                  aria-hidden
                  className={clsx('absolute top-3.5 left-1/2 h-0.5 w-full', i < atual ? 'bg-accent' : 'bg-line')}
                />
              )}
              <span
                className={clsx(
                  'relative grid h-7 w-7 place-items-center rounded-full text-[12px] font-bold',
                  feita && 'bg-accent text-white',
                  agora && 'fila-agora bg-vela text-vela-ink',
                  !feita && !agora && 'border-2 border-line bg-surface text-muted'
                )}
              >
                {feita ? '✓' : agora ? '●' : ''}
              </span>
              <span className={clsx('mt-2 text-[12px] leading-tight font-medium', i <= atual ? 'text-ink' : 'text-muted')}>
                {e.rotulo}
              </span>
              {agora && <span className="sr-only">(etapa atual)</span>}
            </li>
          )
        })}
      </ol>

      <p className="mt-5 border-t border-line-soft pt-4 text-[14px] leading-relaxed text-ink-2">
        {fila.etapa === 'liberada' ? (
          <>
            <strong className="font-semibold text-ink">Vaga liberada!</strong> Recarregue a página para abrir o app.
          </>
        ) : fila.posicao !== null ? (
          <>
            Sua clínica é a{' '}
            <strong className="tnum font-titulo text-[18px] font-extrabold text-accent-ink">{fila.posicao}ª</strong> da fila.{' '}
            {fila.naFrente === 0
              ? 'É a próxima a ser atendida.'
              : `${fila.naFrente} ${fila.naFrente === 1 ? 'pedido chegou' : 'pedidos chegaram'} antes.`}
          </>
        ) : (
          'Seu pedido está com a equipe.'
        )}
      </p>
    </div>
  )
}

/**
 * Os 10 lugares da primeira turma. O tamanho é o plano; os lugares só aparecem
 * preenchidos com a contagem real — e ela só aparece a partir do mínimo.
 */
export function SelosDaTurma({ turma }: { turma: SituacaoDaTurma }) {
  const preenchidos = turma.tipo === 'aberta' ? 0 : Math.min(turma.pedidos, turma.vagas)

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <span aria-hidden className="flex gap-1">
        {Array.from({ length: turma.vagas }, (_, i) => (
          <span
            key={i}
            className={clsx(
              'h-3 w-3 rounded-full',
              i < preenchidos ? 'bg-vela' : 'border-[1.5px] border-vela/60 bg-vela-soft'
            )}
          />
        ))}
      </span>
      <span className="text-[13px] font-medium text-ink-2">
        {turma.tipo === 'aberta' && (
          <>
            Primeira turma: <strong className="font-semibold text-ink">{turma.vagas} clínicas</strong>
          </>
        )}
        {turma.tipo === 'enchendo' && (
          <>
            <strong className="tnum font-semibold text-ink">{turma.pedidos} clínicas</strong> já pediram vaga · primeira turma
            de {turma.vagas}
          </>
        )}
        {turma.tipo === 'completa' && (
          <>
            <strong className="font-semibold text-ink">Primeira turma completa</strong> · novos pedidos entram na fila da
            próxima
          </>
        )}
      </span>
    </div>
  )
}
