-- Clima Casa: esquema no Supabase (datas em epoch segundos, booleanos como 0/1 para compatibilidade com o backend)
create table if not exists public.config (
  chave text primary key,
  valor text not null
);
create table if not exists public.hubs (
  id text primary key,
  nome text not null,
  ip text,
  local_key text,
  versao text not null default '3.5',
  control_type integer,
  funcoes_nuvem text,
  online integer not null default 0,
  visto_em bigint,
  criado_em bigint not null
);
create table if not exists public.aparelhos (
  id bigint generated always as identity primary key,
  nome text not null,
  comodo text not null default '',
  marca text not null default '',
  hub_id text references public.hubs(id) on delete set null,
  temp_min integer not null default 16,
  temp_max integer not null default 30,
  modos text not null default 'frio,quente,ventilar,seco,auto',
  ligado integer not null default 0,
  modo text not null default 'frio',
  temperatura integer not null default 23,
  ventilador text not null default 'auto',
  alexa integer not null default 1,
  ligado_desde bigint,
  atualizado_em bigint,
  criado_em bigint not null
);
create table if not exists public.codigos (
  id bigint generated always as identity primary key,
  aparelho_id bigint not null references public.aparelhos(id) on delete cascade,
  chave text not null,
  rotulo text not null default '',
  codigo text not null,
  criado_em bigint not null,
  unique (aparelho_id, chave)
);
create table if not exists public.agendamentos (
  id bigint generated always as identity primary key,
  aparelho_id bigint not null references public.aparelhos(id) on delete cascade,
  nome text not null,
  dias text not null,
  hora text not null,
  acao text not null,
  ativo integer not null default 1,
  ultima_exec text,
  criado_em bigint not null
);
create table if not exists public.atividade (
  id bigint generated always as identity primary key,
  quando bigint not null,
  aparelho_id bigint,
  origem text not null,
  acao text not null,
  ok integer not null,
  detalhe text not null default ''
);
create index if not exists ix_atividade_quando on public.atividade (quando desc);
create index if not exists ix_atividade_aparelho on public.atividade (aparelho_id, id desc);
create table if not exists public.oauth_codigos (
  codigo text primary key,
  redirect_uri text not null,
  expira bigint not null
);
create table if not exists public.oauth_tokens (
  hash text primary key,
  tipo text not null,
  expira bigint not null,
  criado_em bigint not null
);
-- preenchidas pelas cron jobs
create table if not exists public.metricas_diarias (
  dia date primary key,
  comandos integer not null default 0,
  falhas integer not null default 0,
  pela_alexa integer not null default 0,
  pela_agenda integer not null default 0,
  pelo_painel integer not null default 0,
  aparelhos_ligados integer not null default 0,
  calculado_em timestamptz not null default now()
);
create table if not exists public.backups (
  id bigint generated always as identity primary key,
  criado_em timestamptz not null default now(),
  dados jsonb not null
);
create table if not exists public.alertas (
  id bigint generated always as identity primary key,
  criado_em timestamptz not null default now(),
  tipo text not null,
  aparelho_id bigint references public.aparelhos(id) on delete cascade,
  mensagem text not null,
  resolvido boolean not null default false
);
create unique index if not exists ux_alerta_aberto on public.alertas (tipo, aparelho_id) where not resolvido;
create table if not exists public.saude_sistema (
  id bigint generated always as identity primary key,
  medido_em timestamptz not null default now(),
  tamanho_banco_mb numeric not null,
  linhas_atividade bigint not null,
  transmissores_online integer not null,
  aparelhos integer not null
);

