# Relatório de implementação (20/11/2026, versão 0.4.7)

## Controles novos

| Controle | Onde | Comportamento |
|---|---|---|
| Estado seguro sempre passa | `backend/app/fisico.py` (`SEGURAS`) | desligar, fechar, parar e trancar nunca são barrados por trava de software |
| Limite por aparelho | `fisico.checar_ar`, `fisico.checar_dispositivo` | ar 12/min, luz 10, cafeteira 4, persiana 12, fechadura 5; conta no banco (vale para nuvem e agente) |
| Anti liga/desliga do ar | `fisico.checar_ar` | no máximo 8 trocas ligado↔desligado em 10 min |
| Isolar aparelho | `fisico.isolar`, `POST /api/seguranca/isolar` (dono/admin, motivo obrigatório) | isolado só aceita o estado seguro; fila da placa é limpa; tudo na Atividade |
| Validade do sinal IR | `transmissor.VALIDADE_ENVIO = 20` | pedido `enviar` parado na fila há mais de 20 s não é executado |
| Validade na placa própria | `dispositivos.sincronizar` + `fisico.VALIDADE_PLACA` | destrancar expira em 30 s; o resto em 120 s; expirado vira evento com falha |
| Cafeteira nunca ligada para sempre | `dispositivos.ciclo` | sem tempo configurado (0) desliga em 90 min |
| Recusa = 409 | `rotas/api._erro` | trava física não conta como erro de servidor nem como ataque no firewall |
| Tela | Segurança → Comandos físicos; cartão "Travas de segurança" em Luzes, Cafeteira, Persianas e Fechadura | regras, isolados, recusas das últimas 24 h |

## Testes executados

- Lógica das travas com o banco simulado em memória (sem enviar sinal): 12 casos. Rajada bloqueia, desligar com rajada
  passa, 8 trocas em 10 min bloqueiam, isolado só desliga/tranca, liberar volta ao normal, validade 30 s/120 s. Todos ok.
- Consultas reais (somente leitura) no Supabase: contagens de `atividade`/`dispositivos_eventos` e o filtro novo da fila.
- `import app.main`, ruff F821, build do frontend.

**Não testado**: envio real de infravermelho com as travas (o agente do escritório precisa estar ligado), placa própria
física (nenhuma instalada).

## Já existia (reforço, não substituição)

Firewall com bloqueio progressivo, inspeção de corpo (SQLi, NoSQL, SSTI, XXE, Log4Shell, travessia), iscas, robôs de IA,
Turnstile + prova de trabalho, CAPTCHA no Supabase Auth, 2FA TOTP, passkeys, sessões com inatividade e duração máxima,
segredos AES-256-GCM, logs selados, RLS em todas as tabelas, CSP/HSTS/CSRF por Origin, escudo anti-DDoS da Vercel.

## Riscos residuais e recomendações

- 2FA do admin não obrigatório (ligar `exigir_2fa_admin` quando o Deison tiver 2FA).
- Rede: colocar transmissores, tomadas e fechadura numa rede 2,4 GHz só de IoT (SSID separado, sem acesso aos PCs),
  com exceção para o computador do agente alcançar a porta 6668. Depende do roteador do escritório.
- Proteção elétrica/térmica da cafeteira e das tomadas é do hardware; o software só complementa.
- O infravermelho não confirma o estado (não há telemetria do ar): o sistema não sabe se o ar obedeceu.
