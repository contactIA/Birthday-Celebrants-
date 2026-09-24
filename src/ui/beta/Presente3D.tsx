import clsx from 'clsx'

// O presente 3D da página de beta, em CSS puro (ver `.presente` em globals.css).
// Fechado, ele gira e flutua. Aberto, a tampa salta com o laço e o confete não
// para de sair: é a comemoração do pedido enviado, que fica na tela. Decorativo: `aria-hidden`, o estado real é dito
// em texto na página.

const FACES = ['frente', 'tras', 'direita', 'esquerda', 'fundo'] as const
const LADOS_DA_TAMPA = ['frente', 'tras', 'direita', 'esquerda'] as const

// Posições fixas (e não sorteadas no render): o mesmo confete em todo render
// evita diferença entre servidor e navegador na hidratação.
// Em repetição: cada pedaço tem o próprio atraso dentro do ciclo, e o efeito é
// de chafariz contínuo, não de rajadas.
const PEDACOS = 30
const CICLO_MS = 2600
const CONFETE = Array.from({ length: PEDACOS }, (_, i) => {
  const angulo = (i / PEDACOS) * Math.PI * 2
  const alcance = 70 + ((i * 37) % 80)
  const redondo = i % 3 === 0
  return {
    x: `${Math.round(Math.cos(angulo) * alcance)}px`,
    // Sempre para cima: a queda vem da própria animação.
    y: `${-Math.round(Math.abs(Math.sin(angulo)) * alcance * 0.9 + 50)}px`,
    r: `${(i * 97) % 540}deg`,
    atraso: `${Math.round(((i * 7) % PEDACOS) * (CICLO_MS / PEDACOS))}ms`,
    w: redondo ? '8px' : '7px',
    h: redondo ? '8px' : '13px',
    raio: redondo ? '50%' : '2px',
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
            {/* Laço: dois planos em cruz, para ter volume de qualquer ângulo
                enquanto o presente gira. */}
            <Laco className="presente-laco" />
            <Laco className="presente-laco cruzado" />
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
                '--w': c.w,
                '--h': c.h,
                '--raio': c.raio,
                '--ciclo': `${CICLO_MS}ms`,
              } as React.CSSProperties
            }
          />
        ))}
    </div>
  )
}

function Laco({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 120 64" preserveAspectRatio="xMidYMax meet">
      {/* Alças, com a dobra interna mais escura */}
      <path d="M60 52 C 46 26, 12 4, 7 26 C 3 44, 32 56, 60 52 Z" fill="#f5a524" stroke="#c9790a" strokeWidth="1.5" />
      <path d="M60 52 C 76 26, 108 4, 113 26 C 117 44, 88 56, 60 52 Z" fill="#f5a524" stroke="#c9790a" strokeWidth="1.5" />
      <path d="M58 50 C 46 34, 24 24, 20 34 C 18 44, 38 50, 58 50 Z" fill="#d98a10" />
      <path d="M62 50 C 74 34, 96 24, 100 34 C 102 44, 82 50, 62 50 Z" fill="#d98a10" />
      {/* Nó */}
      <ellipse cx="60" cy="52" rx="10" ry="9" fill="#e8961a" stroke="#c9790a" strokeWidth="1.5" />
      <ellipse cx="57" cy="49" rx="3.5" ry="2.5" fill="#ffd27a" opacity="0.8" />
    </svg>
  )
}