-- RLS: tudo fechado para anon; o administrador (app_metadata.role = 'admin') pode ler.
-- O backend usa a conexão Postgres (dono das tabelas) e não passa pelo RLS.
do $$
declare t text;
begin
  foreach t in array array['config','hubs','aparelhos','codigos','agendamentos','atividade','oauth_codigos',
                           'oauth_tokens','metricas_diarias','backups','alertas','saude_sistema'] loop
    execute format('alter table public.%I enable row level security', t);
    if t not in ('config','oauth_codigos','oauth_tokens','hubs') then
      execute format('drop policy if exists admin_le on public.%I', t);
      execute format($p$create policy admin_le on public.%I for select to authenticated
                     using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')$p$, t);
    end if;
  end loop;
end $$;

-- Fila de comandos: a Vercel grava, o agente no Mac (rede local) executa
create table if not exists public.fila_comandos (
  id bigint generated always as identity primary key,
  tipo text not null check (tipo in ('enviar', 'aprender', 'descobrir')),
  hub_id text,
  dados jsonb not null default '{}',
  estado text not null default 'pendente' check (estado in ('pendente', 'executando', 'ok', 'erro')),
  resultado jsonb,
  erro text,
  criado_em bigint not null,
  inicio_em bigint,
  fim_em bigint
);
create index if not exists ix_fila_pendente on public.fila_comandos (id) where estado = 'pendente';
alter table public.fila_comandos enable row level security;

-- v3: vários projetos (locais), cenas e Sinric Pro
create table if not exists public.projetos (
  id bigint generated always as identity primary key,
  nome text not null,
  descricao text not null default '',
  endereco text not null default '',
  cor text not null default '#0f766a',
  criado_em bigint not null
);
alter table public.hubs add column if not exists projeto_id bigint references public.projetos(id) on delete set null;
alter table public.aparelhos add column if not exists projeto_id bigint references public.projetos(id) on delete set null;
alter table public.aparelhos add column if not exists sinric_device_id text unique;
create table if not exists public.cenas (
  id bigint generated always as identity primary key,
  projeto_id bigint references public.projetos(id) on delete cascade,
  nome text not null,
  icone text not null default 'sparkles',
  acoes jsonb not null default '[]',
  executada_em bigint,
  criado_em bigint not null
);
alter table public.projetos enable row level security;
alter table public.cenas enable row level security;
drop policy if exists admin_le on public.projetos;
create policy admin_le on public.projetos for select to authenticated using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
drop policy if exists admin_le on public.cenas;
create policy admin_le on public.cenas for select to authenticated using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
-- projeto padrão para o que já existe
insert into public.projetos (nome, descricao, criado_em)
  select 'Minha casa', 'Projeto principal', extract(epoch from now())::bigint
  where not exists (select 1 from public.projetos);
update public.hubs set projeto_id = (select min(id) from public.projetos) where projeto_id is null;
update public.aparelhos set projeto_id = (select min(id) from public.projetos) where projeto_id is null;

-- v4: automações (gatilho → condições → ações) e temporizadores
create table if not exists public.automacoes (
  id bigint generated always as identity primary key,
  nome text not null,
  ativo integer not null default 1,
  gatilho jsonb not null,
  condicoes jsonb not null default '{}',
  acoes jsonb not null default '[]',
  disparos integer not null default 0,
  ultimo_disparo bigint,
  criado_em bigint not null
);
create table if not exists public.temporizadores (
  id bigint generated always as identity primary key,
  aparelho_id bigint not null references public.aparelhos(id) on delete cascade,
  acao jsonb not null,
  executar_em bigint not null,
  origem text not null default 'painel',
  criado_em bigint not null
);
create index if not exists ix_temporizadores_quando on public.temporizadores (executar_em);
alter table public.automacoes enable row level security;
alter table public.temporizadores enable row level security;
drop policy if exists admin_le on public.automacoes;
create policy admin_le on public.automacoes for select to authenticated using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
drop policy if exists admin_le on public.temporizadores;
create policy admin_le on public.temporizadores for select to authenticated using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- v5: reconfiguração automática dos transmissores (mudança de rede / novo pareamento)
alter table public.hubs add column if not exists problema text;
alter table public.hubs add column if not exists reparado_em bigint;
alter table public.fila_comandos drop constraint if exists fila_comandos_tipo_check;
alter table public.fila_comandos add constraint fila_comandos_tipo_check check (tipo in ('enviar','aprender','descobrir','evento','reparar'));
