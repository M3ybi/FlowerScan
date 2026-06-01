# Plantie push reminder architecture

Current phase keeps existing web push behavior unchanged and adds only UI/service placeholders for per-plant reminder settings.

## Reminder types

- Watering reminders: based on each plant watering interval and last watered date.
- Fertilizing reminders: future interval-based reminders using the same delivery pipeline.
- Custom reminders: future user-authored plant reminders.

## Future native delivery

- Use Capacitor Push Notifications in the mobile shell.
- Use Firebase Cloud Messaging for Android device tokens.
- Use APNs through the Capacitor/FCM stack for iOS.
- Store device registrations in Supabase `push_subscriptions`.
- Send scheduled reminders from Supabase scheduled jobs or Netlify scheduled functions.

## Safety constraints

- Do not send empty reminders.
- Do not log push tokens in client or function logs.
- Keep reminder decisions server-side once native push is enabled.
- Keep web push available until mobile migration is complete.
