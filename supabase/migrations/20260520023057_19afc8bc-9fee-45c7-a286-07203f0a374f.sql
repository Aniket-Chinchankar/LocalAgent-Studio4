
-- Private bucket for user document uploads
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

-- Per-user folder RLS on storage.objects (folder name = auth.uid())
create policy "documents_read_own"
on storage.objects for select
to authenticated
using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "documents_insert_own"
on storage.objects for insert
to authenticated
with check (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "documents_delete_own"
on storage.objects for delete
to authenticated
using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);

-- Helper RPC to insert a semantic memory with its embedding atomically
create or replace function public.add_memory(
  p_content text,
  p_embedding vector(1536),
  p_conversation_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.semantic_memory (user_id, conversation_id, content, embedding, metadata)
  values (auth.uid(), p_conversation_id, p_content, p_embedding, coalesce(p_metadata, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end;
$$;

grant execute on function public.add_memory(text, vector(1536), uuid, jsonb) to authenticated;
