import clsx from 'clsx'

// O presente 3D da página de beta — CSS puro (ver `.presente` em globals.css).
// Fechado, ele gira e flutua. Aberto, a tampa salta e o confete sai: é o
// momento do pedido enviado. Decorativo: `aria-hidden`, o estado real é dito
// em texto na página.

const FACES = ['frente', 'tras', 'direita', 'esquerda', 'fundo'] as const
const LADOS_DA_TAMPA = ['frente', 'tras', 'direita', 'esquerda'] as const

// Posições fixas (e não sorteadas no render): o mesmo confete em todo render
// evita diferença entre servidor e navegador na hidratação.
const CONFETE = Array.from({ length: 26 }, (_, i) => {
  const angulo = (i / 26) * Math.PI * 2
  const alcance = 90 + ((i * 37) % 70)
  return {
    x: `${Math.round(Math.cos(angulo) * alcance)}px`,
    y: `${Math.round(Math.sin(angulo) * alcance * 0.8 - 60)}px`,
    r: `${(i * 97) % 540}deg`,
    atraso: `${(i % 6) * 40}ms`,
    cor: ['var(--color-vela)', 'var(--color-accent)', '#ff8fb1', '#34c38f', '#8a5cf0'][i % 5],
  }
})

export function Presente3D({ aberto, className }: { aberto: boolean; className?: string }) {
  return (
    <div className={clsx('presente', aberto && 'aberto', className)} aria-hidden>
      <span className="presente-sombra" />
      <div className="presente-flutua">
        <div className="presente-gira">
          {FACES.map((f) => (
            <span key={f} className={`presente-face ${f}`} />
          ))}
          <div className="presente-tampa">
            <span className="presente-tampa-face topo" />
            {LADOS_DA_TAMPA.map((f) => (
              <span key={f} className={`presente-tampa-face lado ${f}`} />
            ))}
          </div>
        </div>
      </div>
      {aberto &&
        CONFETE.map((c, i) => (
          <span
            key={i}
            className="confete"
            style={
              {
                '--x': c.x,
                '--y': c.y,
                '--r': c.r,
                '--atraso': c.atraso,
                '--c': c.cor,
              } as React.CSSProperties
            }
          />
        ))}
    </div>
  )
}
