# Continuar: um ar e um transmissor por sala (16/11/2026)

> Quando os transmissores estiverem no teto, abra o Claude Code na pasta `ar-controle/` e cole o **prompt do fim deste
> arquivo**. Antes, confira que o computador com o agente (Mac ou PC Windows) está **no Wi-Fi do escritório**.

## Como fica

Cada **sala = um projeto**. Cada projeto tem **o seu ar** e **o seu transmissor** (Smart IR SRW-004).

| Projeto (id) | Sala no mapa | Vaga de ar desenhada no mapa | Ar hoje | Transmissor hoje |
|---|---|---|---|---|
| Escritório (1) | salão | (já ocupada) | **Ar do escritório**: funcionando, 301 botões (Gree) | Smart IR · Escritório (192.168.59.85) |
| Sala Deison (3) | sim | `ar-subsecretario` | — | — |
| Sala Bancada (4) | sim | `ar-bancada-1`, `ar-bancada-2` | — | Smart IR · Sala Bancada (192.168.59.14, **fora do ar** desde a tarde de 16/11) |
| Reunião (5) | sim | `ar-reuniao` | — | — |
| Diretor (6) | sim | `ar-diretor` | — | — |
| Analista (7) | sim | `ar-analista` | — | — |
| Sala Fabio (8) | sim | `ar-semnome` | — | — |
| Devs (9) | não tem sala (fica no salão) | — | **Ar dos devs**: cadastrado, sem transmissor e sem botões | — |

As **vagas desenhadas** ("ar previsto") viram o ar de verdade sozinhas: ao criar um aparelho no projeto, o mapa põe o ar
na primeira vaga daquela sala (`mapaUtil.completar`). Por isso não precisa posicionar à mão.

## O que você faz (físico, uma sala por vez)

1. **Parear no app Smart Life**, no Wi-Fi **2,4 GHz** do escritório (5 GHz não funciona). Segure o botão do transmissor até a
   luz piscar rápido → Adicionar dispositivo. Nome sugerido no app: `Smart IR · <Sala>`.
2. **No teto, com visão direta do ar**: a "bolinha" (LED) apontada para o receptor do ar (o canto do painel do ar), a até
   8–10 m, sem luminária, viga ou divisória na frente. Infravermelho não atravessa parede nem porta fechada.
3. **Na tomada (USB 5 V)** e anote em qual sala ficou.
4. Quando o Claude pedir, **grave o Desligar** daquela sala: aponte o controle do ar para o transmissor (5 cm), com o
   controle "ligado", e aperte Liga/Desliga uma vez (painel: Aparelhos → o ar → Gravar → Desligar).

## O que o sistema (o Claude) faz em cada sala

1. Confere que o agente está no escritório e enxerga a rede (`Infra → Agentes`: "enxerga N de M transmissores").
2. **Importa o transmissor novo** da conta Smart Life (tela Transmissores → Importar, ou `tuya_nuvem.listar_aparelhos()` +
   cadastro), descobre o IP na rede (`transmissor.reparar`) e confere a conexão (`transmissor.diagnosticar` = "ok").
   - SRW-004 v3.3 não responde status: o diagnóstico já trata isso como "ok" (`device22`).
   - Transmissor pareado de novo ganha **outro ID**: o autorreparo migra sozinho quando o antigo fica offline na conta.
3. **Põe o transmissor no projeto da sala** e dá o nome `Smart IR · <Sala>`.
4. **Cria o aparelho** no projeto (nome falado na Alexa, ex.: "Ar da reunião"), faixa 16–30°, modos
   `frio,quente,ventilar,seco,auto`, **vinculado ao transmissor da sala**. O mapa ocupa a vaga desenhada da sala.
   Cor no mapa: a do controle/ar real (o do escritório é preto `#18181b`).
