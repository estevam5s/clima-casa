# Resposta a incidentes (roteiros curtos)

Sempre: registrar em Segurança → Incidentes (data, o que viu, o que fez). Preservar evidência = não apagar Atividade nem eventos.

**Conta comprometida**
1. Configurações → Contas: desativar a conta e encerrar as sessões dela.
2. Segurança → Comandos físicos: isolar a fechadura e o que a pessoa controlava.
3. Atividade → filtrar pela pessoa (origem `painel:<nome>`): o que ela mandou.
4. Trocar a senha, exigir 2FA, liberar os aparelhos depois de conferir.

**Controle físico não autorizado (ar, luz ou fechadura mexendo sozinhos)**
1. Isolar o aparelho (só o estado seguro passa). Fechadura: trancar.
2. Atividade/Histórico do aparelho: origem do comando (Alexa, agenda, automação, Telegram, IA).
3. Desligar a automação ou agenda culpada; se foi Alexa, conferir Integrações → Diagnóstico.

**Placa própria comprometida ou token vazado**
1. Conectar aparelho → Placa própria → gerar código novo (o anterior para de valer na hora).
2. Isolar o aparelho até regravar a placa.

**Transmissor/agente comprometido (PC do escritório)**
1. Infra → Agentes: tirar o computador da lista; desligar o serviço nele.
2. Trocar o `.env` (Supabase, Vercel, Sinric, Cloudflare) e a `CLIMA_CHAVE_MESTRA` se o arquivo saiu do PC.

**Ataque de negação de serviço**
1. Segurança → Escudo (liga o modo de ataque da Vercel). Lembrete: o login também fica atrás do desafio.
2. Depois que passar, desligar o escudo.

**Vazamento de segredo**: rotacionar imediatamente (Supabase, Vercel, Sinric, Spotify, Resend, Turnstile, Telegram) e
conferir o histórico do git.
