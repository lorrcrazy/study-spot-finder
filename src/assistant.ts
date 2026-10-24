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

export function interpretLocally(message: string, school: School): Interpretation {
  const text = message.toLowerCase().replace(/[’']/g, "'")
  const patch: PrefsPatch = {}
  const groupSize = parseGroup(text)
  if (groupSize) patch.groupSize = groupSize
  const noise = parseNoise(text)
  if (noise) patch.noise = noise
  else if (groupSize && groupSize >= 3) patch.noise = 'collaborative'
  else if (groupSize === 1) patch.noise = 'quiet'
  const duration = parseDuration(text, school)
  let note: string | undefined
  if (duration) {
    patch.durationMin = fitDuration(duration, school)
    if (duration > school.maxBookingMin) note = `${school.shortName} caps bookings at ${durationLabel(school.maxBookingMin)}, so I used that.`
  }
  const { prefer, avoid } = parseBuildings(text, school)
  if (prefer !== undefined) patch.preferBuildingId = prefer
  if (avoid !== undefined) patch.avoidBuildingId = avoid
  if (has(text, ['finals?', 'exam week', 'midterms?'])) patch.finals = true
  return { patch, note, source: 'local' }
}

export async function interpret(message: string, school: School, prefs: Prefs): Promise<Interpretation> {
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
        school: {
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
    return { patch, note: data.note, source: 'ai' }
  } catch {
    return interpretLocally(message, school)
  }
}
