# Decisões

- Catálogo de blocos dos fluxos num módulo separado (`fluxos_catalogo.py`) que se registra no mesmo `CATALOGO`: a tela, a validação e o
  motor continuam com uma fonte única. Gatilhos de evento começam do "agora" (não disparam pelo histórico).
- Conexões externas cifradas em `config.fluxos_conexoes`; só dono/admin criam; URL só https pública (trava de SSRF); rede local só dono e
  só no agente.
- Extensão do navegador usa o token de acesso do painel e **nunca** o de renovação (renovar pela extensão trocaria a sessão do painel).
  O servidor aceita origem de extensão só com Bearer.
- Integridade: refazer selos só com motivo, pelo dono, com histórico. Nunca apagar linhas seladas direto.
- Bugs operacionais (2FA de admin, backup atrasado, certificado, e-mails que falham) viram notificação, não bug de código.
