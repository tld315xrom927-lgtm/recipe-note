-- =========================================================
-- Recipe Note：Supabase セットアップ用SQL
-- Supabase の「SQL Editor」にこのファイルの内容を全部貼り付けて「Run」を押してください。
-- 何度実行しても大丈夫です（データは消えません）。アプリを更新したときも、もう一度全部貼り付けて実行してください。
--
-- しくみ：
--  ・レシピ／カテゴリ／献立を rn_items テーブルに保存します
--  ・テーブルは直接読み書きできないようにし（RLS有効・ポリシーなし）、
--    アプリは下の3つの関数だけを使います
--  ・関数は「合言葉」を確認してから動くので、公開キーを知っている人でも
--    合言葉がなければデータを見たり変えたりできません
-- =========================================================

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.rn_items (
  kind       text    not null check (kind in ('recipe', 'meta', 'plan')),
  id         text    not null,
  data       jsonb,                         -- 削除済みのときは料理名だけを残す（別端末での復活防止）
  deleted    boolean not null default false,
  updated_at bigint  not null,              -- 端末で変更した時刻（ミリ秒）。新しいほうを採用
  rev        bigserial,                     -- サーバーで変更された順番（差分取得用）
  primary key (kind, id)
);
create index if not exists rn_items_rev_idx on public.rn_items (rev);

create table if not exists public.rn_settings (
  k text primary key,
  v text not null
);

alter table public.rn_items    enable row level security;
alter table public.rn_settings enable row level security;
revoke all on public.rn_items, public.rn_settings from anon, authenticated;

-- 合言葉の確認（内部用）
create or replace function public.rn_check(p_secret text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  h text;
begin
  select v into h from public.rn_settings where k = 'secret';
  if h is null or p_secret is null or h <> extensions.crypt(p_secret, h) then
    raise exception 'invalid secret' using errcode = '28000';
  end if;
end;
$$;

-- 接続：最初の1回は合言葉を登録、2回目以降は合言葉を確認
create or replace function public.rn_setup(p_secret text)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if p_secret is null or length(p_secret) < 8 then
    raise exception 'secret too short' using errcode = '22023';
  end if;
  if not exists (select 1 from public.rn_settings where k = 'secret') then
    insert into public.rn_settings (k, v) values ('secret', extensions.crypt(p_secret, extensions.gen_salt('bf')));
    return 'created';
  end if;
  perform public.rn_check(p_secret);
  return 'ok';
end;
$$;

-- 取得：p_since より後に変更されたものを rev 順に返す
create or replace function public.rn_pull(p_secret text, p_since bigint default 0, p_limit int default 200)
returns table (kind text, id text, data jsonb, deleted boolean, updated_at bigint, rev bigint)
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform public.rn_check(p_secret);
  return query
    select i.kind, i.id, i.data, i.deleted, i.updated_at, i.rev
    from public.rn_items i
    where i.rev > coalesce(p_since, 0)
    order by i.rev
    limit least(greatest(coalesce(p_limit, 200), 1), 500);
end;
$$;

-- 送信：新しいもの（updated_at が大きいもの）だけを反映する
create or replace function public.rn_push(p_secret text, p_items jsonb)
returns int
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  r record;
  n int := 0;
begin
  perform public.rn_check(p_secret);
  for r in
    select * from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb))
      as x(kind text, id text, data jsonb, deleted boolean, updated_at bigint)
  loop
    if r.kind not in ('recipe', 'meta', 'plan') or r.id is null or r.updated_at is null then
      continue;
    end if;
    insert into public.rn_items as t (kind, id, data, deleted, updated_at)
    values (r.kind, r.id, r.data, coalesce(r.deleted, false), r.updated_at)
    on conflict (kind, id) do update
      set data = excluded.data,
          deleted = excluded.deleted,
          updated_at = excluded.updated_at,
          rev = nextval(pg_get_serial_sequence('public.rn_items', 'rev'))
      where t.updated_at < excluded.updated_at;
    if found then n := n + 1; end if;
  end loop;
  return n;
end;
$$;

-- 一覧：すべての項目の「種類・ID・更新時刻・削除済みか」だけを返す（軽い。端末はこれと照らし合わせる）
create or replace function public.rn_manifest(p_secret text)
returns table (kind text, id text, updated_at bigint, deleted boolean)
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform public.rn_check(p_secret);
  return query select i.kind, i.id, i.updated_at, i.deleted from public.rn_items i;
end;
$$;

-- 取得：指定した項目の中身を返す（p_keys は [{"kind":"recipe","id":"..."}, ...]）
create or replace function public.rn_get(p_secret text, p_keys jsonb)
returns table (kind text, id text, data jsonb, deleted boolean, updated_at bigint, rev bigint)
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform public.rn_check(p_secret);
  return query
    select i.kind, i.id, i.data, i.deleted, i.updated_at, i.rev
    from public.rn_items i
    join jsonb_to_recordset(coalesce(p_keys, '[]'::jsonb)) as k(kind text, id text)
      on k.kind = i.kind and k.id = i.id;
end;
$$;

revoke all on function public.rn_check(text) from public, anon, authenticated;
grant execute on function public.rn_manifest(text) to anon, authenticated;
grant execute on function public.rn_get(text, jsonb) to anon, authenticated;
grant execute on function public.rn_setup(text) to anon, authenticated;
grant execute on function public.rn_pull(text, bigint, int) to anon, authenticated;
grant execute on function public.rn_push(text, jsonb) to anon, authenticated;

-- 合言葉を忘れたときは、次の1行を実行してからアプリで新しい合言葉を設定し直してください（データは残ります）
-- delete from public.rn_settings where k = 'secret';
