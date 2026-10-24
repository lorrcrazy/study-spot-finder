import { addMinutes, dayLabel, diffMinutes, formatTime, roomStatus } from './libcal'
import type { Availability, RoomStatus } from './libcal'
import type { EventSize, Noise, Room, School } from './schools'

export interface Prefs {
  noise: Noise
  groupSize: number
  durationMin: number
  finals: boolean
  preferBuildingId?: string | null
  avoidBuildingId?: string | null
  // Library-local YYYY-MM-DD
  date: string
  // 'now', 'any' (any time that day), or 'HH:MM'
  time: string
}

export interface When {
  date: string
  // Search for free blocks starting here
  from: string
  // Reference time for busyness and events
  ref: string
  flexible: boolean
  isNow: boolean
}

export function resolveWhen(prefs: Pick<Prefs, 'date' | 'time'>, now: string): When {
  const today = now.slice(0, 10)
  const date = prefs.date < today ? today : prefs.date
  if (prefs.time === 'any' || (prefs.time === 'now' && date !== today)) {
    return {
      date,
      from: date === today ? now : `${date} 08:00:00`,
      ref: date === today ? now : `${date} 12:00:00`,
      flexible: true,
      isNow: false,
    }
  }
  const at = prefs.time === 'now' ? now : `${date} ${prefs.time}:00`
  return at <= now ? { date, from: now, ref: now, flexible: false, isNow: true } : { date, from: at, ref: at, flexible: false, isNow: false }
}

export function whenLabel(when: When, today: string): string {
  if (when.isNow) return 'right now'
  const day = dayLabel(when.date, today)
  if (when.flexible) return when.date === today ? 'later today' : day
  return `${day === 'Today' ? 'today' : day} at ${formatTime(when.from)}`
}

export interface LiveEvent {
  id: string
  title: string
  location: string
  nearBuildingIds: string[]
  start: string
  end: string
  size: EventSize
  userAdded?: boolean
}

export interface FloorStats {
  floor: string
  noise: Noise
  free: number
  total: number
  busyness: number
}

export interface BuildingStats {
  id: string
  free: number
  total: number
  busyness: number
  events: LiveEvent[]
  floors: FloorStats[]
}

export interface Recommendation {
  room: Room
  status: RoomStatus
  score: number
  busyness: number
  reasons: string[]
  warnings: string[]
}

function freeText(status: RoomStatus, school: School, covers: boolean, isNow: boolean) {
  const from = formatTime(status.freeFrom!)
  const until = formatTime(status.freeUntil!)
  const bookEnd = formatTime(addMinutes(status.freeFrom!, Math.min(status.freeMinutes, school.maxBookingMin)))
  if (!covers) return isNow ? `Only free ${status.freeMinutes} min (until ${until})` : `Only free ${from}–${until}`
  return isNow ? `Free until ${until} · book up to ${bookEnd}` : `Free ${from}–${until} · book ${from}–${bookEnd}`
}

const EVENT_WEIGHT: Record<EventSize, number> = { small: 10, medium: 20, large: 35 }
const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)))

export function eventImpact(event: LiveEvent, now: string): number {
  const weight = EVENT_WEIGHT[event.size]
  if (event.start <= now && event.end > now) return weight
  const minutesAway = diffMinutes(now, event.start)
  return minutesAway > 0 && minutesAway <= 60 ? Math.round(weight * 0.6) : 0
}

export function timeOfDayBoost(now: string): number {
  const hour = Number(now.slice(11, 13))
  if (hour < 9) return 0
  if (hour < 11) return 8
  if (hour < 14) return 15
  if (hour < 18) return 10
  if (hour < 23) return 18
  return 5
}

