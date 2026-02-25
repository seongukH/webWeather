import { NextRequest, NextResponse } from 'next/server'

const ALLOWED_HOSTS = ['ncpms.rda.go.kr', 'api.vworld.kr']

export async function GET(request: NextRequest) {
  const targetUrl = request.nextUrl.searchParams.get('url')

  if (!targetUrl) {
    return NextResponse.json({ error: 'url 파라미터 필수' }, { status: 400 })
  }

  // Validate domain
  let parsed: URL
  try {
    parsed = new URL(targetUrl)
  } catch {
    return NextResponse.json({ error: '유효하지 않은 URL' }, { status: 400 })
  }

  if (!ALLOWED_HOSTS.includes(parsed.hostname)) {
    return NextResponse.json(
      { error: '허용되지 않은 도메인: ' + parsed.hostname },
      { status: 403 }
    )
  }

  try {
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 webweather-proxy/1.0',
      },
    })

    const contentType = response.headers.get('content-type') || 'text/html; charset=utf-8'
    const body = await response.arrayBuffer()

    return new NextResponse(body, {
      status: response.status,
      headers: {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
      },
    })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: '프록시 연결 실패: ' + message }, { status: 502 })
  }
}
