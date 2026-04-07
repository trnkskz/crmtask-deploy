import { runPricingBootstrap } from '../src/bootstrap/pricing-bootstrap'

runPricingBootstrap().catch((e) => {
  console.error('Seed failed:', e)
  process.exitCode = 1
})
