// As contas dos campos de data, sobre os textos que eles trocam com quem os usa:
// 'AAAA-MM-DD' (o dia), 'HH:MM' (o horário) e 'AAAA-MM-DDTHH:MM' (o dia e o
// horário), no fuso da clínica. São as do seletor do CRM (`src/componentes/datas.ts`
// de lá), para os campos funcionarem igual nos dois. O calendário trabalha com
// Date no fuso do navegador, mas só lê o ano, o mês e o dia, então o fuso de quem
// olha não muda o dia escolhido.

const DIA = /^(\d{4})-(\d{2})-(\d{2})$/

const dois = (n: number) => String(n).padStart(2, '0')

/** 'AAAA-MM-DD' para o Date do calendário (meia-noite local). Texto inválido: undefined. */
export function diaDoTexto(texto: string | undefined | null): Date | undefined {
  const m = DIA.exec((texto ?? '').slice(0, 10))
  if (!m) return undefined
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

/** O Date do calendário para 'AAAA-MM-DD'. */
export const textoDoDia = (d: Date) => `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`

/** O dia que o servidor manda ({ ano, mes, dia }, o hoje da clínica) para 'AAAA-MM-DD'. */
export const textoDaData = (d: { ano: number; mes: number; dia: number }) => `${d.ano}-${dois(d.mes)}-${dois(d.dia)}`

/** 'AAAA-MM-DD' para '01/10/2026'. */
export function diaLegivel(texto: string | undefined | null): string {
  const m = DIA.exec((texto ?? '').slice(0, 10))
  return m ? `${m[3]}/${m[2]}/${m[1]}` : ''
}

/** 'AAAA-MM-DDTHH:MM' para '01/10/2026 às 14:30'. */
export function dataHoraLegivel(texto: string | undefined | null): string {
  if (!texto) return ''
  const dia = diaLegivel(texto)
  const hora = texto.slice(11, 16)
  return dia && /^\d{2}:\d{2}$/.test(hora) ? `${dia} às ${hora}` : dia
}

const DIAS_DA_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

/** 'AAAA-MM-DDTHH:MM' para 'sex, 02/10/2026 às 14:30': o dia da semana evita marcar no dia errado. */
export function dataHoraComSemana(texto: string): string {
  const [a, m, d] = texto.slice(0, 10).split('-').map(Number)
  if (!a || !m || !d) return dataHoraLegivel(texto)
  return `${DIAS_DA_SEMANA[new Date(Date.UTC(a, m - 1, d)).getUTCDay()]}, ${dataHoraLegivel(texto)}`
}

/** As horas e o passo dos minutos que o seletor oferece. */
export interface Expediente {
  inicioHora: number
  fimHora: number
  passoMinutos: number
}

/** O mesmo padrão da agenda do CRM: das 7h às 20h, de 5 em 5 minutos. */
export const EXPEDIENTE_PADRAO: Expediente = { inicioHora: 7, fimHora: 20, passoMinutos: 5 }

/**
 * As horas e os minutos que o seletor oferece: o expediente e o passo dos
 * minutos. Um horário que já estava gravado fora disso entra na grade, para
 * continuar visível.
 */
export function opcoesDeHorario(expediente: Expediente, atual: { hora?: number; minuto?: number } = {}): { horas: number[]; minutos: number[] } {
  const horas = Array.from({ length: expediente.fimHora - expediente.inicioHora + 1 }, (_, i) => expediente.inicioHora + i)
  const minutos = Array.from({ length: 60 / expediente.passoMinutos }, (_, i) => i * expediente.passoMinutos)
  if (atual.hora !== undefined && !horas.includes(atual.hora)) horas.push(atual.hora)
  if (atual.minuto !== undefined && !minutos.includes(atual.minuto)) minutos.push(atual.minuto)
  return { horas: horas.sort((a, b) => a - b), minutos: minutos.sort((a, b) => a - b) }
}

/** O horário digitado: "14:30", "1430", "14h30", "14h" ou "9". Inválido: null. */
export function lerHorario(texto: string): { hora: number; minuto: number } | null {
  const m = /^(\d{1,2})(?:\s*[:hH.]\s*|(?=\d{2}$))?(\d{2})?\s*[hH]?$/.exec(texto.trim())
  if (!m) return null
  const hora = Number(m[1])
  const minuto = m[2] === undefined ? 0 : Number(m[2])
  return hora < 24 && minuto < 60 ? { hora, minuto } : null
}

/** "14:30". */
export const horarioLegivel = (hora: number, minuto: number) => `${dois(hora)}:${dois(minuto)}`

/** Junta o dia e a hora no texto do campo; falta algum: ''. */
export function juntarDataHora(dia: string | undefined, hora: number | undefined, minuto: number | undefined): string {
  if (!dia || hora === undefined || minuto === undefined) return ''
  return `${dia}T${dois(hora)}:${dois(minuto)}`
}

/** Separa 'AAAA-MM-DDTHH:MM' no dia, na hora e no minuto. */
export function separarDataHora(texto: string | undefined | null): { dia?: string; hora?: number; minuto?: number } {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(texto ?? '')
  if (!m) return { dia: diaDoTexto(texto) ? (texto ?? '').slice(0, 10) : undefined }
  return { dia: m[1], hora: Number(m[2]), minuto: Number(m[3]) }
}
