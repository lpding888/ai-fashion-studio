# Task business rules

## 1) Reference limits
- Total ref cap: `MAX_TOTAL_IMAGES = 14`
  - Legacy create: `files + face_refs + style_refs + file_urls + face_ref_urls + style_ref_urls`
  - Direct: `garment + face` (style refs are not sent, but still counted)
- Direct shots per task: `MAX_DIRECT_SHOTS = 6`
- Direct upload garment cap: `garment_images <= 6`
- Direct URL garment cap: `garmentUrls <= 14`
- Preset selection caps (direct):
  - style preset: max 1
  - pose preset: max 4
  - face preset: max 3

## 2) Direct vs Legacy classification
Any of the following means a task is Direct:
- `task.directPrompt` is set
- `task.scene === 'Direct'`
- `shots[].type === 'DirectPrompt'`

Used by `retryFailedShots` to route Direct regenerate vs Legacy retry.

## 3) Creation entrypoints
- Legacy/Storyboard: `POST /api/tasks` (multipart or JSON URL)
- Direct (upload): `POST /api/tasks/direct`
- Direct (URL): `POST /api/tasks/direct-urls`
- `workflow=hero_storyboard` switches to storyboard flow (default is legacy)

## 4) Rationale
- Cost and stability: cap payload size and queue pressure
- Quality: too many refs dilute prompt and style consistency
