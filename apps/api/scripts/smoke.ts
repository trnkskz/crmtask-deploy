type LoginResponse = {
  accessToken?: string
  requiresTwoFactor?: boolean
}

function baseUrl(): string {
  return (process.env.API_BASE_URL || 'http://localhost:3001/api').replace(/\/+$/, '')
}

async function request(path: string, init?: RequestInit) {
  const res = await fetch(`${baseUrl()}${path}`, init)
  const text = await res.text()
  return { res, text }
}

async function main() {
  const email = process.env.SMOKE_EMAIL || process.env.ADMIN_EMAIL || 'admin@crmtask.local'
  const password = process.env.SMOKE_PASSWORD || process.env.ADMIN_PASSWORD || 'ReplaceMeNow_Admin'

  const health = await request('/health')
  if (!health.res.ok) {
    throw new Error(`Health check failed (${health.res.status}): ${health.text}`)
  }

  const docs = await request('/docs')
  if (!docs.res.ok) {
    throw new Error(`Swagger docs check failed (${docs.res.status})`)
  }

  const login = await request('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!login.res.ok) {
    throw new Error(`Login failed (${login.res.status}): ${login.text}`)
  }
  const loginBody = JSON.parse(login.text) as LoginResponse
  if (loginBody.requiresTwoFactor) {
    throw new Error('Smoke login cannot continue: 2FA is enabled for this user')
  }
  if (!loginBody.accessToken) {
    throw new Error('Smoke login did not return accessToken')
  }

  const authHeader = { Authorization: `Bearer ${loginBody.accessToken}` }
  const businesses = await request('/accounts?page=1&limit=1', { headers: authHeader })
  if (!businesses.res.ok) {
    throw new Error(`Accounts check failed (${businesses.res.status}): ${businesses.text}`)
  }

  const tasks = await request('/tasks?page=1&limit=1', { headers: authHeader })
  if (!tasks.res.ok) {
    throw new Error(`Tasks check failed (${tasks.res.status}): ${tasks.text}`)
  }

  console.log('Smoke OK')
  console.log(`API: ${baseUrl()}`)
  console.log('Checks: health, docs, login, accounts, tasks')
}

main().catch((err) => {
  console.error('Smoke failed:', err instanceof Error ? err.message : err)
  process.exitCode = 1
})
