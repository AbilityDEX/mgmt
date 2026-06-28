import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { getSmtpConfigSummary, saveSmtpConfig, saveSmtpOrgSettings } from '@/lib/services/smtpConfig'

export async function GET(request: Request) {
  const auth = await requireAdmin(request)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const config = await getSmtpConfigSummary()
    return NextResponse.json({ config })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to load SMTP configuration.' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin(request)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = (await request.json()) as {
    host?: string
    port?: number
    username?: string
    password?: string
    encryption?: 'SSL/TLS' | 'STARTTLS' | 'NONE'
    fromName?: string
    fromEmail?: string
    replyToEmail?: string | null
    archiveEmail?: string | null
    supportEmail?: string | null
    timezone?: string | null
    dateFormat?: string | null
    timeFormat?: string | null
  }

  const hasSmtpFields =
    body.host !== undefined ||
    body.port !== undefined ||
    body.username !== undefined ||
    body.password !== undefined ||
    body.encryption !== undefined ||
    body.fromName !== undefined ||
    body.fromEmail !== undefined ||
    body.replyToEmail !== undefined

  const hasOrgFields =
    body.archiveEmail !== undefined ||
    body.supportEmail !== undefined ||
    body.timezone !== undefined ||
    body.dateFormat !== undefined ||
    body.timeFormat !== undefined

  if (hasSmtpFields) {
    const result = await saveSmtpConfig({
      host: body.host ?? '',
      port: Number(body.port ?? 0),
      username: body.username ?? '',
      password: body.password ?? '',
      encryption: body.encryption ?? 'STARTTLS',
      fromName: body.fromName ?? '',
      fromEmail: body.fromEmail ?? '',
      replyToEmail: body.replyToEmail ?? null,
    })

    if (!result.ok) {
      return NextResponse.json({ error: result.errors.join(' ') }, { status: 400 })
    }
  }

  if (hasOrgFields) {
    const orgResult = await saveSmtpOrgSettings({
      archiveEmail: body.archiveEmail ?? null,
      supportEmail: body.supportEmail ?? null,
      timezone: body.timezone ?? null,
      dateFormat: body.dateFormat ?? null,
      timeFormat: body.timeFormat ?? null,
    })

    if (!orgResult.ok) {
      return NextResponse.json({ error: orgResult.errors.join(' ') }, { status: 400 })
    }
  }

  const config = await getSmtpConfigSummary()

  if (!hasSmtpFields && !hasOrgFields) {
    return NextResponse.json({ error: 'No SMTP or organization settings provided.' }, { status: 400 })
  }

  return NextResponse.json({ config, message: 'SMTP/organization settings saved.' })
}
