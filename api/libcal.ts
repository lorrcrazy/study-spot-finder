const TARGETS: Record<string, string> = {
  gt: 'https://libcal.library.gatech.edu',
  ksu: 'https://kennesaw.libcal.com',
  gsouthern: 'https://georgiasouthern.libcal.com',
}

const ALLOWED_PATHS = new Set(['spaces/availability/grid'])

export async function POST(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const target = TARGETS[url.searchParams.get('school') ?? '']
  const path = url.searchParams.get('path') ?? ''
  if (!target || !ALLOWED_PATHS.has(path)) return new Response('Not found', { status: 404 })

  const upstream = await fetch(`${target}/${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Referer: `${target}/spaces`,
      'X-Requested-With': 'XMLHttpRequest',
    },
    body: await request.text(),
  })
  return new Response(await upstream.text(), {
    status: upstream.status,
    headers: { 'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json', 'Cache-Control': 'no-store' },
  })
}
