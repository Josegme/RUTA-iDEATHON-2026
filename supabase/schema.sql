-- RUTA IDEATHON 2026 — esquema de Supabase (ejecutar en el SQL Editor del proyecto)
-- Almacén clave-valor compartido: espejo de localStorage (claves rutaideathon_v3_*).

create table if not exists public.kv (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create or replace function public.kv_touch() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists kv_touch_trg on public.kv;
create trigger kv_touch_trg before insert or update on public.kv
  for each row execute function public.kv_touch();

alter table public.kv enable row level security;

-- La app no usa autenticación de Supabase (los PIN se validan en el cliente):
-- la clave pública (anon) puede leer y escribir, pero solo claves de la app.
drop policy if exists kv_select on public.kv;
drop policy if exists kv_insert on public.kv;
drop policy if exists kv_update on public.kv;
drop policy if exists kv_delete on public.kv;
create policy kv_select on public.kv for select to anon using (true);
create policy kv_insert on public.kv for insert to anon with check (key like 'rutaideathon_v3_%');
create policy kv_update on public.kv for update to anon using (key like 'rutaideathon_v3_%') with check (key like 'rutaideathon_v3_%');
create policy kv_delete on public.kv for delete to anon using (key like 'rutaideathon_v3_%');

-- Realtime (cambios en vivo por WebSocket)
alter table public.kv replica identity full;
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='kv') then
    alter publication supabase_realtime add table public.kv;
  end if;
end $$;

-- Fusión atómica de la lista de solicitudes de validación: por cada solicitud
-- (id) se conserva la versión con mayor contador _n; así un grupo y un mentor
-- que escriben a la vez no se pisan.
create or replace function public.kv_merge_requests(p_key text, p_incoming jsonb)
returns jsonb language plpgsql set search_path = public as $$
declare cur jsonb; merged jsonb;
begin
  if p_key not like 'rutaideathon_v3_%' or jsonb_typeof(p_incoming) <> 'array' then
    raise exception 'invalid arguments';
  end if;
  select value into cur from public.kv where key = p_key for update;
  if cur is null or jsonb_typeof(cur) <> 'array' then cur := '[]'::jsonb; end if;
  with allitems as (
    select e.elem, e.elem->>'id' as id, coalesce((e.elem->>'_n')::int, 0) as n, 1 as src
      from jsonb_array_elements(cur) e(elem)
    union all
    select e.elem, e.elem->>'id', coalesce((e.elem->>'_n')::int, 0), 2
      from jsonb_array_elements(p_incoming) e(elem)
  ), best as (
    select distinct on (id) elem from allitems where id is not null order by id, n desc, src desc
  )
  select coalesce(jsonb_agg(elem order by coalesce((elem->>'createdAt')::bigint, 0), elem->>'id'), '[]'::jsonb)
    into merged from best;
  insert into public.kv(key, value) values (p_key, merged)
    on conflict (key) do update set value = excluded.value;
  return merged;
end $$;

grant execute on function public.kv_merge_requests(text, jsonb) to anon;