export function busynessLabel(busyness: number) {
  if (busyness < 35) return { label: 'Chill', dot: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50' }
  if (busyness < 65) return { label: 'Moderate', dot: 'bg-amber-500', text: 'text-amber-700', bg: 'bg-amber-50' }
  return { label: 'Packed', dot: 'bg-rose-500', text: 'text-rose-700', bg: 'bg-rose-50' }
}

export function computeBuildingStats(
  school: School,
  statuses: Map<number, RoomStatus>,
  events: LiveEvent[],
  now: string,
  finals: boolean,
): Map<string, BuildingStats> {
  const base = timeOfDayBoost(now) + (finals ? 20 : 0)
  const stats = new Map<string, BuildingStats>()
  for (const building of school.buildings) {
    const rooms = school.rooms.filter((r) => r.buildingId === building.id)
    const nearby = events.filter((e) => e.nearBuildingIds.includes(building.id) && eventImpact(e, now) > 0)
    const eventPenalty = nearby.reduce((sum, e) => sum + eventImpact(e, now), 0)
    const score = (free: number, total: number) =>
      clamp((total ? (1 - free / total) * 60 : 0) + eventPenalty + base)
    const isFree = (r: Room) => statuses.get(r.eid)?.freeNow ?? false
    const floorIds = [...new Set(rooms.map((r) => r.floor))].sort()
    const floors = floorIds.map((floor) => {
      const floorRooms = rooms.filter((r) => r.floor === floor)
      const free = floorRooms.filter(isFree).length
      return { floor, noise: floorRooms[0].noise, free, total: floorRooms.length, busyness: score(free, floorRooms.length) }
    })
    const free = rooms.filter(isFree).length
    stats.set(building.id, { id: building.id, free, total: rooms.length, busyness: score(free, rooms.length), events: nearby, floors })
  }
  return stats
}

const NOISE_MATCH: Record<Noise, Record<Noise, number>> = {
  quiet: { quiet: 25, moderate: 8, collaborative: -40 },
  moderate: { quiet: 8, moderate: 25, collaborative: 8 },
  collaborative: { quiet: -40, moderate: 8, collaborative: 25 },
}

const NOISE_LABEL: Record<Noise, string> = {
  quiet: 'Quiet floor',
  moderate: 'Moderate-noise floor',
  collaborative: 'Collaborative floor',
}

export function recommend(
  school: School,
  statuses: Map<number, RoomStatus>,
  buildingStats: Map<string, BuildingStats>,
  prefs: Prefs,
  when?: When,
): Recommendation[] {
  const results: Recommendation[] = []
  for (const room of school.rooms) {
    const status = statuses.get(room.eid)
    if (!status?.freeNow || room.capacity < prefs.groupSize) continue
    const building = buildingStats.get(room.buildingId)!
    const busyness = building.floors.find((f) => f.floor === room.floor)?.busyness ?? building.busyness
    const wanted = Math.min(prefs.durationMin, school.maxBookingMin)
    const covers = status.freeMinutes >= wanted
    const durationScore = covers ? 20 : Math.round((20 * status.freeMinutes) / wanted) - 10
    const waste = Math.min(15, (room.capacity - prefs.groupSize) * 1.5)
    const placeScore = (room.buildingId === prefs.preferBuildingId ? 20 : 0) - (room.buildingId === prefs.avoidBuildingId ? 60 : 0)
    const score = 100 - busyness * 0.9 + NOISE_MATCH[prefs.noise][room.noise] + durationScore - waste + placeScore

    const reasons = [
      NOISE_LABEL[room.noise],
      freeText(status, school, covers, !when || when.isNow),
      `Floor is ${busynessLabel(busyness).label.toLowerCase()} (${busyness}% busy)`,
      `Fits ${room.capacity}`,
    ]
    const warnings = building.events.map((e) => `${e.title} nearby (${e.location})`)
    results.push({ room, status, score, busyness, reasons, warnings })
  }
  return results.sort((a, b) => b.score - a.score)
}

export function evaluate(school: School, availability: Availability, events: LiveEvent[], prefs: Prefs, now: string) {
  const when = resolveWhen(prefs, now)
  const minMinutes = Math.min(prefs.durationMin, school.maxBookingMin)
  const statuses = new Map<number, RoomStatus>()
  for (const room of school.rooms) {
    statuses.set(room.eid, roomStatus(availability.get(room.eid), when.from, { flexible: when.flexible, minMinutes }))
  }
  const buildingStats = computeBuildingStats(school, statuses, events, when.ref, prefs.finals)
  const recs = recommend(school, statuses, buildingStats, prefs, when)
  return { when, statuses, buildingStats, recs }
}
