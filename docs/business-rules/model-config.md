# Model config resolution (ModelConfigResolverService)

## 1) Snapshot build (buildSnapshotFromActive)
- Pull active runtime pools for BRAIN/PAINTER
- Require consistent `gateway/model` within a pool, otherwise throw
- Use the first runtime as primary `profileId`, keep full `profileIds`

## 2) Resolution priority
`resolveRuntime` order:
1) `profileId` (explicit)
2) `profileIds` (round-robin, skip invalid/mismatched)
3) `getActiveRuntime(kind)` fallback

## 3) Key pool behavior
- `brainKeys` / `painterKeys` returned only when pool keys exist
- Single key mode uses `brainKey` / `painterKey`

## 4) Fault tolerance
- Invalid/disabled IDs are skipped
- If all fail, fallback to active runtime
