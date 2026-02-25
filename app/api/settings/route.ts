import { NextRequest, NextResponse } from 'next/server'
import sql from '@/lib/db'

export async function GET() {
  try {
    const rows = await sql`SELECT setting_key, setting_value FROM settings`

    const settings: Record<string, string> = {}
    for (const row of rows) {
      settings[row.setting_key] = row.setting_value
    }

    return NextResponse.json({ success: true, settings })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ success: false, error: 'DB 오류: ' + message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const input = await request.json()
    if (!input || typeof input !== 'object') {
      return NextResponse.json({ success: false, error: 'JSON body 필요' }, { status: 400 })
    }

    const allowedKeys = ['vworldKey', 'ncpmsKey', 'agroKey', 'geminiKey']
    const saved: string[] = []

    for (const [key, value] of Object.entries(input)) {
      if (!allowedKeys.includes(key)) continue

      await sql`
        INSERT INTO settings (setting_key, setting_value)
        VALUES (${key}, ${String(value)})
        ON CONFLICT (setting_key)
        DO UPDATE SET setting_value = ${String(value)}, updated_at = NOW()
      `
      saved.push(key)
    }

    return NextResponse.json({
      success: true,
      message: `${saved.length}개 설정 저장됨`,
      saved,
    })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ success: false, error: 'DB 오류: ' + message }, { status: 500 })
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}
