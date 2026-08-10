# Push Notifications

Cruizr registers Expo push tokens in `push_tokens`. Database triggers enqueue friend-request and meet events in `notification_events`. The `send-push-notifications` Supabase Edge Function delivers pending events through Expo's push service.

## Required Supabase Setup

The Edge Function is deployed to the linked CarMeet project. Configure a scheduled invocation in the Supabase Dashboard under **Edge Functions** or **Integrations > Cron**:

- Function: `send-push-notifications`
- Method: `POST`
- Schedule: every minute (`* * * * *`)

The scheduled invocation must authenticate with the project service-role key. Never put that key in the app, `.env`, or Git.

## Mobile Setup

Build and install a new development client after changing `app.json` or notification dependencies:

```bash
npx eas-cli@latest build --profile development --platform ios
```

The app requests notification permission after sign-in and stores the device token for the signed-in user. Signing out removes the current device token.

## Test Flow

1. Install the new development build on two physical iPhones.
2. Sign in as two different users and allow notifications.
3. Confirm both devices have rows in `push_tokens`.
4. Send a friend request from one account to the other.
5. Confirm a `notification_events` row is created for the recipient.
6. Run or wait for the scheduled function and confirm the recipient receives a push notification.
7. Tap the notification and confirm it opens the relevant map/profile destination.
8. RSVP to or edit a meet and verify the host/attendees receive the corresponding notification.
