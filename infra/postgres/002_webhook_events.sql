-- RevenueCat webhook delivery log.
--
-- RevenueCat guarantees "at least one delivery" and explicitly warns that the
-- same event can arrive more than once. Retries reuse the same `id`, so a
-- unique constraint on (provider, event_id) is what makes handling idempotent.
--
-- The payload is not stored: it can contain subscriber attributes we have no
-- reason to keep. Recording the fact that an event was handled is enough.
create table if not exists webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_id text not null,
  event_type text not null,
  app_user_id text,
  environment text,
  received_at timestamptz not null default now(),
  unique (provider, event_id)
);

create index if not exists webhook_events_received_at_idx on webhook_events (received_at);
