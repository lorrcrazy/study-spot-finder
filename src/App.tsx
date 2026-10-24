import { useEffect, useMemo, useState } from 'react'
import { CampusMap } from './components/CampusMap'
import { RoomCard } from './components/RoomCard'
import { addMinutes, fetchLiveAvailability, formatTime, mockAvailability, nowInTz, roomStatus } from './libcal'
import type { Availability } from './libcal'
import { busynessLabel, computeBuildingStats, eventImpact, recommend } from './scoring'
import type { LiveEvent, Prefs } from './scoring'
import { SCHOOLS } from './schools'
import type { EventSize, Noise, School } from './schools'

const NOISE_OPTIONS: { value: Noise; label: string }[] = [
  { value: 'quiet', label: 'Quiet solo' },
  { value: 'moderate', label: 'Some chatter OK' },
  { value: 'collaborative', label: 'Group work' },
]
const DURATIONS = [30, 60, 120, 180]
const SIZES: EventSize[] = ['small', 'medium', 'large']

function seedEvents(school: School): LiveEvent[] {
  const now = nowInTz(school.timeZone)
  return school.events.map(({ startOffsetMin, durationMin, ...rest }) => {
    const start = addMinutes(now, startOffsetMin)
    return { ...rest, start, end: addMinutes(start, durationMin) }
  })
}

const initialSchool = SCHOOLS.find((s) => s.id === new URLSearchParams(window.location.search).get('school')) ?? SCHOOLS[0]

const floorName = (floor: string) => (floor === 'G' ? 'Ground' : `Floor ${floor}`)
const durationLabel = (min: number) => (min < 60 ? `${min} min` : `${min / 60} hr`)

