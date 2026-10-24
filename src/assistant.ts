import { addDays, dayLabel, formatTime, weekday } from './libcal'
import type { Prefs } from './scoring'
import type { Noise, School } from './schools'

export type PrefsPatch = Partial<Omit<Prefs, 'finals'>> & { finals?: boolean }

export interface Interpretation {
  patch: PrefsPatch
  note?: string
  source: 'ai' | 'local'
}

export const durationLabel = (min: number) => {
  const h = Math.floor(min / 60)
  const m = min % 60
  return [h ? `${h} hr` : '', m ? `${m} min` : ''].filter(Boolean).join(' ')
}

export const fitDuration = (min: number, school: School) =>
  Math.min(school.maxBookingMin, Math.max(school.slotMin, Math.round(min / school.slotMin) * school.slotMin))

const NUMBER_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, couple: 2, few: 3,
}
const num = (token: string) => NUMBER_WORDS[token] ?? Number(token)
const NUM = '(\\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|couple|few)'

const has = (text: string, words: string[]) => words.some((w) => new RegExp(`\\b${w}\\b`).test(text))

function parseNoise(text: string): Noise | undefined {
  if (has(text, ['group', 'collab\\w*', 'team', 'discuss\\w*', 'whiteboard', 'loud', 'project', 'presentation', 'rehears\\w*', 'brainstorm\\w*', 'talk'])) return 'collaborative'
  if (has(text, ['some noise', 'chatter', 'chill', 'casual', 'moderate', 'background noise', 'not too quiet', 'little noise'])) return 'moderate'
  if (has(text, ['quiet', 'silent', 'silence', 'focus\\w*', 'alone', 'solo', 'myself', 'cram\\w*', 'lock in', 'locked in', 'deep work', 'no noise', 'peaceful'])) return 'quiet'
  return undefined
}

function parseGroup(text: string): number | undefined {
  let m = text.match(new RegExp(`\\bme and ${NUM} (?:friends?|people|others|classmates|teammates)\\b`))
  if (m) return num(m[1]) + 1
  m = text.match(new RegExp(`\\b${NUM} (?:of us|people|persons|students|friends|classmates|teammates)\\b`))
  if (m) return num(m[1])
  m = text.match(new RegExp(`\\bgroup of ${NUM}\\b`)) ?? text.match(/\bfor (\d+)\b(?![.\d]| ?(?:h|hr|hrs|hours?|m|min|mins|minutes)\b)/)
  if (m) return num(m[1])
  if (has(text, ['me and (?:a|my) (?:friend|partner|roommate|bf|gf|boyfriend|girlfriend)', 'with (?:a|my) (?:friend|partner|roommate)', 'two of us', 'pair'])) return 2
  if (has(text, ['alone', 'solo', 'myself', 'just me'])) return 1
  return undefined
}

function parseDuration(text: string, school: School): number | undefined {
  if (has(text, ['as long as possible', 'max\\w*', 'all day', 'all night', 'longest'])) return school.maxBookingMin
  if (has(text, ['hour and a half', 'an hour and a half', '1\\.5 ?(?:h|hr|hrs|hours?)'])) return 90
  if (has(text, ['half an hour', 'half hour', 'half-hour'])) return 30
  let m = text.match(/(\d+(?:\.\d+)?) ?(?:h|hr|hrs|hours?)\b(?: ?(?:and )?(\d+) ?(?:m|min|mins|minutes)\b)?/)
  if (m) return Math.round(Number(m[1]) * 60 + Number(m[2] ?? 0))
  m = text.match(new RegExp(`\\b${NUM} hours?\\b`))
  if (m) return num(m[1]) * 60
  m = text.match(/(\d+) ?(?:m|min|mins|minutes)\b/)
  if (m) return Number(m[1])
  if (has(text, ['quick', 'short'])) return 30
  return undefined
}

const ORDINALS: Record<string, string> = { first: '1', second: '2', third: '3', fourth: '4', fifth: '5', ground: 'G' }

function buildingKeywords(school: School) {
  return school.buildings.map((b) => {
    const words = b.name
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 2 && !['floor', 'the', 'library', 'commons', 'tower'].includes(w))
    const floor = b.name.match(/Floor (\w+)/)?.[1]
    const initials = b.name.split(/\s+/).filter((w) => /^[A-Z]/.test(w)).map((w) => w[0].toLowerCase()).join('')
    return { id: b.id, words: [...words, ...(initials.length > 1 && !floor ? [initials] : [])], floor }
  })
}

