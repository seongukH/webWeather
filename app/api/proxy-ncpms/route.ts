import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const allowed = ['apiKey', 'serviceCode', 'cropCode', 'diseaseWeedCode', 'displayDate']

  const filteredParams = new URLSearchParams()
  for (const key of allowed) {
    const val = params.get(key)
    if (val) filteredParams.set(key, val)
  }

  if (!filteredParams.get('apiKey') || !filteredParams.get('serviceCode')) {
    return NextResponse.json(
      { error: 'apiKey, serviceCode 파라미터 필수' },
      { status: 400 }
    )
  }

  const url = 'http://ncpms.rda.go.kr/npmsAPI/service?' + filteredParams.toString()

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
        'Content-Type': 'text/xml; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
      },
    })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json(
      { error: 'NCPMS API 연결 실패: ' + message },
      { status: 502 }
    )
  }
}
