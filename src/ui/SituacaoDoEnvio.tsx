import { Estado } from '@/ui/primitivos'
import { estadoDoEnvio, type IconeDoEstado } from '@/ui/statusDoEnvio'

// A situação de um envio: rótulo, cor e ícone, o mesmo mapa na Agenda e no
// Histórico (ver ui/statusDoEnvio.ts).

export function SituacaoDoEnvio({ status }: { status: string }) {
  const { rotulo, tom, icone } = estadoDoEnvio(status)
  return (
    <Estado tom={tom}>
      <Icone nome={icone} />
      {rotulo}
    </Estado>
  )
}

function Icone({ nome }: { nome: IconeDoEstado }) {
  const comum = {
    width: 13,
    height: 13,
    viewBox: '0 0 16 16',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  }
  switch (nome) {
    case 'relogio':
      return (
        <svg {...comum}>
          <circle cx="8" cy="8" r="6.2" />
          <path d="M8 4.8V8l2.2 1.6" />
        </svg>
      )
    case 'engrenagem':
      return (
        <svg {...comum}>
          <circle cx="8" cy="8" r="2.2" />
          <path d="M8 1.8v1.6M8 12.6v1.6M1.8 8h1.6M12.6 8h1.6M3.6 3.6l1.1 1.1M11.3 11.3l1.1 1.1M3.6 12.4l1.1-1.1M11.3 4.7l1.1-1.1" />
        </svg>
      )
    case 'check':
      return (
        <svg {...comum}>
          <path d="M3.2 8.4l3 3 6.6-6.8" />
        </svg>
      )
    case 'check-duplo':
      return (
        <svg {...comum}>
          <path d="M1.2 8.6l2.8 2.8 6-6.2M7.4 10.9l.6.5 6-6.2" />
        </svg>
      )
    case 'x':
      return (
        <svg {...comum}>
          <circle cx="8" cy="8" r="6.2" />
          <path d="M5.9 5.9l4.2 4.2M10.1 5.9l-4.2 4.2" />
        </svg>
      )
    case 'alerta':
      return (
        <svg {...comum}>
          <circle cx="8" cy="8" r="6.2" />
          <path d="M8 4.8v3.6M8 11.1v.1" />
        </svg>
      )
  }
}
