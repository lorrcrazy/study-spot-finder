import { bookingUrl } from '../libcal'
import { busynessLabel } from '../scoring'
import type { Recommendation } from '../scoring'
import type { School } from '../schools'

interface Props {
  school: School
  rec: Recommendation
  date: string
  heading?: string
  featured?: boolean
}

export function RoomCard({ school, rec, date, heading = 'Best spot right now', featured }: Props) {
  const building = school.buildings.find((b) => b.id === rec.room.buildingId)!
  const tone = busynessLabel(rec.busyness)
  const floorLabel = rec.room.floor === 'G' ? 'Ground floor' : `Floor ${rec.room.floor}`
  const location = building.name.includes('Floor') ? building.name : `${building.name} · ${floorLabel}`

  if (!featured) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
        <div className="min-w-0">
          <div className="truncate font-semibold">{rec.room.name}</div>
          <div className="truncate text-xs text-slate-500">
            {location} · {rec.reasons[1]}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tone.bg} ${tone.text}`}>{tone.label}</span>
          <a
            href={bookingUrl(school, rec.room.eid, date)}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-gt-navy px-3 py-1.5 text-sm font-semibold text-gt-navy hover:bg-gt-navy hover:text-white"
          >
            Book
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border-2 border-gt-gold bg-gradient-to-br from-white to-amber-50 p-6 shadow-md">
      <div className="text-xs font-bold uppercase tracking-widest text-gt-gold">{heading}</div>
      <div className="mt-1 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl font-extrabold text-gt-navy">{rec.room.name}</h2>
          <p className="text-slate-600">
            {location}
          </p>
        </div>
        <a
          href={bookingUrl(school, rec.room.eid, date)}
          target="_blank"
          rel="noreferrer"
          className="rounded-xl bg-gt-navy px-6 py-3 text-lg font-bold text-white shadow hover:bg-[#00213d]"
        >
          Book on LibCal →
        </a>
      </div>
      <ul className="mt-4 flex flex-wrap gap-2">
        {rec.reasons.map((reason) => (
          <li key={reason} className="rounded-full bg-white px-3 py-1 text-sm text-slate-700 shadow-sm ring-1 ring-slate-200">
            {reason}
          </li>
        ))}
      </ul>
      {rec.warnings.map((warning) => (
        <p key={warning} className="mt-3 rounded-lg bg-violet-50 px-3 py-2 text-sm text-violet-800">
          Heads up: {warning}
        </p>
      ))}
    </div>
  )
}
