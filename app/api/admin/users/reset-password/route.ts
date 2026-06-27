import { NextResponse } from 'next/server'
import { requireAdmin, serverConfigErrorMessage, supabaseAdmin } from '@/lib/admin'

export async function POST(request: Request) {
  const auth = await requireAdmin(request)
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  try {
    const { user_id, password } = (await request.json()) as { user_id: string; password: string }
    if (!user_id || !password) {
      return NextResponse.json({ error: 'User id and password are required' }, { status: 400 })
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: serverConfigErrorMessage }, { status: 500 })
    }

    const { error } = await supabaseAdmin.auth.admin.updateUserById(user_id, {
      password,
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to reset password' },
      { status: 500 }
    )
  }
}
