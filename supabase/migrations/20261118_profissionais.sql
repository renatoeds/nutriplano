-- Nutri Plano — profissionais (nutricionista / personal) com acesso SÓ DE LEITURA aos alunos vinculados.
-- Apenas acréscimos: nenhuma tabela, política ou função existente é alterada.

-- 1) Cadastro de profissionais (só o administrador cria/edita)
create table if not exists public.professionals (
  email      text primary key references public.allowed_emails(email) on delete cascade on update cascade,
  kind       text not null check (kind in ('nutri','personal')),
  name       text not null check (char_length(name) between 2 and 80),
  code       text not null unique check (code ~ '^[0-9]{4,6}$'),
  active     boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.professionals enable row level security;
revoke all on public.professionals from anon;
create policy "admin gerencia profissionais" on public.professionals
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "profissional vê o próprio cadastro" on public.professionals
  for select to authenticated
  using (email = lower(coalesce((select auth.jwt()->>'email'),'')) and (select public.is_allowed()));

-- 2) Vínculos aluno → profissional (criados só pela função pro_link, com o código)
create table if not exists public.pro_links (
  student_id   uuid not null references auth.users(id) on delete cascade,
  pro_email    text not null references public.professionals(email) on delete cascade on update cascade,
  student_name text not null check (char_length(student_name) between 1 and 80),
  share_photos boolean not null default false,
  created_at   timestamptz not null default now(),
  primary key (student_id, pro_email)
);
alter table public.pro_links enable row level security;
revoke all on public.pro_links from anon, authenticated;
grant select, delete on public.pro_links to authenticated;
grant update (share_photos, student_name) on public.pro_links to authenticated;
create policy "aluno vê os próprios vínculos" on public.pro_links
  for select to authenticated using (student_id = (select auth.uid()) and (select public.is_allowed()));
create policy "aluno ajusta os próprios vínculos" on public.pro_links
  for update to authenticated
  using (student_id = (select auth.uid()) and (select public.is_allowed()))
  with check (student_id = (select auth.uid()));
create policy "aluno cancela o vínculo" on public.pro_links
  for delete to authenticated using (student_id = (select auth.uid()));

-- 3) Funções auxiliares (SECURITY DEFINER com search_path vazio)
create or replace function public.my_email() returns text
language sql stable security definer set search_path = '' as $$
  select lower(coalesce(auth.jwt()->>'email',''));
$$;

-- profissional ativo e liberado que está chamando
create or replace function public.my_pro_kind() returns text
language sql stable security definer set search_path = '' as $$
  select p.kind from public.professionals p
  where p.email = public.my_email() and p.active
    and exists (select 1 from public.allowed_emails a where a.email = p.email);
$$;

-- o profissional que chama pode ver este aluno?
create or replace function public.pro_link_of(p_student uuid) returns public.pro_links
language sql stable security definer set search_path = '' as $$
  select l.* from public.pro_links l
  join public.professionals p on p.email = l.pro_email and p.active
  join auth.users u on u.id = l.student_id
  where l.student_id = p_student and l.pro_email = public.my_email()
    and exists (select 1 from public.allowed_emails a where a.email = p.email)
    and exists (select 1 from public.allowed_emails a where a.email = lower(u.email));
$$;

-- aluno: consulta o nome do profissional pelo código (não expõe e-mail)
create or replace function public.pro_lookup(p_code text)
returns table(name text, kind text)
language sql stable security definer set search_path = '' as $$
  select p.name, p.kind from public.professionals p
  where public.is_allowed() and p.active and p.code = trim(p_code) and p.email <> public.my_email();
$$;

-- aluno: cria/atualiza o vínculo pelo código
create or replace function public.pro_link(p_code text, p_name text, p_photos boolean)
returns table(name text, kind text)
language plpgsql security definer set search_path = '' as $$
declare v public.professionals;
begin
  if not public.is_allowed() or auth.uid() is null then raise exception 'not_allowed'; end if;
  select * into v from public.professionals p where p.active and p.code = trim(p_code);
  if not found then raise exception 'code_not_found'; end if;
  if v.email = public.my_email() then raise exception 'self_link'; end if;
  if char_length(trim(coalesce(p_name,''))) < 1 then raise exception 'name_required'; end if;
  insert into public.pro_links(student_id, pro_email, student_name, share_photos)
  values (auth.uid(), v.email, left(trim(p_name),80), coalesce(p_photos,false))
  on conflict (student_id, pro_email) do update set student_name = excluded.student_name, share_photos = excluded.share_photos;
  return query select v.name, v.kind;
end $$;