function parseBuildings(text: string, school: School): { prefer?: string | null; avoid?: string | null } {
  const floorMatch = text.match(/\b(?:floor (\w+)|(\d+)(?:st|nd|rd|th)? floor|(first|second|third|fourth|fifth|ground) floor)\b/)
  const floor = floorMatch ? (floorMatch[1] ?? floorMatch[2] ?? ORDINALS[floorMatch[3]])?.toUpperCase() : undefined
  const result: { prefer?: string | null; avoid?: string | null } = {}
  for (const b of buildingKeywords(school)) {
    const nameHit = b.words.find((w) => new RegExp(`\\b${w}\\b`).test(text))
    const floorHit = b.floor && floor === b.floor.toUpperCase()
    if (!nameHit && !floorHit) continue
    const idx = nameHit ? text.search(new RegExp(`\\b${nameHit}\\b`)) : text.search(/floor/)
    const before = text.slice(Math.max(0, idx - 25), idx)
    if (/\b(not|avoid|away from|anywhere but|except|no)\b/.test(before)) result.avoid = b.id
    else if (b.floor && !floorHit && floor) continue
    else result.prefer = b.id
  }
  if (has(text, ['anywhere', "don't care", 'dont care', 'wherever'])) result.prefer = null
  return result
}

const DAY_INDEX: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 }
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const pad = (n: number) => String(n).padStart(2, '0')

interface WhenParse {
  date?: string
  time?: string
  note?: string
  rest: string
}

// Pulls day/time phrases out of the message so the other parsers don't misread "at 3" as a group size.
function parseWhen(input: string, school: School, now: string): WhenParse {
  let text = input
  const today = now.slice(0, 10)
  const eat = (re: RegExp) => {
    const m = text.match(re)
    if (m) text = text.replace(m[0], ' ')
    return m
  }
  let date: string | undefined
  let time: string | undefined
  let m: RegExpMatchArray | null

  if (eat(/\b(?:right now|asap|immediately|now)\b/)) {
    date = today
    time = 'now'
  }
  if (eat(/\btonight\b/)) {
    date = today
    time = '19:00'
  }
  if (eat(/\blater today\b/)) {
    date = today
    time = 'any'
  }
  if (eat(/\bday after tomorrow\b/)) date = addDays(today, 2)
  if (!date && eat(/\b(?:tomorrow|tmrw|tmr|tmrw)\b/)) date = addDays(today, 1)
  if (!date && eat(/\btoday\b/)) date = today
  if (!date && (m = eat(new RegExp(`\\bin ${NUM} days?\\b`)))) date = addDays(today, num(m[1]))
  if (!date && eat(/\b(?:in a week|next week|a week from (?:now|today))\b/)) date = addDays(today, 7)
  if (!date && (m = eat(/\b(next |this |on )?(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tues?|wed|weds|thu|thur|thurs|fri|sat)\b/))) {
    let diff = (DAY_INDEX[m[2].slice(0, 3)] - weekday(today) + 7) % 7
    if (m[1] === 'next ' && diff === 0) diff = 7
    date = addDays(today, diff)
  }
  const year = Number(today.slice(0, 4))
  const fromParts = (month: number, day: number) => {
    if (month < 1 || month > 12 || day < 1 || day > 31) return undefined
    const d = `${year}-${pad(month)}-${pad(day)}`
    return d < today ? `${year + 1}-${pad(month)}-${pad(day)}` : d
  }
  if (!date && (m = eat(new RegExp(`\\b(${MONTHS.join('|')})[a-z]*\\.? (\\d{1,2})(?:st|nd|rd|th)?\\b`)))) date = fromParts(MONTHS.indexOf(m[1]) + 1, Number(m[2]))
  if (!date && (m = eat(/\b(\d{1,2})\/(\d{1,2})\b/))) date = fromParts(Number(m[1]), Number(m[2]))
  if (!date && (m = eat(/\b(?:on )?the (\d{1,2})(?:st|nd|rd|th)\b/))) {
    const month = Number(today.slice(5, 7))
    const day = Number(m[1])
    const d = `${year}-${pad(month)}-${pad(day)}`
    date = d >= today ? d : fromParts((month % 12) + 1, day)
  }

  const setTime = (hour: number, minute: number, meridiem?: string) => {
    if (meridiem === 'p' && hour < 12) hour += 12
    if (meridiem === 'a' && hour === 12) hour = 0
    if (!meridiem && hour >= 1 && hour <= 7) hour += 12
    if (hour > 23 || minute > 59) return
    const total = hour * 60 + minute
    const rounded = Math.floor(total / school.slotMin) * school.slotMin
    time = `${pad(Math.floor(rounded / 60))}:${pad(rounded % 60)}`
  }
  if (!time) {
    if (eat(/\bnoon\b/)) setTime(12, 0, 'p')
    else if ((m = eat(/\b(?:at |around |by |from |after |starting )?(\d{1,2})(?::(\d{2}))? ?([ap])\.?m\.?(?![a-z])/))) setTime(Number(m[1]), Number(m[2] ?? 0), m[3])
    else if ((m = eat(/\b(?:at|around|after|from|starting at) (\d{1,2})(?::(\d{2}))?\b(?! ?(?:h|hr|hrs|hours?|m|min|mins|minutes|people|of us|friends|ppl)\b)/))) setTime(Number(m[1]), Number(m[2] ?? 0))
    else if ((m = eat(/\b(\d{1,2}):(\d{2})\b/))) setTime(Number(m[1]), Number(m[2]))
  }
  if ((m = eat(/\b(this )?(morning|afternoon|evening)\b/))) {
    if (m[1]) date ??= today
    if (!time) time = { morning: '09:00', afternoon: '14:00', evening: '18:00' }[m[2]]
  }
  if (date && !time) time = 'any'

  let note: string | undefined
  const lastDay = addDays(today, school.bookAheadDays)
  if (date && date > lastDay) {
    note = `${school.shortName} only lets you book ${school.bookAheadDays} days ahead (through ${dayLabel(lastDay, today)}), so I can't look that far out.`
    date = undefined
    if (time !== 'now') time = undefined
  }
  if (time && /^\d/.test(time) && date === today && `${today} ${time}:00` <= now) {
    note = `${formatTime(`${today} ${time}:00`)} already passed today, so I looked at right now.`
    time = 'now'
  }
  return { date, time, note, rest: text }
}

