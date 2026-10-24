import type { School } from './schools'

export interface Slot {
  start: string
  end: string
  booked: boolean
}

export type Availability = Map<number, Slot[]>

export interface RoomStatus {
  freeNow: boolean
  freeFrom: string | null
  freeUntil: string | null
  freeMinutes: number
}

// Timestamps are library-local wall-clock strings ("YYYY-MM-DD HH:mm:ss"), matching LibCal's format.
export function nowInTz(timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date())
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00'
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`
}

const toDate = (ts: string) => new Date(ts.replace(' ', 'T') + 'Z')
const fromDate = (d: Date) => d.toISOString().slice(0, 19).replace('T', ' ')

export const addMinutes = (ts: string, minutes: number) => fromDate(new Date(toDate(ts).getTime() + minutes * 60000))
export const diffMinutes = (from: string, to: string) => Math.round((toDate(to).getTime() - toDate(from).getTime()) / 60000)

export const bookingUrl = (school: School, eid: number, date?: string) =>
  `${school.libcalBase}/space/${eid}${date ? `?date=${date}` : ''}`

export const addDays = (date: string, days: number) => addMinutes(`${date} 00:00:00`, days * 24 * 60).slice(0, 10)

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export const weekday = (date: string) => toDate(`${date} 00:00:00`).getUTCDay()

export function dayLabel(date: string, today: string): string {
  if (date === today) return 'Today'
  if (date === addDays(today, 1)) return 'Tomorrow'
  const d = toDate(`${date} 00:00:00`)
  return `${WEEKDAY_SHORT[d.getUTCDay()]}, ${MONTH_SHORT[d.getUTCMonth()]} ${d.getUTCDate()}`
}

export function formatTime(ts: string): string {
  const [h, m] = ts.slice(11, 16).split(':').map(Number)
  if (h === 0 && m === 0) return 'midnight'
  const suffix = h >= 12 ? 'PM' : 'AM'
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${suffix}`
}

export async function fetchLiveAvailability(school: School, date: string): Promise<Availability> {
  const body = new URLSearchParams({
    lid: String(school.lid),
    gid: String(school.gid),
    eid: '-1',
    seat: '0',
    seatId: '0',
    zone: '0',
    start: date,
    end: addDays(date, 1),
    pageIndex: '0',
    pageSize: '500',
  })
  const res = await fetch(`${school.proxyPrefix}/spaces/availability/grid`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!res.ok) throw new Error(`LibCal responded ${res.status}`)
  const data: { slots?: { start: string; end: string; itemId: number; className?: string }[] } = await res.json()
  const availability: Availability = new Map()
  for (const slot of data.slots ?? []) {
    const list = availability.get(slot.itemId) ?? []
    list.push({ start: slot.start, end: slot.end, booked: Boolean(slot.className) })
    availability.set(slot.itemId, list)
  }
  if (availability.size === 0) throw new Error('LibCal returned no slots')
  return availability
}

function seededRandom(seed: number) {
  let t = seed >>> 0
  return () => {
    t = (t + 0x6d2b79f5) >>> 0
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

export function mockAvailability(school: School, date: string): Availability {
  const daySeed = Number(date.replaceAll('-', ''))
  const availability: Availability = new Map()
  for (const room of school.rooms) {
    const random = seededRandom(room.eid * 31 + daySeed)
    const slots: Slot[] = []
    let bookedRemaining = 0
    const step = school.slotMin
    const perHour = 60 / step
    for (let i = 8 * perHour; i < 24 * perHour; i++) {
      if (bookedRemaining === 0 && random() < 0.1) bookedRemaining = Math.ceil((60 + random() * 120) / step)
      const start = addMinutes(`${date} 00:00:00`, i * step)
      slots.push({ start, end: addMinutes(start, step), booked: bookedRemaining > 0 })
      if (bookedRemaining > 0) bookedRemaining--
    }
    availability.set(room.eid, slots)
  }
  return availability
}

const FREE_NOW_GRACE_MIN = 20

const none: RoomStatus = { freeNow: false, freeFrom: null, freeUntil: null, freeMinutes: 0 }

// Free block starting at/after `from`. Flexible mode picks the first block long enough for `minMinutes` (any time that day).
export function roomStatus(slots: Slot[] | undefined, from: string, opts: { flexible?: boolean; minMinutes?: number } = {}): RoomStatus {
  const sorted = [...(slots ?? [])].sort((a, b) => a.start.localeCompare(b.start))
  const blocks: { start: string; end: string }[] = []
  for (const slot of sorted) {
    if (slot.booked || slot.end <= from) continue
    const last = blocks[blocks.length - 1]
    if (last && last.end === slot.start) last.end = slot.end
    else blocks.push({ start: slot.start > from ? slot.start : from, end: slot.end })
  }
  if (blocks.length === 0) return none
  const length = (b: { start: string; end: string }) => diffMinutes(b.start, b.end)
  const block = opts.flexible
    ? (blocks.find((b) => length(b) >= (opts.minMinutes ?? 0)) ?? blocks.reduce((a, b) => (length(b) > length(a) ? b : a)))
    : blocks[0]
  return {
    freeNow: opts.flexible ? true : diffMinutes(from, block.start) <= FREE_NOW_GRACE_MIN,
    freeFrom: block.start,
    freeUntil: block.end,
    freeMinutes: length(block),
  }
}