-- aluno: meus profissionais
create or replace function public.my_pros()
returns table(pro_email text, name text, kind text, share_photos boolean, student_name text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select l.pro_email, p.name, p.kind, l.share_photos, l.student_name, l.created_at
  from public.pro_links l join public.professionals p on p.email = l.pro_email
  where l.student_id = auth.uid() and public.is_allowed()
  order by l.created_at;
$$;

-- profissional: lista de alunos
create or replace function public.pro_students()
returns table(student_id uuid, student_name text, share_photos boolean, created_at timestamptz, last_day date)
language sql stable security definer set search_path = '' as $$
  select l.student_id, l.student_name, l.share_photos, l.created_at,
         (select max(d.day) from public.days d where d.user_id = l.student_id and d.day <= current_date + 1)
  from public.pro_links l
  join auth.users u on u.id = l.student_id
  where public.my_pro_kind() is not null and l.pro_email = public.my_email()
    and exists (select 1 from public.allowed_emails a where a.email = lower(u.email))
  order by l.student_name;
$$;

-- profissional: dados do aluno, SÓ LEITURA e filtrados pelo tipo de profissional
create or replace function public.pro_student(p_student uuid, p_from date)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare l public.pro_links; k text; pd jsonb; prof jsonb; dys jsonb; f date;
begin
  k := public.my_pro_kind();
  if k is null then raise exception 'not_pro'; end if;
  l := public.pro_link_of(p_student);
  if l.student_id is null then raise exception 'not_linked'; end if;
  f := greatest(coalesce(p_from, current_date - 30), current_date - 400);
  select coalesce(p.data,'{}'::jsonb) into pd from public.profiles p where p.user_id = p_student;
  pd := coalesce(pd,'{}'::jsonb);
  prof := jsonb_strip_nulls(jsonb_build_object(
    'sex',pd->'sex','age',pd->'age','height',pd->'height','weight',pd->'weight','goal',pd->'goal',
    'goalWeight',pd->'goalWeight','activity',pd->'activity','rate',pd->'rate'));
  if k = 'nutri' then
    prof := prof || jsonb_strip_nulls(jsonb_build_object(
      'targets',pd->'targets','checkins',pd->'checkins','lastCheckin',pd->'lastCheckin','cycle',pd->'cycle',
      'addExercise',pd->'addExercise','protPerKg',pd->'protPerKg','fatPerKg',pd->'fatPerKg','tdee',pd->'tdee',
      'waterMl',pd->'waterMl','supps',pd->'supps'));
  end if;
  select coalesce(jsonb_object_agg(d.day::text,
    case when k = 'nutri' then jsonb_strip_nulls(jsonb_build_object(
        'meals',d.data->'meals','water',d.data->'water','weight',d.data->'weight','supps',d.data->'supps',
        'measures',d.data->'measures','train',d.data->'train','incomplete',d.data->'incomplete','wmin',d.data->'wmin',
        'workouts',(select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('type',w->'type','ctype',w->'ctype',
            'min',w->'min','km',w->'km','kcal',w->'kcal','kcalManual',w->'kcalManual'))),'[]'::jsonb)
          from jsonb_array_elements(case when jsonb_typeof(d.data->'workouts')='array' then d.data->'workouts' else '[]'::jsonb end) w),
        'photos',case when l.share_photos then d.data->'photos' end))
    else jsonb_strip_nulls(jsonb_build_object(
        'workouts',d.data->'workouts','wname',d.data->'wname','wmin',d.data->'wmin','weight',d.data->'weight',
        'measures',d.data->'measures','train',d.data->'train',
        'photos',case when l.share_photos then d.data->'photos' end))
    end), '{}'::jsonb)
  into dys from public.days d where d.user_id = p_student and d.day >= f;
  return jsonb_build_object('kind',k,'student_name',l.student_name,'share_photos',l.share_photos,
                            'linked_at',l.created_at,'profile',prof,'days',dys);
end $$;

-- fotos: o profissional só lê as fotos se o aluno autorizou
create or replace function public.pro_can_see_photos(p_folder text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.pro_links l
    join public.professionals p on p.email = l.pro_email and p.active
    join auth.users u on u.id = l.student_id
    where l.student_id::text = p_folder and l.pro_email = public.my_email() and l.share_photos
      and exists (select 1 from public.allowed_emails a where a.email = p.email)
      and exists (select 1 from public.allowed_emails a where a.email = lower(u.email)));
$$;
create policy "fotos: profissional autorizado lê" on storage.objects
  for select to authenticated
  using (bucket_id = 'progress' and public.pro_can_see_photos((storage.foldername(name))[1]));

-- permissões das funções: ninguém sem login; só as que o app chama ficam expostas
revoke execute on function public.my_email(), public.my_pro_kind(), public.pro_link_of(uuid),
  public.pro_lookup(text), public.pro_link(text,text,boolean), public.my_pros(), public.pro_students(),
  public.pro_student(uuid,date), public.pro_can_see_photos(text) from public, anon;
grant execute on function public.pro_lookup(text), public.pro_link(text,text,boolean), public.my_pros(),
  public.pro_students(), public.pro_student(uuid,date), public.pro_can_see_photos(text),
  public.my_email(), public.my_pro_kind(), public.pro_link_of(uuid) to authenticated;
