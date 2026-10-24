import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { durationLabel, interpret } from '../assistant'
import { bookingUrl, dayLabel, formatTime } from '../libcal'
import { whenLabel } from '../scoring'
import type { Prefs, Recommendation, When } from '../scoring'
import type { School } from '../schools'

interface Message {
  id: number
  role: 'user' | 'assistant'
  text: string
  rec?: Recommendation
  alternatives?: Recommendation[]
  date?: string
}

interface Props {
  school: School
  prefs: Prefs
  now: string
  rank: (prefs: Prefs) => Promise<{ recs: Recommendation[]; when: When }>
  onApply: (prefs: Prefs) => void
}

const NOISE_TEXT = { quiet: 'quiet', moderate: 'some chatter OK', collaborative: 'group-friendly' } as const
const EXAMPLES = ['Quiet spot to lock in for 2 hours', 'Me and 3 friends for a project on Wednesday at 3pm', 'Somewhere chill tomorrow afternoon for 45 min']

let nextId = 1

export function Assistant({ school, prefs, now, rank, onApply }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [thinking, setThinking] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, thinking])

  const send = async (text: string) => {
    const message = text.trim()
    if (!message || thinking) return
    setInput('')
    setMessages((m) => [...m, { id: nextId++, role: 'user', text: message }])
    setThinking(true)
    const { patch, note } = await interpret(message, school, prefs, now)
    const next: Prefs = { ...prefs, ...patch }
    if (next.preferBuildingId && next.preferBuildingId === next.avoidBuildingId) {
      if (patch.avoidBuildingId) next.preferBuildingId = null
      else next.avoidBuildingId = null
    }
    onApply(next)
    const { recs, when } = await rank(next)
    const today = now.slice(0, 10)
    const label = whenLabel(when, today)
    const best = recs[0]
    const place = school.buildings.find((b) => b.id === next.preferBuildingId)?.name
    const avoid = school.buildings.find((b) => b.id === next.avoidBuildingId)?.name
    const understood = [
      label,
      NOISE_TEXT[next.noise],
      next.groupSize === 1 ? 'just you' : `${next.groupSize} people`,
      durationLabel(next.durationMin),
      place && `near ${place}`,
      avoid && `avoiding ${avoid}`,
    ]
      .filter(Boolean)
      .join(' · ')
    const nothingParsed = Object.keys(patch).length === 0
    let reply = nothingParsed
      ? `I couldn't pick out what you need, so I kept your filters (${understood}). Try something like "quiet room for 2 people Wednesday at 3pm".`
      : `Got it: ${understood}.`
    if (note) reply += ` ${note}`
    if (best) {
      const building = school.buildings.find((b) => b.id === best.room.buildingId)!
      const from = formatTime(best.status.freeFrom!)
      const until = formatTime(best.status.freeUntil!)
      if (place && best.room.buildingId !== next.preferBuildingId) reply += ` Nothing in ${place} fits that well ${label}.`
      reply += ` Head to ${best.room.name} in ${building.name}: ${best.reasons[0].toLowerCase()}, ${best.reasons[2].toLowerCase()}, ${when.isNow ? `free until ${until}` : `free ${from}–${until}`}.`
      if (best.warnings.length) reply += ` Heads up: ${best.warnings[0]}.`
      const day = dayLabel(when.date, today)
      if (!when.isNow) reply += ` Book opens LibCal on ${/^(Today|Tomorrow)$/.test(day) ? day.toLowerCase() : day}; tap the ${from} slot.`
    } else reply += ` Nothing at ${school.shortName} fits that ${label}. Try fewer people, a shorter block, or another time.`
    setMessages((m) => [...m, { id: nextId++, role: 'assistant', text: reply, rec: best, alternatives: recs.slice(1, 3), date: when.date }])
    setThinking(false)
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    send(input)
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gt-navy text-sm font-bold text-gt-gold">AI</span>
        <div>
          <h3 className="font-bold text-gt-navy">Study spot assistant</h3>
          <p className="text-xs text-slate-500">Describe the room and vibe you want. Ask for a day and time too, up to {school.bookAheadDays} days ahead at {school.shortName}.</p>
        </div>
      </div>

      {messages.length > 0 && (
        <div ref={listRef} className="mt-4 max-h-80 space-y-3 overflow-y-auto pr-1">
          {messages.map((m) =>
            m.role === 'user' ? (
              <div key={m.id} className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-gt-navy px-3 py-2 text-sm text-white">
                {m.text}
              </div>
            ) : (
              <div key={m.id} className="max-w-[90%] space-y-2 rounded-2xl rounded-bl-sm bg-slate-100 px-3 py-2 text-sm text-slate-800">
                <p>{m.text}</p>
                {m.rec && (
                  <a
                    href={bookingUrl(school, m.rec.room.eid, m.date)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-block rounded-lg bg-gt-navy px-3 py-1.5 font-semibold text-white hover:bg-[#00213d]"
                  >
                    Book {m.rec.room.name} on LibCal →
                  </a>
                )}
                {m.alternatives && m.alternatives.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    Or:
                    {m.alternatives.map((alt) => (
                      <a
                        key={alt.room.eid}
                        href={bookingUrl(school, alt.room.eid, m.date)}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-md border border-slate-300 bg-white px-2 py-0.5 font-medium text-gt-navy hover:border-gt-navy"
                      >
                        {alt.room.name}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ),
          )}
          {thinking && <div className="w-16 rounded-2xl bg-slate-100 px-3 py-2 text-sm text-slate-500">…</div>}
        </div>
      )}

      {messages.length === 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {EXAMPLES.map((ex) => (
            <button key={ex} onClick={() => send(ex)} className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600 hover:border-gt-navy hover:text-gt-navy">
              {ex}
            </button>
          ))}
        </div>
      )}

      <form onSubmit={onSubmit} className="mt-3 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder='e.g. "quiet room near Clough for me and a friend, 90 min"'
          className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-gt-navy focus:outline-none"
        />
        <button type="submit" disabled={thinking || !input.trim()} className="rounded-lg bg-gt-gold px-4 py-2 text-sm font-bold text-gt-navy disabled:opacity-50">
          Ask
        </button>
      </form>
    </section>
  )
}
