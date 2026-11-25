-- Usie: Supabase schema (idempotent; safe to run more than once)
-- Paste into Supabase Dashboard > SQL Editor > Run.
-- Model: each partner has a Supabase Auth account. Partner 1 calls create_couple(role),
-- gets an invite code, partner 2 calls join_couple(code). Max 2 members per couple.
-- Every row carries couple_id; Row Level Security only lets the two members see it.

create extension if not exists pgcrypto;

-- ---------- tables ----------
create table if not exists public.couples (
  id uuid primary key default gen_random_uuid(),
  invite_code text not null unique,
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  wyr_index int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.couple_members (
  user_id uuid primary key references auth.users(id) on delete cascade,  -- one couple per user
  couple_id uuid not null references public.couples(id) on delete cascade,
  role text not null check (role in ('her','him')),
  joined_at timestamptz not null default now(),
  unique (couple_id, role)                                               -- so max 2 members
);
create index if not exists couple_members_couple_idx on public.couple_members(couple_id);

create table if not exists public.profiles (
  couple_id uuid not null references public.couples(id) on delete cascade,
  role text not null check (role in ('her','him')),
  user_id uuid default auth.uid() references auth.users(id) on delete set null,
  name text, nick text, bday date, lang text, noticed text, food text,
  photo_path text,
  answers jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (couple_id, role)
);

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  author uuid not null default auth.uid() references auth.users(id) on delete cascade,
  by_role text not null check (by_role in ('her','him')),
  kind text not null default 'post' check (kind in ('post','cap')),
  caption text, photo_path text, prompt text, cap_her text, cap_him text,
  edited boolean not null default false,
  edited_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists posts_couple_idx on public.posts(couple_id, created_at desc);

create table if not exists public.reactions (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  couple_id uuid not null references public.couples(id) on delete cascade,
  role text not null check (role in ('her','him')),
  sticker text not null check (sticker in ('heart','spark','lol','hot','kiss')),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id, sticker)
);
create index if not exists reactions_couple_idx on public.reactions(couple_id);

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  author uuid not null default auth.uid() references auth.users(id) on delete cascade,
  from_role text not null check (from_role in ('her','him')),
  open_when text not null, body text not null,
  opened_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notes_couple_idx on public.notes(couple_id);

create table if not exists public.wyr_answers (
  couple_id uuid not null references public.couples(id) on delete cascade,
  question int not null,
  role text not null check (role in ('her','him')),
  choice int not null check (choice in (0,1)),
  updated_at timestamptz not null default now(),
  primary key (couple_id, question, role)
);

create table if not exists public.checkins (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  author uuid not null default auth.uid() references auth.users(id) on delete cascade,
  role text not null check (role in ('her','him')),
  loved int check (loved between 1 and 10),
  quality int check (quality between 1 and 10),
  liked text, more text,
  created_at timestamptz not null default now()
);
create index if not exists checkins_couple_idx on public.checkins(couple_id);

create table if not exists public.gratitude (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  author uuid not null default auth.uid() references auth.users(id) on delete cascade,
  text text not null,
  created_at timestamptz not null default now()
);
create index if not exists gratitude_couple_idx on public.gratitude(couple_id);

