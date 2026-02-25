import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const allowed = ['service', 'request', 'data', 'key', 'format', 'size', 'page', 'crs', 'geomFilter', 'attrFilter', 'domain']

  const filteredParams = new URLSearchParams()
  for (const key of allowed) {
    const val = params.get(key)
    if (val) filteredParams.set(key, val)
  }

  // Defaults
  if (!filteredParams.get('service')) filteredParams.set('service', 'data')
  if (!filteredParams.get('request')) filteredParams.set('request', 'GetFeature')
  if (!filteredParams.get('format')) filteredParams.set('format', 'json')
  if (!filteredParams.get('crs')) filteredParams.set('crs', 'EPSG:4326')

  if (!filteredParams.get('data') || !filteredParams.get('key')) {
    return NextResponse.json(
      { error: 'data, key 파라미터 필수' },
      { status: 400 }
    )
  }

  const url = 'https://api.vworld.kr/req/data?' + filteredParams.toString()

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'webweather-proxy/1.0',
      },
    })

    const body = await response.text()

    return new NextResponse(body, {
      status: response.status,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
      },
    })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json(
      { error: 'VWorld API 연결 실패: ' + message },
      { status: 502 }
    )
  }
}
