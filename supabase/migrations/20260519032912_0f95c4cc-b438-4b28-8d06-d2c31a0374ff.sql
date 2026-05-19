
-- Pin search_path on updated_at helper
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end;
$$;

-- Switch match functions to SECURITY INVOKER so RLS applies per caller
create or replace function public.match_chunks(
  query_embedding vector(1536),
  match_count int default 5,
  p_user_id uuid default null
)
returns table (id uuid, document_id uuid, content text, similarity float)
language sql stable security invoker set search_path = public as $$
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
language sql stable security invoker set search_path = public as $$
  select m.id, m.content, m.metadata, 1 - (m.embedding <=> query_embedding) as similarity
  from public.semantic_memory m
  where (p_user_id is null or m.user_id = p_user_id)
  order by m.embedding <=> query_embedding
  limit match_count;
$$;

-- Restrict handle_new_user execution to postgres only (it's only called from trigger)
revoke execute on function public.handle_new_user() from public, anon, authenticated;
