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

export const bookingUrl = (school: School, eid: number) => `${school.libcalBase}/space/${eid}`

export function formatTime(ts: string): string {
  const [h, m] = ts.slice(11, 16).split(':').map(Number)
  if (h === 0 && m === 0) return 'midnight'
  const suffix = h >= 12 ? 'PM' : 'AM'
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${suffix}`
}

export async function fetchLiveAvailability(school: School): Promise<Availability> {
  const today = nowInTz(school.timeZone).slice(0, 10)
  const body = new URLSearchParams({
    lid: String(school.lid),
    gid: String(school.gid),
    eid: '-1',
    seat: '0',
    seatId: '0',
    zone: '0',
    start: today,
    end: addMinutes(`${today} 00:00:00`, 24 * 60).slice(0, 10),
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

export function mockAvailability(school: School): Availability {
  const today = nowInTz(school.timeZone).slice(0, 10)
  const daySeed = Number(today.replaceAll('-', ''))
  const availability: Availability = new Map()
  for (const room of school.rooms) {
    const random = seededRandom(room.eid * 31 + daySeed)
    const slots: Slot[] = []
    let bookedRemaining = 0
    const step = school.slotMin
    const perHour = 60 / step
    for (let i = 8 * perHour; i < 24 * perHour; i++) {
      if (bookedRemaining === 0 && random() < 0.1) bookedRemaining = Math.ceil((60 + random() * 120) / step)
      const start = addMinutes(`${today} 00:00:00`, i * step)
      slots.push({ start, end: addMinutes(start, step), booked: bookedRemaining > 0 })
      if (bookedRemaining > 0) bookedRemaining--
    }
    availability.set(room.eid, slots)
  }
  return availability
}

const FREE_NOW_GRACE_MIN = 20

export function roomStatus(slots: Slot[] | undefined, now: string): RoomStatus {
  const sorted = [...(slots ?? [])].sort((a, b) => a.start.localeCompare(b.start))
  const first = sorted.findIndex((s) => !s.booked && s.end > now)
  if (first === -1) return { freeNow: false, freeFrom: null, freeUntil: null, freeMinutes: 0 }
  let last = first
  while (last + 1 < sorted.length && !sorted[last + 1].booked && sorted[last + 1].start === sorted[last].end) last++
  const freeFrom = sorted[first].start > now ? sorted[first].start : now
  const freeUntil = sorted[last].end
  return {
    freeNow: diffMinutes(now, freeFrom) <= FREE_NOW_GRACE_MIN,
    freeFrom,
    freeUntil,
    freeMinutes: diffMinutes(freeFrom, freeUntil),
  }
}
