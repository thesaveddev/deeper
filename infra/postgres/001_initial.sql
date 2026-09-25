create extension if not exists pgcrypto;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  account_id text unique,
  device_id text unique not null,
  premium_entitlement boolean not null default false,
  free_hosted_games_remaining integer not null default 10 check (free_hosted_games_remaining >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists profiles (
  user_id uuid primary key references users(id) on delete cascade,
  display_name varchar(32) not null,
  age_confirmed boolean not null default false
);

create table if not exists categories (
  id text primary key,
  title text not null,
  description text not null,
  is_premium boolean not null default false,
  is_adult boolean not null default false
);

create table if not exists decks (
  id uuid primary key default gen_random_uuid(),
  category_id text not null references categories(id),
  version integer not null default 1,
  is_active boolean not null default true
);

create table if not exists questions (
  id text primary key,
  category_id text not null references categories(id),
  question text not null,
  difficulty smallint not null,
  intensity smallint not null,
  age_rating text not null,
  is_adult boolean not null default false,
  is_premium boolean not null default false,
  is_active boolean not null default true
);

create table if not exists deck_questions (
  deck_id uuid not null references decks(id) on delete cascade,
  question_id text not null references questions(id),
  position integer not null,
  primary key (deck_id, question_id)
);

create table if not exists rooms (
  id uuid primary key,
  room_code varchar(4) unique not null,
  host_user_id uuid references users(id),
  category_id text not null references categories(id),
  status text not null,
  created_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now()
);

create table if not exists room_players (
  room_id uuid not null references rooms(id) on delete cascade,
  user_id uuid not null references users(id),
  display_name varchar(32) not null,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  primary key (room_id, user_id)
);

create table if not exists games (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id),
  host_user_id uuid not null references users(id),
  category_id text not null references categories(id),
  started_at timestamptz,
  ended_at timestamptz,
  end_reason text,
  credit_consumption_key text unique not null
);

create table if not exists game_players (
  game_id uuid not null references games(id) on delete cascade,
  user_id uuid not null references users(id),
  primary key (game_id, user_id)
);

create table if not exists game_questions (
  game_id uuid not null references games(id) on delete cascade,
  question_id text not null references questions(id),
  position integer not null,
  primary key (game_id, question_id)
);

create table if not exists reactions (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  question_position integer not null,
  user_id uuid not null references users(id),
  reaction text not null,
  created_at timestamptz not null default now()
);

create table if not exists entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  provider text not null,
  entitlement_key text not null,
  active boolean not null default false,
  expires_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (user_id, provider, entitlement_key)
);

create table if not exists purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  provider text not null,
  product_id text not null,
  transaction_id text unique,
  purchased_at timestamptz not null default now()
);

create table if not exists analytics_metadata (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete set null,
  event_name text not null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- Deliberately absent: an answers table. Active answers are ephemeral server state in V1.
