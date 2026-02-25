import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const queryString = request.nextUrl.search.replace(/^\?/, '')
  const url = 'http://ncpms.rda.go.kr/npmsAPI/service?' + queryString + '&serviceType=AA001'

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 webweather-proxy/1.0',
      },
    })

    const body = await response.text()

    return new NextResponse(body, {
      status: response.status,
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
      },
    })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    return new NextResponse(
      `<?xml version="1.0" encoding="UTF-8"?><error>${message}</error>`,
      {
        status: 502,
        headers: { 'Content-Type': 'application/xml; charset=utf-8' },
      }
    )
  }
}
