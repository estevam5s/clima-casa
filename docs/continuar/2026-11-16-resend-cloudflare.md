# Continuar: Resend + Cloudflare pelo navegador (16/11/2026)

> Como usar numa sessão nova do Claude Code, aberta em `ar-controle/`:
> **"Leia docs/continuar/2026-11-16-resend-cloudflare.md e faça o trabalho."**
> Antes, confirme com `/chrome` que a extensão Claude in Chrome está conectada (Google Chrome, mesma conta do `/login`).
> Deixe o Chrome logado em resend.com e dash.cloudflare.com.

## Contexto (o que já está pronto)

- Leia o `CLAUDE.md` do projeto, em especial §0 (regras de ouro), §7.8 (esqueci a senha) e **§7.10 (E-mail: Resend + Cloudflare)**.
- Código no ar desde o commit `0c48b95`: `backend/app/correio.py`, `backend/app/rotas/correio.py`, `frontend/src/pages/Emails.jsx`
  (tela https://app.zynio.com.br/emails).
- A chave de **envio** do Resend já está salva, criptografada em `config.email`. O envio de teste foi aceito pelo Resend.
- Não há domínio cadastrado no Resend. Hoje os e-mails saem de `onboarding@resend.dev` e só chegam ao e-mail da própria conta do Resend.
- "Esqueci a senha" usa o e-mail padrão do Supabase até o domínio ser verificado. A troca é automática.
- DNS público de `zynio.com.br` (Cloudflare):
  - o DMARC `p=reject` e o SPF raiz `v=spf1 -all` já existem e **não devem ser alterados**;
  - faltam DKIM `resend._domainkey`, MX `send` e TXT (SPF) `send`.
- Smoke test em produção ok: `/saude` 200, `/api/email/estado` 401 sem login, webhook sem assinatura 401.

## Tarefa: o que fazer pelo navegador

1. **Resend → Domains → Add domain**: `zynio.com.br`, região **São Paulo (sa-east-1)**.
   Copie os registros que o Resend gerar (nome, tipo, valor, prioridade). Os valores de DKIM são públicos, não são segredo.
2. **Cloudflare → zynio.com.br → DNS → Records**: crie **só** os registros que o Resend pediu:
   - TXT `resend._domainkey` (DKIM);
   - MX `send` (prioridade 10, valor `feedback-smtp.sa-east-1.amazonses.com` ou o que o Resend mostrar);
   - TXT `send` (`v=spf1 include:amazonses.com ~all` ou o que o Resend mostrar);
   - proxy **desligado** ("DNS only").

   **Não apague nem edite** os registros que já existem: A @, CNAME www/app, TXT google-site-verification, SPF raiz, DMARC.
   Se o Resend sugerir um DMARC, ignore: o que existe já basta.
3. **Resend → Verify DNS records**. Confira também com:
   `dig +short TXT resend._domainkey.zynio.com.br @1.1.1.1` e `dig +short MX send.zynio.com.br @1.1.1.1`.
4. **Resend → Webhooks → Add endpoint**:
   - URL `https://app.zynio.com.br/api/email/webhook`;
   - eventos `email.sent`, `email.delivered`, `email.delivery_delayed`, `email.bounced`, `email.complained`, `email.opened`, `email.clicked`
     (ou todos os `email.*`).

   O **Signing secret (`whsec_…`) é o dono quem copia** e cola em https://app.zynio.com.br/emails → Conexões → Chaves → "Resend · segredo do webhook" → Salvar.
   O Claude não lê, não copia e não digita segredos.
5. **Conferir no painel**: em /emails, use "Conferir agora". Os 3 registros devem aparecer como "encontrado".

   Com o domínio verificado, o remetente vira `nao-responda@zynio.com.br` sozinho (`correio.remetente()`).

   O estado `config.email.dominio.status` só é atualizado pelo botão se houver `api_key_total`. Sem ela, ou o dono cola uma chave "Full access",
   ou o Claude grava o estado lido no navegador. Exemplo: rode pelo `db` local um script que faça `correio.cfg()` → `c["dominio"] = {"status": "verified", "regiao": "sa-east-1", "lido_em": db.agora()}` → `correio.salvar_cfg(c)`.
   Confira antes em `correio.py` como o campo é lido.
6. **Testes**:
   - "Enviar teste" para um e-mail que **não** é o da conta do Resend (pergunte ao dono qual usar);
   - "Esqueci a senha" em https://app.zynio.com.br/login com uma conta de teste: deve chegar o modelo próprio, com o logo;
   - o histórico em /emails deve mudar para "entregue" (prova de que o webhook funciona).
7. **Opcional, perguntar antes**: Supabase → Auth → SMTP settings usando o Resend (host `smtp.resend.com`, porta 465, usuário `resend`, senha = chave do Resend).
   **É o dono quem cola a senha.**
8. Atualize o `CLAUDE.md` em §1 (linha "E-mail"), §7.10 e §14 (estado atual). Faça o commit sem segredos, conforme §0.

## Regras desta tarefa

- Configuração nas contas do dono (Resend, Cloudflare) foi pedida por ele. Mesmo assim, **não apague nada** e confirme antes de qualquer coisa irreversível.
- Segredos (chaves `re_…`, `whsec_…`, tokens da Cloudflare, senhas): nunca digitar, ler, imprimir ou commitar.
  A tela /emails os guarda criptografados quando o **dono** cola.
- Se a extensão não conectar: peça ao dono para criar a chave "Full access" do Resend e o token "Edit zone DNS" da Cloudflare e colar em /emails → Chaves.
  Depois clique em "Preparar domínio": `correio.provisionar()` faz os passos 1 a 3 pela API.

## Outras pendências (não fazem parte desta tarefa)

- **Vercel**: apagar 55 publicações antigas (49 do app e 6 do site, mantendo as 10 mais novas e a que está no ar) e baixar a retenção para 7 dias.
  **Aguarda o sim explícito do dono.** Use a tela /infra, que tem simulação, ou `infra.op_limpar`.
- **Transmissor "Smart IR" offline** desde 15/11 e **nenhum botão IR gravado**: sem isso o ar não obedece. É trabalho presencial no escritório.
- **PC Windows do escritório**: rodar `instalar-windows.ps1` (passo a passo em /guia).
- Deison (admin) sem 2FA. Confirmar cargo e horário de Cássio e Alexandre no mapa.