export function interpretLocally(message: string, school: School, now: string): Interpretation {
  const when = parseWhen(message.toLowerCase().replace(/[’']/g, "'"), school, now)
  const text = when.rest
  const patch: PrefsPatch = {}
  if (when.date) patch.date = when.date
  if (when.time) patch.time = when.time
  const groupSize = parseGroup(text)
  if (groupSize) patch.groupSize = groupSize
  const noise = parseNoise(text)
  if (noise) patch.noise = noise
  else if (groupSize && groupSize >= 3) patch.noise = 'collaborative'
  else if (groupSize === 1) patch.noise = 'quiet'
  const duration = parseDuration(text, school)
  let note = when.note
  if (duration) {
    patch.durationMin = fitDuration(duration, school)
    if (duration > school.maxBookingMin) note = [note, `${school.shortName} caps bookings at ${durationLabel(school.maxBookingMin)}, so I used that.`].filter(Boolean).join(' ')
  }
  const { prefer, avoid } = parseBuildings(text, school)
  if (prefer !== undefined) patch.preferBuildingId = prefer
  if (avoid !== undefined) patch.avoidBuildingId = avoid
  if (has(text, ['finals?', 'exam week', 'midterms?'])) patch.finals = true
  return { patch, note, source: 'local' }
}

export async function interpret(message: string, school: School, prefs: Prefs, now: string): Promise<Interpretation> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 8000)
    const res = await fetch('/api/assistant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        message,
        prefs,
        now,
        weekday: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][weekday(now.slice(0, 10))],
        school: {
          bookAheadDays: school.bookAheadDays,
          name: school.name,
          maxBookingMin: school.maxBookingMin,
          slotMin: school.slotMin,
          buildings: school.buildings.map((b) => ({ id: b.id, name: b.name })),
        },
      }),
    })
    clearTimeout(timer)
    if (!res.ok) throw new Error(`assistant ${res.status}`)
    const data = (await res.json()) as PrefsPatch & { note?: string }
    const ids = new Set(school.buildings.map((b) => b.id))
    const patch: PrefsPatch = {}
    if (data.noise && ['quiet', 'moderate', 'collaborative'].includes(data.noise)) patch.noise = data.noise
    if (typeof data.groupSize === 'number' && data.groupSize > 0) patch.groupSize = Math.round(data.groupSize)
    if (typeof data.durationMin === 'number' && data.durationMin > 0) patch.durationMin = fitDuration(data.durationMin, school)
    if (data.preferBuildingId === null || (data.preferBuildingId && ids.has(data.preferBuildingId))) patch.preferBuildingId = data.preferBuildingId
    if (data.avoidBuildingId === null || (data.avoidBuildingId && ids.has(data.avoidBuildingId))) patch.avoidBuildingId = data.avoidBuildingId
    if (typeof data.finals === 'boolean') patch.finals = data.finals
    const today = now.slice(0, 10)
    if (typeof data.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data.date) && data.date >= today && data.date <= addDays(today, school.bookAheadDays)) {
      patch.date = data.date
    }
    if (typeof data.time === 'string' && /^(now|any|\d{2}:\d{2})$/.test(data.time)) patch.time = data.time
    return { patch, note: data.note, source: 'ai' }
  } catch {
    return interpretLocally(message, school, now)
  }
}
