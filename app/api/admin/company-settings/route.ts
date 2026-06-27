import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { getCompanySettings, updateCompanySettings } from '@/lib/services/companySettings'

export async function GET(request: Request) {
  const auth = await requireAdmin(request)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const settings = await getCompanySettings()
    return NextResponse.json({ settings })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to load settings.' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin(request)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = (await request.json()) as {
    companyName?: string
    logoUrl?: string | null
    address?: string | null
    telephone?: string | null
    email?: string | null
    website?: string | null
    reportFooter?: string | null
    reportPrimaryColor?: string
    reportAccentColor?: string
  }

  try {
    const settings = await updateCompanySettings(body)
    return NextResponse.json({ settings })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to update settings.' }, { status: 500 })
  }
}
