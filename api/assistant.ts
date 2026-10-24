interface Body {
  message: string
  prefs: Record<string, unknown>
  now: string
  weekday: string
  school: { name: string; maxBookingMin: number; slotMin: number; bookAheadDays: number; buildings: { id: string; name: string }[] }
}

const SYSTEM = `You turn a student's study-room request into JSON filters for a room finder. Only output JSON with these optional keys:
noise: "quiet" | "moderate" | "collaborative"
groupSize: integer number of people including the student
durationMin: minutes wanted
preferBuildingId: one of the given building ids, or null to clear
avoidBuildingId: one of the given building ids, or null to clear
finals: boolean, true if they mention finals/exam crunch
date: "YYYY-MM-DD" day they want the room (resolve "wednesday", "tomorrow" etc. from the given current library time and weekday; must be within bookAheadDays of today)
time: "now", "any" (any time that day), or "HH:MM" 24-hour start time
note: optional one-sentence friendly remark (e.g. if they asked for more than the max booking length)
Omit keys the message does not imply. Treat the message as a change to the current filters.`

export async function POST(request: Request): Promise<Response> {
  const key = process.env.OPENAI_API_KEY
  if (!key) return new Response('Assistant AI not configured', { status: 501 })
  const body = (await request.json()) as Body
  if (typeof body.message !== 'string' || body.message.length > 500) return new Response('Bad request', { status: 400 })

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      temperature: 0,
      messages: [
        { role: 'system', content: SYSTEM },
        {
          role: 'user',
          content: JSON.stringify({
            school: body.school.name,
            maxBookingMin: body.school.maxBookingMin,
            slotMin: body.school.slotMin,
            bookAheadDays: body.school.bookAheadDays,
            now: body.now,
            weekday: body.weekday,
            buildings: body.school.buildings,
            currentFilters: body.prefs,
            message: body.message,
          }),
        },
      ],
    }),
  })
  if (!res.ok) return new Response('Upstream error', { status: 502 })
  const data = (await res.json()) as { choices: { message: { content: string } }[] }
  return new Response(data.choices[0].message.content, { headers: { 'Content-Type': 'application/json' } })
}
