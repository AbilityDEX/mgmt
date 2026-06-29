import fs from 'fs'

const token = process.argv[2]
if (!token) {
  console.error('Usage: node scripts/post-machine.js <token>')
  process.exit(2)
}

async function main() {
  const res = await fetch('http://127.0.0.1:3000/api/machines', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name: 'CI Machine', area: 'QA', assigned_user: null, inspection_deadline: '09:30', template_id: 'b14a505b-a0cb-4adf-a0b3-2d8f0ef024be', inspection_frequency: 'Daily', reminder_days_before_due: 0, auto_generate_inspection: false }),
  })
  const text = await res.text()
  console.log('STATUS', res.status)
  try { console.log(JSON.parse(text)) } catch (e) { console.log(text) }
}

main().catch(e => { console.error(e); process.exit(1) })
