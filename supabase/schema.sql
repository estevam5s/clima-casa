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

-- v6: segurança (lista de IPs e eventos) e potência para estimar consumo
create table if not exists public.seguranca_ips (
  id bigint generated always as identity primary key,
  alvo text not null unique,               -- IP ou faixa CIDR
  tipo text not null check (tipo in ('bloqueado', 'permitido')),
  motivo text not null default '',
  automatico boolean not null default false,
  ocorrencias integer not null default 1,
  expira_em bigint,                        -- null = permanente
  criado_em bigint not null
);
create table if not exists public.seguranca_eventos (
  id bigint generated always as identity primary key,
  quando bigint not null,
  ip text not null,
  tipo text not null,                      -- login_falhou, login_ok, auth_negado, scanner, bloqueado, rate_limit, ip_bloqueado_auto…
  rota text not null default '',
  detalhe text not null default '',
  pais text not null default '',
  agente text not null default ''
);
create index if not exists ix_seg_eventos_ip_quando on public.seguranca_eventos (ip, quando desc);
create index if not exists ix_seg_eventos_quando on public.seguranca_eventos (quando desc);
alter table public.seguranca_ips enable row level security;
alter table public.seguranca_eventos enable row level security;
alter table public.aparelhos add column if not exists potencia_w integer not null default 1000;

-- ---------- notificações persistentes (central de notificações) ----------
create table if not exists public.notificacoes (
  id bigint generated always as identity primary key,
  chave text not null unique,             -- identifica a condição (ex.: hub-<id>, falha-<aparelho>-<dia>, ip-<ip>)
  tipo text not null,                     -- alerta, falha, transmissor, agente, alexa, configuracao, seguranca, sistema
  gravidade text not null default 'baixa',-- alta, media, baixa
  titulo text not null,
  detalhe text not null default '',
  link text not null default '',
  acao jsonb,                             -- botão de ação: {"rotulo": "...", "tipo": "resolver_alerta|desbloquear_ip|reparar_hub|link", ...}
  criado_em bigint not null,
  atualizado_em bigint not null,
  ocorrencias integer not null default 1,
  lida boolean not null default false,
  arquivada boolean not null default false,
  resolvida boolean not null default false
);
create index if not exists ix_notificacoes_ativas on public.notificacoes (arquivada, atualizado_em desc);
alter table public.notificacoes enable row level security;

-- ---------- geolocalização dos eventos de segurança (cabeçalhos da borda da Vercel) ----------
alter table public.seguranca_eventos add column if not exists cidade text not null default '';
alter table public.seguranca_eventos add column if not exists regiao text not null default '';
alter table public.seguranca_eventos add column if not exists lat double precision;
alter table public.seguranca_eventos add column if not exists lon double precision;
create index if not exists ix_seg_eventos_tipo_quando on public.seguranca_eventos (tipo, quando desc);
drop policy if exists admin_le on public.notificacoes;
create policy admin_le on public.notificacoes for select to authenticated using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- ---------- mensagens enviadas pelo site institucional (contato e novidades) ----------
create table if not exists public.site_mensagens (
  id bigint generated always as identity primary key,
  quando bigint not null,
  tipo text not null,                 -- contato | novidades
  nome text not null default '',
  email text not null,
  assunto text not null default '',
  mensagem text not null default '',
  ip text not null default '',
  lida boolean not null default false
);
create index if not exists ix_site_mensagens_quando on public.site_mensagens (quando desc);
alter table public.site_mensagens enable row level security;
drop policy if exists admin_le on public.site_mensagens;
create policy admin_le on public.site_mensagens for select to authenticated using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
alter table public.site_mensagens add column if not exists arquivada boolean not null default false;
alter table public.site_mensagens add column if not exists respondida boolean not null default false;
alter table public.site_mensagens add column if not exists notas text not null default '';
alter table public.site_mensagens add column if not exists pais text not null default '';
alter table public.site_mensagens add column if not exists cidade text not null default '';

