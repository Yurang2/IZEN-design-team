# LINE Reminder Addendum

Date: 2026-03-11

## Purpose

- Send personal LINE reminders for the assignee `조정훈`.
- Morning reminder at 09:00 KST.
- Evening status reminder at 17:30 KST.

## Worker env

- `LINE_CHANNEL_ACCESS_TOKEN`
- `LINE_NOTIFY_TARGET_USER_ID`
- `LINE_NOTIFY_ASSIGNEE_NAME` (optional, default: `조정훈`)

## Cron

- `0 0 * * *` -> 09:00 KST morning reminder
- `30 8 * * *` -> 17:30 KST evening reminder

## Manual test endpoint

- `POST /api/admin/line/reminders/send?kind=morning`
- `POST /api/admin/line/reminders/send?kind=evening`

## Message rules

- Target tasks: task rows where `assignee` contains `조정훈`
- Excluded statuses: `완료`, `보관` and their English equivalents
- Morning message:
  - `★ 오늘 마감`
  - `! 지연`
  - `진행중 / 확인 필요`
- Evening message:
  - lists all still-open tasks
  - ends with `틀린 게 있으면 수정해주세요.`
