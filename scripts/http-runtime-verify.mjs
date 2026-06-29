import { execFileSync } from 'child_process'
import fs from 'fs'

function readEnv() {
  const text = fs.readFileSync('.env.local', 'utf8')
  const lines = text.split(/\r?\n/)
  const out = {}
  for (const line of lines) {
    if (!line || line.trim().startsWith('#')) continue
    const idx = line.indexOf('=')
    if (idx === -1) continue
    out[line.slice(0, idx)] = line.slice(idx + 1)
  }
  return out
}

async function waitForServer(url, timeoutMs = 60_000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url)
      if (res.status === 200) return
    } catch (e) {
      // ignore
    }
    await new Promise((r) => setTimeout(r, 1000))
  }
  throw new Error(`Server did not become ready at ${url} within ${timeoutMs}ms`)
}

function getTokenUsingSigninHelper(email, password) {
  const out = execFileSync('node', ['scripts/signin-supabase.js', email, password], { encoding: 'utf8' })
  let json
  try {
    json = JSON.parse(out)
  } catch (e) {
    throw new Error('signin-supabase.js did not return valid JSON: ' + out)
  }
  if (!json.data || !json.data.session || !json.data.session.access_token) {
    throw new Error('No access token in signin output: ' + out)
  }
  return json.data.session.access_token
}

function expect(condition, msg) {
  if (!condition) throw new Error(msg)
}

async function run() {
  const env = readEnv()
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL
  if (!supabaseUrl) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL in .env.local')

  const rootUrl = 'http://127.0.0.1:3000'

  // Credentials used historically in this workspace helper
  const ADMIN_EMAIL = 'admin@mgmt.local'
  const ADMIN_PASS = 'Meg4vaux!'

  console.log('Waiting for server readiness...')
  await waitForServer(rootUrl)

  console.log('Signing in via signin-supabase.js helper')
  const token = getTokenUsingSigninHelper(ADMIN_EMAIL, ADMIN_PASS)
  console.log('Acquired token prefix:', token.slice(0, 12) + '...')

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }

  // Body must match scripts/post-machine.js exactly
  const machineBody = { name: 'CI Machine', area: 'QA', assigned_user: null, inspection_deadline: '09:30', template_id: 'b14a505b-a0cb-4adf-a0b3-2d8f0ef024be', inspection_frequency: 'Daily', reminder_days_before_due: 0, auto_generate_inspection: false }

  // 1) POST machine
  console.log('Ensuring server ready for POST')
  await waitForServer(rootUrl)
  const postRes = await fetch(`${rootUrl}/api/machines`, { method: 'POST', headers, body: JSON.stringify(machineBody) })
  const postText = await postRes.text()
  console.log('POST_STATUS', postRes.status)
  console.log(postText)
  expect(postRes.status === 200, `POST failed: ${postRes.status} ${postText}`)
  const postJson = JSON.parse(postText)
  const machineId = postJson.machine?.id
  expect(machineId, 'Created machine id missing')

  // 2) GET machine list
  console.log('Waiting for server before GET list')
  await waitForServer(rootUrl)
  const getRes = await fetch(`${rootUrl}/api/machines`, { headers })
  const getText = await getRes.text()
  console.log('GET_STATUS', getRes.status)
  console.log(getText)
  expect(getRes.status === 200, `GET machines failed: ${getRes.status}`)
  const listJson = JSON.parse(getText)
  const found = (listJson.machines || []).some((m) => m.id === machineId)
  expect(found, 'Created machine not found in list')

  // 4) PATCH machine
  console.log('Waiting for server before PATCH')
  await waitForServer(rootUrl)
  const patchBody = { id: machineId, name: 'CI Machine Updated', area: 'QA-Updated' }
  const patchRes = await fetch(`${rootUrl}/api/machines`, { method: 'PATCH', headers, body: JSON.stringify(patchBody) })
  const patchText = await patchRes.text()
  console.log('PATCH_STATUS', patchRes.status)
  console.log(patchText)
  expect(patchRes.status === 200, `PATCH failed: ${patchRes.status}`)

  // 5) GET again and verify updated values
  console.log('Waiting for server before GET verify')
  await waitForServer(rootUrl)
  const get2 = await fetch(`${rootUrl}/api/machines`, { headers })
  const get2Text = await get2.text()
  console.log('GET2_STATUS', get2.status)
  console.log(get2Text)
  expect(get2.status === 200, `GET after patch failed: ${get2.status}`)
  const list2 = JSON.parse(get2Text)
  const updated = (list2.machines || []).find((m) => m.id === machineId)
  expect(updated, 'Updated machine not present')
  expect(updated.name === 'CI Machine Updated', `Name not updated: ${updated.name}`)
  expect(updated.area === 'QA-Updated', `Area not updated: ${updated.area}`)

  // 6) DELETE machine
  console.log('Waiting for server before DELETE')
  await waitForServer(rootUrl)
  const delRes = await fetch(`${rootUrl}/api/machines`, { method: 'DELETE', headers, body: JSON.stringify({ id: machineId }) })
  const delText = await delRes.text()
  console.log('DELETE_STATUS', delRes.status)
  console.log(delText)
  expect(delRes.status === 200, `DELETE failed: ${delRes.status}`)

  // 7) GET again and verify not exists
  console.log('Waiting for server before final GET')
  await waitForServer(rootUrl)
  const finalGet = await fetch(`${rootUrl}/api/machines`, { headers })
  const finalText = await finalGet.text()
  console.log('FINAL_GET_STATUS', finalGet.status)
  console.log(finalText)
  expect(finalGet.status === 200, `Final GET failed: ${finalGet.status}`)
  const finalList = JSON.parse(finalText)
  const still = (finalList.machines || []).some((m) => m.id === machineId)
  expect(!still, 'Machine still present after delete')

  console.log('Machine CRUD sequence completed successfully')
}

run().catch((e) => { console.error('ERROR', e && e.stack ? e.stack : e); process.exit(1) })
