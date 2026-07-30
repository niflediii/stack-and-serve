create table if not exists public.host_queues (
  id uuid primary key,
  owner_id uuid not null references auth.users (id) on delete cascade,
  club_name text not null default '',
  event_date date not null default current_date,
  queue_status text not null default 'draft' check (queue_status in ('draft', 'running', 'paused', 'stopped', 'completed')),
  visibility text not null default 'public' check (visibility in ('public', 'private')),
  payload jsonb not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists host_queues_owner_id_idx on public.host_queues (owner_id);
create index if not exists host_queues_visibility_idx on public.host_queues (visibility);
create index if not exists host_queues_event_date_idx on public.host_queues (event_date desc);

alter table public.host_queues enable row level security;

create or replace function public.set_host_queues_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists host_queues_set_updated_at on public.host_queues;

create trigger host_queues_set_updated_at
before update on public.host_queues
for each row
execute function public.set_host_queues_updated_at();

drop policy if exists "host_queues_select_visible" on public.host_queues;
drop policy if exists "host_queues_insert_owner" on public.host_queues;
drop policy if exists "host_queues_update_owner" on public.host_queues;
drop policy if exists "host_queues_delete_owner" on public.host_queues;

create policy "host_queues_select_visible"
on public.host_queues
for select
to authenticated
using (
  visibility = 'public'
  or owner_id = auth.uid()
);

create policy "host_queues_insert_owner"
on public.host_queues
for insert
to authenticated
with check (owner_id = auth.uid());

create policy "host_queues_update_owner"
on public.host_queues
for update
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

create policy "host_queues_delete_owner"
on public.host_queues
for delete
to authenticated
using (owner_id = auth.uid());
