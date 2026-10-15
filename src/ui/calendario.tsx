'use client'

import type { ComponentProps } from 'react'
import clsx from 'clsx'
import { DayPicker } from 'react-day-picker'
import { ptBR } from 'react-day-picker/locale'

// O calendário do CRM (react-day-picker), no lugar do seletor de data do
// navegador: semana começando no domingo, em português, com as cores da marca.
// O dia escolhido é o roxo cheio; o intervalo, o roxo suave entre as pontas.
// As classes são as de `src/componentes/ui/calendario.tsx` do CRM, com os nomes
// de cor deste app.

export function Calendario({ className, classNames, ...props }: ComponentProps<typeof DayPicker>) {
  return (
    <DayPicker
      locale={ptBR}
      showOutsideDays
      className={clsx('select-none', className)}
      classNames={{
        months: 'relative flex flex-col gap-4 sm:flex-row',
        month: 'flex flex-col gap-3',
        month_caption: 'flex h-8 items-center justify-center',
        caption_label: 'text-sm font-semibold text-ink first-letter:uppercase',
        nav: 'absolute inset-x-0 top-0 flex h-8 items-center justify-between',
        button_previous:
          'grid size-8 cursor-pointer place-items-center rounded-lg text-ink-2 transition-colors hover:bg-sunk hover:text-ink disabled:pointer-events-none disabled:opacity-40',
        button_next:
          'grid size-8 cursor-pointer place-items-center rounded-lg text-ink-2 transition-colors hover:bg-sunk hover:text-ink disabled:pointer-events-none disabled:opacity-40',
        month_grid: 'w-full border-collapse',
        weekdays: 'flex',
        weekday: 'w-9 pb-1 text-center text-[11px] font-medium text-muted uppercase',
        week: 'mt-0.5 flex w-full',
        day: 'group/dia relative size-9 p-0 text-center text-sm',
        day_button:
          'tnum grid size-9 cursor-pointer place-items-center rounded-lg text-ink transition-colors outline-none hover:bg-sunk focus-visible:ring-[3px] focus-visible:ring-accent/25 disabled:pointer-events-none',
        today: '[&>button]:font-semibold [&>button]:text-accent-ink',
        selected: '[&>button]:bg-accent-ink [&>button]:text-white [&>button]:hover:bg-accent-ink',
        range_start: 'rounded-l-lg bg-accent-soft',
        range_middle: 'bg-accent-soft [&>button]:!bg-transparent [&>button]:!text-accent-ink [&>button]:hover:!bg-accent-ink/10',
        range_end: 'rounded-r-lg bg-accent-soft',
        outside: '[&>button]:text-muted-2',
        disabled: '[&>button]:text-muted-2 [&>button]:line-through [&>button]:opacity-60',
        hidden: 'invisible',
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation }) => (
          <svg
            aria-hidden
            viewBox="0 0 16 16"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d={orientation === 'left' ? 'M10 3.5 5.5 8l4.5 4.5' : 'M6 3.5 10.5 8 6 12.5'} />
          </svg>
        ),
      }}
      {...props}
    />
  )
}
