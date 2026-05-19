
-- Extensions
create extension if not exists vector;

-- Profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy "profiles_select_own" on public.profiles for select using (auth.uid() = id);
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id);
create policy "profiles_insert_own" on public.profiles for insert with check (auth.uid() = id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email,'@',1)))
  on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Updated_at trigger helper
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

-- Conversations
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'New Conversation',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.conversations enable row level security;
create policy "conv_own_all" on public.conversations for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index conversations_user_idx on public.conversations(user_id, updated_at desc);
create trigger conv_updated before update on public.conversations
  for each row execute function public.set_updated_at();

-- Messages
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user','assistant','system','tool')),
  content text not null,
  parts jsonb,
  agent text,
  tokens_in integer,
  tokens_out integer,
  created_at timestamptz not null default now()
);
alter table public.messages enable row level security;
create policy "msg_own_all" on public.messages for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index messages_conv_idx on public.messages(conversation_id, created_at);

-- Uploaded documents
create table public.uploaded_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  filename text not null,
  mime_type text,
  size_bytes integer,
  status text not null default 'pending' check (status in ('pending','processing','ready','failed')),
  error text,
  created_at timestamptz not null default now()
);
alter table public.uploaded_documents enable row level security;
create policy "docs_own_all" on public.uploaded_documents for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Document chunks (RAG)
create table public.document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.uploaded_documents(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  chunk_index integer not null,
  content text not null,
  embedding vector(1536),
  created_at timestamptz not null default now()
);
alter table public.document_chunks enable row level security;
create policy "chunks_own_all" on public.document_chunks for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index doc_chunks_doc_idx on public.document_chunks(document_id, chunk_index);
create index doc_chunks_embedding_idx on public.document_chunks
  using hnsw (embedding vector_cosine_ops);

-- Semantic memory (long-term)
create table public.semantic_memory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  content text not null,
  embedding vector(1536),
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.semantic_memory enable row level security;
create policy "mem_own_all" on public.semantic_memory for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index mem_embedding_idx on public.semantic_memory
  using hnsw (embedding vector_cosine_ops);

-- Agent runs
create table public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete cascade,
  message_id uuid references public.messages(id) on delete cascade,
  agent text not null,
  status text not null default 'running' check (status in ('running','completed','failed')),
  input jsonb,
  output jsonb,
  error text,
  latency_ms integer,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);
alter table public.agent_runs enable row level security;
create policy "runs_own_all" on public.agent_runs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index runs_user_idx on public.agent_runs(user_id, started_at desc);

-- Token usage
create table public.token_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  model text not null,
  tokens_in integer not null default 0,
  tokens_out integer not null default 0,
  created_at timestamptz not null default now()
);
alter table public.token_usage enable row level security;
create policy "tokens_own_select" on public.token_usage for select using (auth.uid() = user_id);
create index tokens_user_idx on public.token_usage(user_id, created_at desc);

-- User settings
create table public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  default_model text not null default 'google/gemini-3-flash-preview',
  theme text not null default 'dark',
  updated_at timestamptz not null default now()
);
alter table public.user_settings enable row level security;
create policy "settings_own_all" on public.user_settings for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Match function for semantic memory + chunks
create or replace function public.match_chunks(
  query_embedding vector(1536),
  match_count int default 5,
  p_user_id uuid default null
)
returns table (id uuid, document_id uuid, content text, similarity float)
language sql stable security definer set search_path = public as $$
  select c.id, c.document_id, c.content, 1 - (c.embedding <=> query_embedding) as similarity
  from public.document_chunks c
  where (p_user_id is null or c.user_id = p_user_id)
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

create or replace function public.match_memory(
  query_embedding vector(1536),
  match_count int default 5,
  p_user_id uuid default null
)
returns table (id uuid, content text, metadata jsonb, similarity float)
language sql stable security definer set search_path = public as $$
  select m.id, m.content, m.metadata, 1 - (m.embedding <=> query_embedding) as similarity
  from public.semantic_memory m
  where (p_user_id is null or m.user_id = p_user_id)
  order by m.embedding <=> query_embedding
  limit match_count;
$$;