-- ---------- usuários, papéis e permissões ----------
create table if not exists public.usuarios (
  id uuid primary key,                         -- mesmo id do Supabase Auth
  email text not null,
  nome text not null default '',
  cargo text not null default '',
  papel text not null default 'operador',      -- dono, admin, subadmin, operador, visualizador, personalizado
  permissoes jsonb not null default '[]',      -- lista de chaves (acesso.PERMISSOES)
  projetos jsonb not null default '"*"',       -- "*" = todos, ou lista de ids de projeto
  ativo boolean not null default true,
  exige_troca_senha boolean not null default false,
  criado_em bigint not null,
  criado_por uuid,
  ultimo_acesso bigint
);
alter table public.usuarios enable row level security;
drop policy if exists admin_le on public.usuarios;
create policy admin_le on public.usuarios for select to authenticated using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- ---------- chaves de acesso (passkeys: Face ID, digital, Windows Hello) ----------
create table if not exists public.passkeys (
  id bigint generated always as identity primary key,
  usuario_id uuid not null references public.usuarios(id) on delete cascade,
  credencial_id text not null unique,          -- base64url
  chave_publica text not null,                 -- base64url (COSE)
  contador bigint not null default 0,
  transportes jsonb not null default '[]',
  nome text not null default '',
  aaguid text not null default '',
  criado_em bigint not null,
  ultimo_uso bigint
);
create index if not exists ix_passkeys_usuario on public.passkeys (usuario_id);
alter table public.passkeys enable row level security;

create table if not exists public.webauthn_desafios (
  id text primary key,
  usuario_id uuid,
  tipo text not null,                          -- registro | login
  desafio text not null,                       -- base64url
  expira_em bigint not null
);
alter table public.webauthn_desafios enable row level security;

-- sessões abertas com passkey (valem como segundo fator)
create table if not exists public.sessoes_fortes (
  session_id text primary key,
  usuario_id uuid not null,
  criado_em bigint not null,
  expira_em bigint not null
);
alter table public.sessoes_fortes enable row level security;
alter table public.usuarios add column if not exists telefone text not null default '';
alter table public.usuarios add column if not exists bio text not null default '';
alter table public.usuarios add column if not exists avatar text not null default '';

-- Nome reverso (PTR) dos IPs vistos na tela Segurança: diz se o IP é servidor na nuvem (AWS, Google…) ou varredor.
create table if not exists seguranca_ip_info (
  ip text primary key,
  ptr text not null default '',
  provedor text not null default '',
  consultado_em bigint not null
);
alter table seguranca_ip_info enable row level security;
drop policy if exists admin_le on seguranca_ip_info;
create policy admin_le on seguranca_ip_info for select using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- 401 sem token nas rotas que o navegador chama ao abrir o sistema era contado como ataque: é só visita sem login.
update seguranca_eventos set tipo = 'sem_login', detalhe = 'abriu o sistema sem estar logado'
 where tipo = 'auth_negado' and detalhe = '401' and rota in ('/api/sessao', '/api/notificacoes', '/api/marca', '/api/supabase-config');

-- Caixa de mensagens do site em formato de conversa (uma por e-mail): estado da conversa e respostas/notas do admin
create table if not exists public.site_conversas (
  email text primary key,
  fixada boolean not null default false,
  favorita boolean not null default false,
  arquivada boolean not null default false,
  silenciada boolean not null default false,
  etiquetas jsonb not null default '[]',
  atualizado_em bigint not null default 0
);
alter table public.site_conversas enable row level security;
drop policy if exists admin_le on public.site_conversas;
create policy admin_le on public.site_conversas for select to authenticated using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
create table if not exists public.site_respostas (
  id bigint generated always as identity primary key,
  email text not null,
  quando bigint not null,
  autor_id uuid,
  autor_nome text not null default '',
  texto text not null,
  tipo text not null default 'resposta'      -- resposta (enviada pelo e-mail do admin) | nota (interna)
);
create index if not exists ix_site_respostas_email on public.site_respostas (email, quando);
alter table public.site_respostas enable row level security;
drop policy if exists admin_le on public.site_respostas;
create policy admin_le on public.site_respostas for select to authenticated using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
