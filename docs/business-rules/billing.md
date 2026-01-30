# Billing rules (TaskBillingService)

## 1) Base multipliers
- Resolution multiplier: `1K=1`, `2K=2`, `4K=4`

## 2) Estimate (Legacy/Direct)
`estimateLegacyTaskCredits`:
- `layout_mode = Grid` -> base units `2`
- otherwise -> base units `shotCount`
- estimate = base units x resolution multiplier

## 3) Actual charging
- Successful individual renders: `successfulImages x multiplier`
- Successful grid render: `2 x multiplier`
- Hero single: `1 x multiplier`
- Hero grid: `2 x multiplier`

## 4) Reserve + settle
- Reserve: pre-charge max amount and append `billingEvents`
- Settle: reconcile based on actual successes
  - actual < reserved -> refund delta
  - actual = reserved -> no change
  - actual > reserved -> extra charge (defensive)

## 5) Errors
- Billing errors are recorded in `task.billingError` without blocking results
