# Continuar: mais 5 aparelhos no Sinric Pro (17/11/2026)

> Depois de pagar no portal do Sinric Pro (plano por aparelho, 5 aparelhos, 1 ano), abra o Claude Code em `ar-controle/`
> e cole o **prompt do fim**. O pagamento é do dono, no portal (Stripe); o Claude não paga nada.

## Situação depois da compra (17/11/2026)

- Total na conta: **9 aparelhos** (grátis 3 + 5 com cobrança automática + 1 com pagamento manual e lembrete, vencendo em 17/11/2027).
  `config.sinric.limite_aparelhos = 9`. Em uso: 1 ("Ar do escritório"). Os outros 8 ares ainda não estão cadastrados no sistema ou
  não têm botões; cada um entra na Alexa depois de ter transmissor e botões (copiar do Ar do escritório se for Gree igual).

## Situação antes da compra

- Conta do Sinric: a mesma de hoje (credenciais cifradas em `config.sinric`; o agente usa App Key/Secret do `.env`).
- Limite usado pelo sistema: `config.sinric.limite_aparelhos` (sem valor = 3, o plano grátis). O diagnóstico da Alexa
  (`GET /api/sinric/diagnostico`, itens "plano" e "capacidade") compara com esse número.
- Na Alexa hoje: 1 aparelho ("Ar do escritório", `6af888eb7d04ce9fd64d6777`).
- Plano físico (CLAUDE.md §7.13 e §14): transmissor A = salão (5 Gree iguais = 1 zona), B = Fabio e Devs, C = Reunião.

## O que o Claude faz

1. **Conferir a compra sem adivinhar**: perguntar ao dono quantos aparelhos o portal mostra agora (a página de preços não diz
   se os 5 somam aos 3 grátis). Gravar o total em `config.sinric.limite_aparelhos` (por `db.cfg("sinric")` +
   `db.set_cfg`, que mantém o resto cifrado; nunca imprimir chaves).
2. **Analisar os dispositivos**: `sinric.listar_dispositivos()` (nome, tipo, online, sala, vínculo com aparelho do sistema).
   Apontar: dispositivos sem vínculo, vínculos apagados no Sinric, tipos errados (precisa `AC_UNIT`), nomes repetidos ou curtos.
3. **Decidir o mapa Alexa ↔ ares com o dono**, lembrando a física: ares iguais no mesmo transmissor mudam juntos. Ter um
   aparelho por ar na Alexa NÃO separa os ares do salão; só faz sentido para ares em transmissores próprios (Fabio, Devs,
   Reunião) ou se o salão ganhar transmissores dedicados e o teste de interferência confirmar que ficaram independentes.
4. **Aplicar** (cada criação/renomeação muda o que a Alexa conhece: mostrar a lista e esperar o "sim"):
   - zonas: Integrações → Zonas na Alexa → Organizar (ou `POST /api/sinric/zona/{id}` com `executar:false` antes);
   - ares soltos: tela Integrações → "Aparelhos ainda fora da Alexa" → Criar no Sinric (ou `sinric.criar_dispositivo`).
5. **Testar**: "Alexa, descobrir dispositivos"; um comando por aparelho novo; conferir "Último comando de voz" e a Atividade.
   Diagnóstico tudo verde (capacidade ≤ limite, uma zona = um aparelho, agente enxerga os transmissores).
6. Atualizar `CLAUDE.md` §14 (limite e aparelhos na Alexa) e `novidades.json` se o usuário notar diferença; commit sem segredos.

## Prompt para colar no Claude Code

```
Leia o CLAUDE.md e docs/continuar/2026-11-17-sinric-mais-aparelhos.md e faça o trabalho.

Comprei mais 5 aparelhos no Sinric Pro. O portal agora mostra <N> aparelhos no total.
Ares instalados hoje: <liste sala, transmissor e se é Gree igual aos outros>.

1. Grave o novo limite no sistema e analise todos os dispositivos da conta do Sinric (vínculos, tipos, nomes).
2. Me proponha o mapa Alexa ↔ ares/zonas, explicando o que muda de verdade em cada ar.
3. Só depois do meu sim, crie/renomeie no Sinric e me diga o que falar para a Alexa.
4. Teste comigo e confira o diagnóstico. No fim, atualize o CLAUDE.md e faça o commit sem segredos.
```
