# Demo Requests

## Slack URL Verification

```bash
curl -X POST http://localhost:3000/webhooks/slack/events \
  -H "Content-Type: application/json" \
  -d '{"type":"url_verification","challenge":"hello"}'
```

## Slack Message Trigger

```bash
curl -X POST http://localhost:3000/webhooks/slack/events \
  -H "Content-Type: application/json" \
  -d '{
    "type":"event_callback",
    "event_id":"evt-demo-01",
    "event":{
      "type":"message",
      "channel":"C123",
      "ts":"1712345678.001",
      "thread_ts":"1712345678.001",
      "user":"U123",
      "text":"#task @sarah prepare incident retrospective by 2026-03-20. urgent blocker for leadership review"
    }
  }'
```

## Slack Reaction Trigger

```bash
curl -X POST http://localhost:3000/webhooks/slack/events \
  -H "Content-Type: application/json" \
  -d '{
    "type":"event_callback",
    "event_id":"evt-demo-02",
    "event":{
      "type":"reaction_added",
      "user":"U123",
      "reaction":"white_check_mark",
      "item":{"type":"message","channel":"C123","ts":"1712345678.001"}
    }
  }'
```

## Discord Trigger

```bash
curl -X POST http://localhost:3000/webhooks/discord/events \
  -H "Content-Type: application/json" \
  -d '{
    "id":"discord-evt-1",
    "channelId":"D321",
    "threadId":"T321",
    "userId":"U555",
    "content":"/todo @alex ship onboarding flow this week",
    "trigger":true
  }'
```

## Replay Failed Event

```bash
curl -X POST http://localhost:3000/api/replay/<event-id>
```
