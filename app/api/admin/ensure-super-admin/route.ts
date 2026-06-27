import { NextResponse } from 'next/server'
import { ensureSystemSuperAdmin, serverConfigErrorMessage, supabaseAdmin } from '@/lib/admin'

export async function GET() {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: serverConfigErrorMessage }, { status: 500 })
  }

  try {
    await ensureSystemSuperAdmin()
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to ensure super admin' },
      { status: 500 }
    )
  }
}