5. **Botões**:
   - Pede para você gravar o **Desligar** e confere a gravação (pulsos ≥ 100; o sistema já recusa ruído < 16 pulsos).
   - Se o controle for **Gree** (cabeçalho ~9000/4500 µs): pela tela, Aparelho → Botões gravados → "Controle Gree"
     (Conferir → Testar Frio 24° → Gerar 300 botões), ou pela API `POST /api/aparelhos/{id}/gree`. O script
     `scripts/gree_gerar.py <id>` faz o mesmo pelo terminal (mesmo módulo `backend/app/gree.py`).
   - Ar do **mesmo modelo** que outro já pronto: Botões gravados → "Copiar de outro ar" (`POST /api/aparelhos/{id}/copiar-botoes`).
   - Se **não** for Gree: você grava à mão os ajustes mais usados (Frio 21–25°, etc.), sempre com o controle 1° acima e
     apertando "−" uma vez (nunca o Power, que alterna liga/desliga).
6. **Testa** com você olhando o ar: Ligar, Desligar, uma temperatura diferente.
7. **Alexa**: o Sinric Pro grátis aceita **3 aparelhos** (hoje usa 1). Com 8+ ares, decidir antes: plano pago do Sinric ou a
   skill própria (`alexa/GUIA.md`). Não marcar "Disponível na Alexa" além do limite.
8. Atualiza o `CLAUDE.md` §14 (estado) e faz commit sem segredos (§0).

## Um transmissor para 3 ou 4 ares (mesmo ambiente)

Dá para um único transmissor atender vários ares **à vista dele** (até ~4, 8–10 m, sem parede no caminho):
- Transmissores → cartão → **"Adicionar ar a este transmissor"** (transmissor e projeto já escolhidos). O ar pode ser de outro projeto.
- **Ligar todos / Desligar todos** no cartão (`POST /api/hubs/{id}/todos`, um ar por vez, ~1,2 s entre eles).
- **Ares iguais respondem juntos**: o sistema detecta (mesmo Desligar no mesmo transmissor), atualiza o estado dos dois
  (`clima.responderam_juntos`) e mostra o aviso amarelo no cartão. Para separar, um transmissor por ar.
- Tutorial para o usuário: Guia → "Um transmissor para vários ares" (`/guia#varios-ares`).

## Cuidados

- **Dois ares iguais no mesmo ambiente respondem ao mesmo sinal.** No salão, o **Ar do escritório** e o **Ar dos devs** só
  ficam independentes se cada transmissor enxergar apenas o seu ar (transmissor bem perto do ar e virado para ele).
  Teste: mande "Ligar" para um e veja se o outro liga junto.
- O controle físico não acompanha o que o painel manda (infravermelho é só de ida).
- O agente precisa estar **no escritório** para gravar e para mandar comandos. Com o PC Windows instalado (Infra → Agentes →
  código de instalação), o Mac pode ir para casa.
- Sala com **dois ares** (Sala Bancada tem duas vagas): os dois no mesmo transmissor só funcionam separados se forem de
  modelos diferentes; iguais = um transmissor para cada, cada um mirado no seu.

## Prompt para colar no Claude Code

```
Leia o CLAUDE.md e docs/continuar/2026-11-16-ares-por-sala.md e faça o trabalho.

Instalei transmissores Smart IR no teto destas salas (cada sala é um projeto):
- <Sala>: transmissor "<nome no Smart Life>", ar <marca/modelo se souber>, nome para a Alexa "<Ar da ...>"
- <Sala>: ...

Para cada sala, nesta ordem e me avisando o que precisa de mim:
1. Confira que o agente está no Wi-Fi do escritório e enxerga os transmissores.
2. Importe o transmissor da conta Smart Life, coloque no projeto da sala com o nome "Smart IR · <Sala>",
   descubra o IP e confirme a conexão.
3. Crie o aparelho no projeto (16–30°, todos os modos), vinculado ao transmissor da sala, ocupando a vaga do mapa.
4. Me peça para gravar o Desligar, confira a gravação e, se for Gree, use a tela "Controle Gree" (ou
   scripts/gree_gerar.py) para testar Frio 24° e depois gerar os 300 botões. Ar igual a outro já pronto:
   "Copiar de outro ar". Se não for Gree, me guie na gravação manual.
   (Se um transmissor atende vários ares da mesma sala, use "Adicionar ar a este transmissor".)
5. Teste comigo: ligar, desligar e mudar a temperatura.
Não coloque mais aparelhos na Alexa do que o limite do Sinric sem me perguntar. No fim, atualize o CLAUDE.md
(estado atual) e faça o commit sem segredos.
```
