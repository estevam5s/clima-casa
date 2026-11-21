# Decisões de 21/11/2026

- Tradução do site no navegador (dicionário do sistema), não rotas /en/… : não exigiu reescrever as 30 páginas; o SEO dos idiomas usa `?lang=` com hreflang e no sitemap. Texto com destaque vira chave com marcadores (`a <1>b</1> c`) para a tradução poder mudar a ordem.
- Textos vistos só no navegador (mensagens de formulário, aviso de cookies que vem do sistema) entram como pendentes e precisam de aprovação no painel: ninguém de fora enche a lista nem gasta IA.
- Medição de acessos própria (sem Google Analytics): sem IP; identificador entre visitas só com consentimento de "estatísticas"; 90 dias.
- Newsletter com dupla confirmação (LGPD); devolvido/reclamado sai da lista sozinho; envio pela API de lote do Resend; agendadas pelo agente.
- Auditoria de SEO passa pelo portão do site com HMAC do mesmo `VERIFICACAO_SEGREDO` (vale 5 min).