export default function App() {
  const [schoolId, setSchoolId] = useState(initialSchool.id)
  const school = SCHOOLS.find((s) => s.id === schoolId)!
  const [availability, setAvailability] = useState<Availability | null>(null)
  const [source, setSource] = useState<'live' | 'demo' | null>(null)
  const [forceDemo, setForceDemo] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [tick, setTick] = useState(0)
  const [events, setEvents] = useState<LiveEvent[]>(() => seedEvents(initialSchool))
  const [prefs, setPrefs] = useState<Prefs>({ noise: 'quiet', groupSize: 1, durationMin: 120, finals: false })
  const [newEvent, setNewEvent] = useState({ title: 'Pop-up club fair', buildingId: initialSchool.buildings[0].id, size: 'large' as EventSize })

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    let cancelled = false
    setAvailability(null)
    const load = async () => {
      if (!forceDemo) {
        try {
          const live = await fetchLiveAvailability(school)
          if (!cancelled) {
            setAvailability(live)
            setSource('live')
          }
          return
        } catch (err) {
          console.warn('Live LibCal fetch failed, using demo data', err)
        }
      }
      if (!cancelled) {
        setAvailability(mockAvailability(school))
        setSource('demo')
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [school, forceDemo, refreshKey])

  const switchSchool = (next: School) => {
    setSchoolId(next.id)
    setEvents(seedEvents(next))
    setNewEvent((e) => ({ ...e, buildingId: next.buildings[0].id }))
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const now = useMemo(() => nowInTz(school.timeZone), [school, tick, refreshKey])

  const statuses = useMemo(() => {
    const map = new Map<number, ReturnType<typeof roomStatus>>()
    if (availability) for (const room of school.rooms) map.set(room.eid, roomStatus(availability.get(room.eid), now))
    return map
  }, [availability, school, now])

  const buildingStats = useMemo(
    () => computeBuildingStats(school, statuses, events, now, prefs.finals),
    [school, statuses, events, now, prefs.finals],
  )
  const recs = useMemo(() => recommend(school, statuses, buildingStats, prefs), [school, statuses, buildingStats, prefs])
  const best = recs[0]

  const nextOpening = useMemo(() => {
    if (best) return null
    return school.rooms
      .filter((r) => r.capacity >= prefs.groupSize)
      .map((room) => ({ room, status: statuses.get(room.eid) }))
      .filter((x) => x.status?.freeFrom)
      .sort((a, b) => a.status!.freeFrom!.localeCompare(b.status!.freeFrom!))[0]
  }, [best, school, statuses, prefs.groupSize])

  const addEvent = () => {
    const building = school.buildings.find((b) => b.id === newEvent.buildingId)!
    setEvents((list) => [
      ...list,
      {
        id: `user-${Date.now()}`,
        title: newEvent.title || 'Surprise event',
        location: building.name,
        nearBuildingIds: [building.id],
        start: now,
        end: addMinutes(now, 90),
        size: newEvent.size,
        userAdded: true,
      },
    ])
  }

  const maxCapacity = Math.max(...school.rooms.map((r) => r.capacity))

  return (
    <div className="min-h-screen">
      <header className="bg-gt-navy text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-5">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">
              Study Spot <span className="text-gt-gold">Finder</span>
            </h1>
            <p className="text-sm text-slate-300">Open rooms, quiet floors, no surprise crowds. One tap to book.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {SCHOOLS.map((s) => (
              <button
                key={s.id}
                onClick={() => switchSchool(s)}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${s.id === schoolId ? 'bg-gt-gold text-gt-navy' : 'bg-white/10 hover:bg-white/20'}`}
              >
                {s.shortName}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-6 px-6 py-6 lg:grid-cols-[300px_1fr]">
        <aside className="space-y-5">
          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">What do you need?</h3>
            <div className="space-y-4">
              <div className="grid gap-2">
                {NOISE_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    onClick={() => setPrefs((p) => ({ ...p, noise: o.value }))}
                    className={`rounded-lg border px-3 py-2 text-left text-sm font-medium ${prefs.noise === o.value ? 'border-gt-navy bg-gt-navy text-white' : 'border-slate-200 hover:border-slate-400'}`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
              <label className="block text-sm">
                <span className="font-medium">Group size: {prefs.groupSize}</span>
                <input
                  type="range"
                  min={1}
                  max={maxCapacity}
                  value={Math.min(prefs.groupSize, maxCapacity)}
                  onChange={(e) => setPrefs((p) => ({ ...p, groupSize: Number(e.target.value) }))}
                  className="mt-1 w-full accent-[#003057]"
                />
              </label>
              <div>
                <div className="mb-1 text-sm font-medium">How long?</div>
                <div className="grid grid-cols-4 gap-1">
                  {DURATIONS.map((d) => (
                    <button
                      key={d}
                      onClick={() => setPrefs((p) => ({ ...p, durationMin: d }))}
                      className={`rounded-md py-1.5 text-xs font-semibold ${prefs.durationMin === d ? 'bg-gt-gold text-gt-navy' : 'bg-slate-100 hover:bg-slate-200'}`}
                    >
                      {durationLabel(d)}
                    </button>
                  ))}
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={prefs.finals}
                  onChange={(e) => setPrefs((p) => ({ ...p, finals: e.target.checked }))}
                  className="accent-[#003057]"
                />
                Finals week mode
              </label>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">Campus events</h3>
            <ul className="space-y-2">
              {events.map((e) => {
                const active = e.start <= now && e.end > now
                const impact = eventImpact(e, now)
                return (
                  <li key={e.id} className="rounded-lg bg-slate-50 p-2 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-semibold">{e.title}</div>
                        <div className="text-xs text-slate-500">
                          {e.location} · {active ? 'happening now' : e.start > now ? `starts ${formatTime(e.start)}` : 'ended'} ·{' '}
                          {e.size}
                        </div>
                      </div>
                      <button
                        onClick={() => setEvents((list) => list.filter((x) => x.id !== e.id))}
                        className="text-xs text-slate-400 hover:text-rose-600"
                        aria-label={`Remove ${e.title}`}
                      >
                        ✕
                      </button>
                    </div>
                    {impact > 0 && <div className="mt-1 text-xs font-medium text-violet-700">+{impact}% busyness nearby</div>}
                  </li>
                )
              })}
            </ul>
            <div className="mt-4 space-y-2 border-t border-slate-100 pt-4">
              <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Drop an event (demo)</div>
              <input
                value={newEvent.title}
                onChange={(e) => setNewEvent((n) => ({ ...n, title: e.target.value }))}
                className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
              />
              <div className="flex gap-2">
                <select
                  value={newEvent.buildingId}
                  onChange={(e) => setNewEvent((n) => ({ ...n, buildingId: e.target.value }))}
                  className="min-w-0 flex-1 rounded-md border border-slate-200 px-2 py-1.5 text-sm"
                >
                  {school.buildings.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
                <select
                  value={newEvent.size}
                  onChange={(e) => setNewEvent((n) => ({ ...n, size: e.target.value as EventSize }))}
                  className="rounded-md border border-slate-200 px-2 py-1.5 text-sm"
                >
                  {SIZES.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </div>
              <button onClick={addEvent} className="w-full rounded-lg bg-violet-600 py-2 text-sm font-semibold text-white hover:bg-violet-700">
                Add event happening now
              </button>
            </div>
          </section>
        </aside>

        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <div className="flex items-center gap-2">
              {source === 'live' && (
                <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 font-medium text-emerald-700">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" /> Live LibCal availability
                </span>
              )}
              {source === 'demo' && (
                <span className="rounded-full bg-amber-50 px-3 py-1 font-medium text-amber-700">
                  {forceDemo ? 'Demo availability data' : 'No live LibCal slots right now · showing demo data'}
                </span>
              )}
              <span className="text-slate-500">
                {school.name} · as of {formatTime(now)}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-slate-600">
                <input type="checkbox" checked={forceDemo} onChange={(e) => setForceDemo(e.target.checked)} />
                Use demo data
              </label>
              <button onClick={() => setRefreshKey((k) => k + 1)} className="rounded-lg border border-slate-300 px-3 py-1 font-medium hover:bg-white">
                Refresh
              </button>
            </div>
          </div>

          {!availability ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-500">Checking room availability…</div>
          ) : best ? (
            <RoomCard school={school} rec={best} featured />
          ) : (
            <div className="rounded-2xl border-2 border-dashed border-slate-300 bg-white p-6">
              <h2 className="text-xl font-bold">No room fits right now</h2>
              <p className="mt-1 text-slate-600">
                {nextOpening
                  ? `Next opening for ${prefs.groupSize}: ${nextOpening.room.name} at ${formatTime(nextOpening.status!.freeFrom!)}.`
                  : 'Nothing else opens up today. Try a smaller group or another school.'}
              </p>
            </div>
          )}

          <CampusMap school={school} stats={buildingStats} highlightId={best?.room.buildingId} />

          <div className="grid gap-4 md:grid-cols-3">
            {school.buildings.map((b) => {
              const s = buildingStats.get(b.id)!
              const tone = busynessLabel(s.busyness)
              return (
                <div key={b.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold">{b.name}</div>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tone.bg} ${tone.text}`}>{tone.label}</span>
                  </div>
                  <ul className="mt-3 space-y-1.5">
                    {s.floors.map((f) => (
                      <li key={f.floor} className="flex items-center gap-2 text-xs">
                        <span className="w-14 font-medium">{floorName(f.floor)}</span>
                        <span className="w-20 capitalize text-slate-500">{f.noise}</span>
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                          <div className={`h-full ${busynessLabel(f.busyness).dot} transition-all duration-500`} style={{ width: `${f.busyness}%` }} />
                        </div>
                        <span className="w-16 shrink-0 text-right text-slate-500">
                          {f.free}/{f.total} free
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })}
          </div>

          {recs.length > 1 && (
            <section>
              <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">Other good options</h3>
              <div className="space-y-2">
                {recs.slice(1, 8).map((rec) => (
                  <RoomCard key={rec.room.eid} school={school} rec={rec} />
                ))}
              </div>
            </section>
          )}

          <p className="pb-6 text-xs text-slate-400">
            Room availability comes from each library's public LibCal page; booking happens on LibCal. Floor noise tags and campus events are
            demo estimates for the hackathon.
          </p>
        </div>
      </main>
    </div>
  )
}
