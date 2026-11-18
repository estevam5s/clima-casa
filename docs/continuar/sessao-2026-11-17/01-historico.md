# Histórico da sessão (16 e 17/11/2026)

## 1.4.2 · Auditoria de segurança
- Auditoria completa com a skill `cloudflare/security-audit-skill` (relatório em `~/security-audit-skill/clima-casa/run-1/`): 18 pistas, todas corrigidas.
- Regras que ficaram estão no CLAUDE.md §12 (escopo por projeto, `_SO_ACESSO_TOTAL`, `_pode_mexer_em`, OAuth preso ao usuário, planilhas com `celula`).

## Sinric · 9 aparelhos
- Plano grátis (3) + 5 com cobrança automática + 1 com pagamento manual (renovar até 17/11/2027) = 9; `config.sinric.limite_aparelhos = 9`.

## 1.5.0 · Mapa, Novidades, CAPTCHA
- Corredores largos (MARGEM 4,2 m), avatares mais realistas, elevador de verdade até o térreo (recepção com balcão, catracas, espera).
- Pilar redondo em frente à Reunião; Escritório e Reunião maiores; Cássio e Alexandre trocaram de lugar.
- Cores por sala (piso, cadeira, mesa, porta), portas que abrem e fecham (fechada bloqueia a passagem); porta do Escritório preta.
- `/novidades` com linha do tempo em Three.js.
- CAPTCHA (Turnstile) ligado no Supabase Auth (dono escolheu "Ligar agora").

## 1.5.1 a 1.5.4
- 1.5.1: assistente "Levar para o próximo ar" (instalar ar por ar com o mesmo transmissor sem interferir no anterior).
- Vercel: 77 publicações antigas apagadas e retenção de 7 dias (feito no painel; a API não aceita mais).
- Ares #7 a #11 criados no transmissor do Escritório e cada um numa sala do Sinric com o nome do projeto.
- 1.5.2: assistente para trocar a conta da Alexa com teste ao vivo.
- 1.5.3: painel mostra os ares da sala lado a lado; #9 virou "Ar servidor" e #10 "Ar Guilherme".
- 5 ares religados ao transmissor do Escritório (dono confirmou "Religar").
- 1.5.4: "Procurar na rede" corrigido (tinytuya), transmissor aparece nas salas dos ares que atende, correção de estado quando usam o controle remoto, painel atualiza a cada 15 s, placa do pódio sem piscar, ar dentro/fora da zona, Fabio masculino.

## 1.6.0 · Responsável por ar e Raspberry Pi
- `usuarios.aparelhos` ("*" ou lista): "Só estes ares" no formulário de usuário; vale no servidor em listas, painel, mapa, Alexa, relatórios, atividade e comandos.
- Ares que faltavam: #12 Ar do Fabio (transmissor "Fabio e Devs"), #13 Ar da reunião (sem transmissor), #4 Ar dos devs com 301 botões. Sinric 9/9 com salas Sala Fabio, Devs e Reunião.
- `frontend/public/instalar-agente.sh`: instalação por código em Linux/Raspberry Pi 64 bits (Python 3.13 pelo uv). Testado em Debian 12 ARM64 no Docker.
- Backend compila no Python 3.11 (f-strings em `exportar.py`/`docx_simples.py`).

## Alexa nova (17/11 à tarde)
- Dono vinculou a skill Sinric Pro numa conta Amazon nova. O erro "Unable to link accounts" é da Amazon ao vincular pelo site: fazer pelo app Alexa.
- A Alexa nova respondeu "Não encontrei … ar escritório": faltava **descobrir dispositivos** na conta nova. O Sinric tem os 9 ares online, nomes certos. Pendente confirmar (ver 03-pendencias).

## 1.7.0 · Térreo, Ilha, Prefeitura, Raspberry, Aparelhos
- Térreo: porta de vidro automática no vão do pódio; grade do térreo vai até a calçada (sai do prédio); grade de 20 cm (a de 10 cm engasgava); por fora o prédio aparece inteiro.
- Cidade: aviões (sem névoa, alcance 520 m), bairros de casas com telhado de duas águas nos lotes afastados, pedestres até 150.
- Botão **Ilha** no mapa: `components/VistaIlha3D.jsx` + `ilhaDados.json` (contorno real do OpenStreetMap, ODbL, lagoas da Conceição e do Peri, pontes estilizadas, aeroporto, Centro). Relevo e continente são ilustração (a tela diz).
- Relatórios PDF/Word no **modelo da Prefeitura** (padrão; "Moderno" continua): brasão (`backend/app/assets/brasao-pmf.png`, extraído do manual da VPN), cabeçalho "Estado de Santa Catarina / Prefeitura Municipal de Florianópolis" (+ órgão do white label), identificação, índice, seções "1 – / 1.1 –", local/data por extenso e assinaturas.
- Segurança → Conformidade: "O que falta, em ordem" + minutas (`backend/app/documentos.py`) no modelo oficial; selo de integridade a cada hora no agente; 8.18, 8.19 e 8.25 declarados pelo sistema com o fato. Nota foi de 53% para 56% (anexo 55% → 60%).
- Infra → Agentes: saúde de cada computador (modelo, IP, temperatura, memória, disco, carga), "Reiniciar agente" à distância (`agente_ordem:<id>`), passo a passo do Raspberry Pi (Imager, SSH em Mac/Windows/Linux, código, preferir).
- Aparelhos: visões grade / por sala / tabela com seleção e lote; filtros por sala, transmissor e problema; ordenação. Transmissores: busca, filtro e salas atendidas.
- Gravar botão: checagem "Antes de gravar" (`GET /api/aparelhos/{id}/pronto-para-gravar`) e próximo ar sem botões ao terminar.
- Menu lateral: busca (tecla `/`, sinônimos) e grupos recolhíveis.
- Correções: Novidades (canvas vazava em tela retina: `setSize(w, h, false)` sem CSS), Relatórios sem rolagem lateral (grades sem coluna base).
