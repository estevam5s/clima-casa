# Continuar: Alexa definitiva (mesma conta do Sinric) e zonas do salão (16/11/2026)

> Quando a Alexa nova chegar e os ares estiverem no teto, abra o Claude Code em `ar-controle/` e cole o **prompt do fim**.
> Antes: um computador com o agente **no escritório** (Infra → Agentes: "enxerga N de M").

## Como ficou o escritório (decisão do dono, 16/11)

| Transmissor | Atende | Zona (ares que obedecem juntos) | Alexa |
|---|---|---|---|
| **A** "Smart IR · Escritório" (`ebd5de43…`) | Escritório, Sala Bancada, Analistas, Diretor, Sala Deison | **Salão** (5 Gree iguais) | 1 aparelho: "Ar do salão" |
| **B** "Smart IR · Fabio e Devs" (`eb3f5451…`) | Sala Fabio, Devs | **Fabio e Devs** (se forem iguais) | 1 aparelho: "Ar dos devs" |
| **C** (ainda não comprado/pareado) | Reunião (fechada) | sozinho | 1 aparelho: "Ar da reunião" |

**Por quê zonas**: infravermelho não tem endereço. Ares iguais à vista do mesmo transmissor recebem o mesmo sinal; não dá
para comandar um sem o outro (`backend/app/zonas.py`). 3 zonas = 3 aparelhos no Sinric = limite do plano grátis.

## Passo a passo (o Claude faz, pedindo o que for físico)

1. **Ares**: para cada sala do salão, criar o aparelho no projeto da sala vinculado ao transmissor A (Transmissores → "Adicionar
   ar novo" ou `POST /api/aparelhos`). Botões: "Copiar de outro ar" a partir do **Ar do escritório** (mesmo Gree, 301 botões).
2. **Teste de interferência** (Transmissores → cartão A → "Testar interferência"): alguém no salão diz quem apitou; gravar.
   Resultado esperado: os 5 numa zona. Se algum não apitar, rever a posição do transmissor.
3. **Nome da zona**: "Salão" (PUT /api/zonas).
4. **Alexa por zona** (Integrações → "Zonas na Alexa" → "Organizar na Alexa", ou `POST /api/sinric/zona/{id}` com
   `executar:false` para a prévia). **Mostrar a prévia ao dono e só executar com o "sim" dele**: renomeia "Ar do escritório"
   no Sinric para "Ar do salão" (a Alexa antiga passa a chamar assim depois de "descobrir dispositivos").
5. **Nova Alexa (mesma conta)**: no app Alexa da conta nova → Skills → "Sinric Pro" → Ativar → entrar com a MESMA conta do
   Sinric. "Alexa, descobrir dispositivos". Teste: "Alexa, ligue o ar do salão" → conferir em Integrações → Diagnóstico
   ("Último comando de voz recebido") e na Atividade.
6. **Diagnóstico** (`GET /api/sinric/diagnostico`): tudo verde (credencial, agente, websocket, zonas na Alexa = 1 aparelho
   cada, capacidade ≤ 3, agente enxerga os transmissores).
7. Atualizar `CLAUDE.md` §14 e `novidades.json` se algo mudou para o usuário; commit sem segredos.

## Prompt para colar no Claude Code

```
Leia o CLAUDE.md e docs/continuar/2026-11-16-nova-alexa-e-zonas.md e faça o trabalho.

Os ares estão instalados assim: <confirme a tabela do arquivo ou diga o que mudou>.
A Alexa nova já está no meu app Alexa (conta <qual>), com a mesma conta do Sinric Pro.

1. Cadastre os ares que faltam, copie os botões do Ar do escritório e confira.
2. Me guie no teste de interferência (eu digo quem apitou) e grave as zonas.
3. Me mostre a prévia de "Organizar na Alexa" de cada zona e só aplique depois do meu sim.
4. Me diga o que falar para a Alexa nova e confira no diagnóstico que o comando chegou.
No fim, atualize o CLAUDE.md (estado) e faça o commit sem segredos.
```
