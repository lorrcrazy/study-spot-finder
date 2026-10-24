import { busynessLabel } from '../scoring'
import type { BuildingStats } from '../scoring'
import type { School } from '../schools'

interface Props {
  school: School
  stats: Map<string, BuildingStats>
  highlightId?: string
}

export function CampusMap({ school, stats, highlightId }: Props) {
  return (
    <div className="relative h-72 overflow-hidden rounded-2xl border border-slate-200 bg-[radial-gradient(circle_at_1px_1px,#cbd5e1_1px,transparent_0)] [background-size:18px_18px] bg-white">
      <div className="absolute left-3 top-3 rounded-md bg-white/90 px-2 py-1 text-xs font-medium text-slate-500 shadow-sm">
        Live busyness map · {school.shortName}
      </div>
      {school.buildings.map((building) => {
        const s = stats.get(building.id)
        if (!s) return null
        const tone = busynessLabel(s.busyness)
        const highlighted = building.id === highlightId
        return (
          <div
            key={building.id}
            className="absolute -translate-x-1/2 -translate-y-1/2 transition-all duration-500"
            style={{ left: `${building.x}%`, top: `${building.y}%` }}
          >
            <div className="flex flex-col items-center gap-1">
              <div className="relative">
                <div
                  className={`flex h-16 w-16 items-center justify-center rounded-full text-lg font-bold text-white shadow-lg transition-colors duration-500 ${tone.dot} ${highlighted ? 'ring-4 ring-gt-gold ring-offset-2' : ''}`}
                >
                  {s.busyness}%
                </div>
                {s.events.length > 0 && (
                  <span className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-violet-600 text-xs text-white shadow">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-400 opacity-60" />
                    <span className="relative">{s.events.length}</span>
                  </span>
                )}
              </div>
              <div className="whitespace-nowrap rounded-md bg-white/95 px-2 py-0.5 text-xs font-semibold text-slate-700 shadow-sm">
                {building.name}
              </div>
              <div className="text-[11px] text-slate-500">
                {s.free}/{s.total} rooms free
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
