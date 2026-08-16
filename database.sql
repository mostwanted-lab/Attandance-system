-- Attendance Management System
-- Run this in a fresh Supabase project's SQL Editor.
-- Admin users themselves are created in Supabase Authentication; see README.md.

create extension if not exists pgcrypto;

create table if not exists public.admin_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.students (
  student_id text primary key,
  name text not null check (length(trim(name)) > 0),
  password_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint student_id_format check (student_id ~ '^STU[0-9]{3,}$')
);

create table if not exists public.attendance (
  id bigint generated always as identity primary key,
  student_id text not null references public.students(student_id) on delete cascade,
  date date not null,
  status text not null check (status in ('Present','Absent')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(student_id,date)
);

create index if not exists attendance_date_idx on public.attendance(date);
create index if not exists attendance_student_date_idx on public.attendance(student_id,date);

create or replace function public.set_updated_at()
returns trigger language plpgsql security invoker as $$
begin new.updated_at=now(); return new; end; $$;

drop trigger if exists students_updated_at on public.students;
create trigger students_updated_at before update on public.students
for each row execute function public.set_updated_at();

drop trigger if exists attendance_updated_at on public.attendance;
create trigger attendance_updated_at before update on public.attendance
for each row execute function public.set_updated_at();

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public, auth
as $$ select exists(select 1 from public.admin_profiles where id=auth.uid()); $$;

create or replace function public.student_login_and_mark_present(p_student_id text, p_password text)
returns table(success boolean, student_name text, message text)
language plpgsql security definer set search_path = public, extensions
as $$
declare s public.students%rowtype; today date := (now() at time zone 'Asia/Kathmandu')::date;
begin
  select * into s from public.students where student_id=upper(trim(p_student_id));
  if not found or not crypt(p_password,s.password_hash)=s.password_hash then
    return query select false, null::text, 'Invalid Student ID or password.';
    return;
  end if;
  insert into public.attendance(student_id,date,status)
  values(s.student_id,today,'Present')
  on conflict(student_id,date) do update set status='Present',updated_at=now();
  return query select true,s.name,'Attendance recorded successfully.';
end; $$;

create or replace function public.admin_create_student(p_student_id text,p_name text,p_password text)
returns void language plpgsql security definer set search_path = public, extensions
as $$
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;
  if p_password is null or length(p_password)<1 then raise exception 'Password is required'; end if;
  insert into public.students(student_id,name,password_hash)
  values(upper(trim(p_student_id)),trim(p_name),crypt(p_password,gen_salt('bf')));
  -- Ensure today's record exists as Absent. The student becomes Present on login.
  insert into public.attendance(student_id,date,status)
  values(upper(trim(p_student_id)),(now() at time zone 'Asia/Kathmandu')::date,'Absent')
  on conflict do nothing;
end; $$;

create or replace function public.admin_update_student(p_student_id text,p_name text,p_password text default null)
returns void language plpgsql security definer set search_path = public, extensions
as $$
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;
  if p_password is null or length(p_password)=0 then
    update public.students set name=trim(p_name) where student_id=p_student_id;
  else
    update public.students set name=trim(p_name),password_hash=crypt(p_password,gen_salt('bf')) where student_id=p_student_id;
  end if;
  if not found then raise exception 'Student not found'; end if;
end; $$;

create or replace function public.admin_delete_student(p_student_id text)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;
  delete from public.students where student_id=p_student_id;
  if not found then raise exception 'Student not found'; end if;
end; $$;


create or replace function public.admin_get_attendance(p_date date)
returns table(student_id text, name text, date date, status text)
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;
  insert into public.attendance(student_id,date,status)
  select s.student_id,p_date,'Absent'
  from public.students s
  on conflict(student_id,date) do nothing;

  return query
  select a.student_id,s.name,a.date,a.status
  from public.attendance a
  join public.students s on s.student_id=a.student_id
  where a.date=p_date
  order by a.student_id asc;
end; $$;

create or replace function public.finalize_attendance(p_date date)
returns integer language plpgsql security definer set search_path = public
as $$
declare affected integer;
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;
  insert into public.attendance(student_id,date,status)
  select student_id,p_date,'Absent' from public.students
  on conflict(student_id,date) do nothing;
  get diagnostics affected = row_count;
  return affected;
end; $$;

alter table public.admin_profiles enable row level security;
alter table public.students enable row level security;
alter table public.attendance enable row level security;

drop policy if exists "Admins can read admin profiles" on public.admin_profiles;
create policy "Admins can read admin profiles" on public.admin_profiles
for select to authenticated using (id=auth.uid());

drop policy if exists "Admins can read students" on public.students;
create policy "Admins can read students" on public.students
for select to authenticated using (public.is_admin());

drop policy if exists "Admins can read attendance" on public.attendance;
create policy "Admins can read attendance" on public.attendance
for select to authenticated using (public.is_admin());

revoke all on public.students from anon, authenticated;
revoke all on public.attendance from anon, authenticated;
revoke all on public.admin_profiles from anon, authenticated;
grant select on public.admin_profiles to authenticated;
grant select on public.students to authenticated;
grant select on public.attendance to authenticated;

revoke all on function public.student_login_and_mark_present(text,text) from public;
grant execute on function public.student_login_and_mark_present(text,text) to anon, authenticated;
revoke all on function public.admin_create_student(text,text,text) from public;
grant execute on function public.admin_create_student(text,text,text) to authenticated;
revoke all on function public.admin_update_student(text,text,text) from public;
grant execute on function public.admin_update_student(text,text,text) to authenticated;
revoke all on function public.admin_delete_student(text) from public;
grant execute on function public.admin_delete_student(text) to authenticated;
revoke all on function public.admin_get_attendance(date) from public;
grant execute on function public.admin_get_attendance(date) to authenticated;
revoke all on function public.finalize_attendance(date) from public;
grant execute on function public.finalize_attendance(date) to authenticated;

-- Important: after creating an admin Auth user, insert its UUID into admin_profiles:
-- insert into public.admin_profiles(id) values ('AUTH-USER-UUID-HERE');