create table if not exists public.bucket_items (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  author uuid not null default auth.uid() references auth.users(id) on delete cascade,
  text text not null,
  done boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists bucket_couple_idx on public.bucket_items(couple_id);

-- ---------- helper functions ----------
create or replace function public.is_member(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.couple_members m where m.couple_id = cid and m.user_id = auth.uid());
$$;

create or replace function public.my_role(cid uuid)
returns text language sql stable security definer set search_path = public as $$
  select m.role from public.couple_members m where m.couple_id = cid and m.user_id = auth.uid();
$$;

-- Partner 1: create a couple, returns the couple row (with invite_code)
create or replace function public.create_couple(p_role text)
returns public.couples language plpgsql security definer set search_path = public as $$
declare c public.couples; code text; tries int := 0;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if p_role not in ('her','him') then raise exception 'Role must be her or him'; end if;
  if exists (select 1 from couple_members where user_id = auth.uid()) then
    raise exception 'You are already in a couple';
  end if;
  loop
    code := upper(substr(translate(replace(gen_random_uuid()::text, '-', ''), '01', ''), 1, 6));
    exit when length(code) = 6 and not exists (select 1 from couples where invite_code = code);
    tries := tries + 1; if tries > 20 then raise exception 'Could not make a code, try again'; end if;
  end loop;
  insert into couples (invite_code, created_by) values (code, auth.uid()) returning * into c;
  insert into couple_members (user_id, couple_id, role) values (auth.uid(), c.id, p_role);
  return c;
end $$;

-- Partner 2: join with the invite code; takes whichever role is free
create or replace function public.join_couple(p_code text)
returns public.couples language plpgsql security definer set search_path = public as $$
declare c public.couples; taken text; n int;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if exists (select 1 from couple_members where user_id = auth.uid()) then
    raise exception 'You are already in a couple';
  end if;
  select * into c from couples where invite_code = upper(trim(p_code)) for update;
  if not found then raise exception 'That code does not exist'; end if;
  select count(*), min(role) into n, taken from couple_members where couple_id = c.id;
  if n >= 2 then raise exception 'This couple is already complete. No third wheels!'; end if;
  insert into couple_members (user_id, couple_id, role)
    values (auth.uid(), c.id, case when taken = 'her' then 'him' else 'her' end);
  return c;
end $$;

-- Leave (deletes the couple when the last member leaves)
create or replace function public.leave_couple()
returns void language plpgsql security definer set search_path = public as $$
declare cid uuid;
begin
  delete from couple_members where user_id = auth.uid() returning couple_id into cid;
  if cid is not null and not exists (select 1 from couple_members where couple_id = cid) then
    delete from couples where id = cid;
  end if;
end $$;

revoke all on function public.create_couple(text), public.join_couple(text), public.leave_couple(),
  public.is_member(uuid), public.my_role(uuid) from public, anon;
grant execute on function public.create_couple(text), public.join_couple(text), public.leave_couple(),
  public.is_member(uuid), public.my_role(uuid) to authenticated;

-- ---------- privileges ----------
revoke all on public.couples, public.couple_members, public.profiles, public.posts, public.reactions,
  public.notes, public.wyr_answers, public.checkins, public.gratitude, public.bucket_items from anon;
grant select, update on public.couples to authenticated;
grant select on public.couple_members to authenticated;
grant select, insert, update, delete on public.profiles, public.posts, public.reactions, public.notes,
  public.wyr_answers, public.checkins, public.gratitude, public.bucket_items to authenticated;

-- ---------- row level security ----------
alter table public.couples        enable row level security;
alter table public.couple_members enable row level security;
alter table public.profiles       enable row level security;
alter table public.posts          enable row level security;
alter table public.reactions      enable row level security;
alter table public.notes          enable row level security;
alter table public.wyr_answers    enable row level security;
alter table public.checkins       enable row level security;
alter table public.gratitude      enable row level security;
alter table public.bucket_items   enable row level security;

drop policy if exists couples_select on public.couples;
create policy couples_select on public.couples for select to authenticated using (public.is_member(id));
drop policy if exists couples_update on public.couples;
create policy couples_update on public.couples for update to authenticated using (public.is_member(id)) with check (public.is_member(id));

drop policy if exists members_select on public.couple_members;
create policy members_select on public.couple_members for select to authenticated using (public.is_member(couple_id));

-- generic "only the two of us" policy for the content tables
do $$
declare t text;
begin
  foreach t in array array['profiles','posts','reactions','notes','wyr_answers','checkins','gratitude','bucket_items'] loop
    execute format('drop policy if exists %I on public.%I', t || '_couple_all', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.is_member(couple_id)) with check (public.is_member(couple_id))', t || '_couple_all', t);
  end loop;
end $$;

-- reactions: you can only add/remove your own sticker
drop policy if exists reactions_own_insert on public.reactions;
create policy reactions_own_insert on public.reactions as restrictive for insert to authenticated with check (user_id = auth.uid());
drop policy if exists reactions_own_delete on public.reactions;
create policy reactions_own_delete on public.reactions as restrictive for delete to authenticated using (user_id = auth.uid());

-- keep the author column honest on inserts
do $$
declare t text;
begin
  foreach t in array array['posts','notes','checkins','gratitude','bucket_items'] loop
    execute format('drop policy if exists %I on public.%I', t || '_author_insert', t);
    execute format('create policy %I on public.%I as restrictive for insert to authenticated with check (author = auth.uid())', t || '_author_insert', t);
  end loop;
end $$;

-- ---------- storage: private photo bucket ----------
-- object path convention: <couple_id>/<random>.jpg
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('usie-photos', 'usie-photos', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.is_member_path(obj_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.couple_members m
                 where m.user_id = auth.uid() and m.couple_id::text = split_part(obj_name, '/', 1));
$$;
revoke all on function public.is_member_path(text) from public, anon;
grant execute on function public.is_member_path(text) to authenticated;

drop policy if exists usie_photos_select on storage.objects;
create policy usie_photos_select on storage.objects for select to authenticated
  using (bucket_id = 'usie-photos' and public.is_member_path(name));
drop policy if exists usie_photos_insert on storage.objects;
create policy usie_photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'usie-photos' and public.is_member_path(name));
drop policy if exists usie_photos_update on storage.objects;
create policy usie_photos_update on storage.objects for update to authenticated
  using (bucket_id = 'usie-photos' and public.is_member_path(name));
drop policy if exists usie_photos_delete on storage.objects;
create policy usie_photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'usie-photos' and public.is_member_path(name));

-- ---------- realtime ----------
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['posts','reactions','notes','profiles','wyr_answers','checkins','gratitude','bucket_items'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;

-- tell PostgREST to pick up the new tables right away
notify pgrst, 'reload schema';
