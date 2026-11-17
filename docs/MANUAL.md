---
title: "Clima Casa"
subtitle: "Manual de uso: ar-condicionado por infravermelho, Smart Life, Alexa e Sinric Pro"
date: "Versão 1.0 · novembro de 2026"
lang: pt-BR
---

# Como ler este manual

Este documento explica, passo a passo, como montar, usar e manter o **Clima Casa**: o sistema que liga, desliga e
ajusta os ar-condicionados da casa pelo celular, pelo computador e por voz (Alexa e Google Home).

- Se você está **começando do zero**, siga os capítulos 2 a 7 na ordem.
- Se o sistema **já está funcionando**, vá direto ao capítulo 8 (uso no dia a dia) e ao 10 (Alexa).
- Se algo **parou de funcionar**, vá ao capítulo 15 (solução de problemas).

Endereços que você vai usar:

| O quê | Endereço |
|---|---|
| Painel do Clima Casa (web e app instalável) | https://clima-casa-lac.vercel.app |
| Downloads dos apps (celular e computador) | https://clima-casa-lac.vercel.app/apps |
| Portal do Sinric Pro (Alexa e Google Home) | https://portal.sinric.pro |
| Skill Sinric Pro na Amazon Brasil | https://www.amazon.com.br/dp/B07ZT5VDT8 |

# 1. Visão geral: as peças do sistema

O Clima Casa é formado por cinco peças que trabalham juntas:

1. **Transmissor infravermelho "Smart IR"** (modelo SRW-004, NovaDigital/Tuya). Fica no mesmo cômodo do ar,
   ligado na tomada, e "aperta os botões" do controle remoto por você, usando luz infravermelha.
2. **App Smart Life** (celular). Serve só para colocar o transmissor no Wi-Fi da casa.
3. **Agente do Mac**. Um programa que roda sozinho no Mac da casa. Ele conversa com o transmissor pela rede
   local, dispara os comandos, roda a agenda e as automações, e mantém a Alexa conectada. O Mac precisa ficar
   ligado e no mesmo Wi-Fi do transmissor.
4. **Painel Clima Casa** (site, app de celular e app de computador). É onde você controla tudo.
5. **Sinric Pro**. Serviço que liga o Clima Casa à **Alexa** e ao **Google Home**.

Como um comando chega ao ar:

```
Você (painel, app ou "Alexa, ligar o ar do escritório")
   → Clima Casa (internet)
   → Agente do Mac (rede de casa)
   → Transmissor Smart IR
   → luz infravermelha
   → ar-condicionado
```

> **Importante:** o ar-condicionado não avisa de volta o que está fazendo. Se alguém usar o controle remoto
> original, o painel não fica sabendo. O painel mostra sempre o último comando enviado por ele.

# 2. Antes de começar

Você vai precisar de:

- Wi-Fi de **2,4 GHz** (o transmissor não funciona em 5 GHz). Se o roteador junta as duas redes num nome só,
  procure no roteador a opção de separar ou de criar uma rede só de 2,4 GHz.
- O **controle remoto original** de cada ar-condicionado, com pilhas boas.
- O **Mac da casa** ligado e conectado ao mesmo Wi-Fi do transmissor.
- Celular com o app **Smart Life** e, para voz, o app **Amazon Alexa** (ou Google Home).
- O e-mail e a senha de administrador do Clima Casa.

Onde colocar o transmissor:

- No mesmo cômodo do ar, com **visão direta** para ele (infravermelho não atravessa paredes nem móveis).
- A no máximo **10 metros** do aparelho. Em cima de um móvel, virado para o ar, costuma funcionar bem.
- Ligado na tomada pelo cabo micro-USB (5 V).

# 3. Entrar no Clima Casa

## 3.1 Pelo navegador

1. Abra **https://clima-casa-lac.vercel.app**.
2. Digite o **e-mail** e a **senha** de administrador e toque em **Entrar**.
3. Não existe cadastro: só a conta de administrador entra.

Para trocar a senha: **Configurações → Senha do administrador** (pede a senha atual).

## 3.2 Instalar como aplicativo (PWA)

- **Android (Chrome):** abra o site, toque nos três pontos e em **Instalar app** (ou "Adicionar à tela inicial").
- **iPhone (Safari):** abra o site, toque em **Compartilhar** e depois em **Adicionar à Tela de Início**.
- **Computador (Chrome ou Edge):** clique no ícone de instalar na barra de endereço.

## 3.3 App de celular (Android) e app de computador

1. No painel, abra **Baixar apps** (menu lateral ou botão "Apps" no topo). A página recomenda o arquivo certo
   para o seu aparelho.
2. Os arquivos ficam no repositório privado do GitHub: para baixar, **entre no GitHub** com a conta que tem
   acesso ao projeto.
3. **Android:** abra o arquivo `ClimaCasa-android.apk`, permita "instalar apps desta fonte" e instale.
4. **Mac:** abra o `.dmg` e arraste o Clima Casa para Aplicativos. Na primeira vez, clique com o botão direito
   no app e escolha **Abrir** (o app não tem assinatura da Apple).
5. **Windows:** execute `ClimaCasa-windows.exe` e siga o instalador.
6. **Linux:** dê permissão de execução ao `.AppImage` (`chmod +x`) e abra.

Em todos os apps o login é o mesmo do site.

# 4. App Smart Life: colocar o transmissor no Wi-Fi

## 4.1 Instalar e criar a conta

1. Instale o **Smart Life** (Play Store ou App Store).
2. Crie uma conta (ou entre com a que já existe) e escolha **Brasil** como região.

## 4.2 Adicionar um novo transmissor "Smart IR"

1. Ligue o transmissor na tomada.
2. Segure o botão de **reset** por **5 a 7 segundos**, até o LED azul **piscar rápido**.
3. No Smart Life, toque em **+** (canto superior) → **Adicionar dispositivo**.
4. Escolha a categoria **Controle remoto IR** (ou deixe o app encontrar sozinho pelo Bluetooth/Wi-Fi).
5. Selecione a rede Wi-Fi de **2,4 GHz** e digite a senha.
6. Aguarde a conclusão (até 2 minutos). Dê um nome claro, por exemplo **"IR Recepção"** ou **"Smart IR Sala"**.
7. Toque em **Concluído**.

> Não é preciso configurar controles de ar dentro do Smart Life. Os botões são gravados no Clima Casa
> (capítulo 7), direto do controle original.

## 4.3 Descobrir o seu "Código do usuário"

O Clima Casa usa esse código para ler a sua conta Smart Life (capítulo 5).

1. No Smart Life, toque em **Eu** (canto inferior direito).
2. Toque na **engrenagem** (Configurações) → **Conta e segurança**.
3. Anote o **Código do usuário** (algo como `Bah8ZRv`).

## 4.4 Mudar de rede Wi-Fi

O Smart Life não troca a rede do transmissor diretamente. Faça um novo pareamento:

1. Se ele ainda aparece no app, remova: abra o transmissor → lápis (canto superior) → **Remover dispositivo**.
2. Repita os passos do item **4.2** com a rede nova (2,4 GHz).
3. Pronto. O Clima Casa se ajusta sozinho em até 2 minutos (veja o capítulo 12). Os botões gravados continuam
   valendo.

# 5. Ligar a conta Smart Life ao Clima Casa (uma única vez)

Isso permite que o sistema busque sozinho a chave de segurança (Local Key) de cada transmissor, inclusive depois
de uma troca de Wi-Fi.

1. No painel, abra **Configurações → Conta Smart Life**.
2. Digite o **Código do usuário** (item 4.3) e clique em **Gerar QR Code**.
3. No Smart Life, toque no **ícone de leitor** (canto superior direito da aba Início ou Eu) e escaneie o QR Code.
4. Confirme o login no celular. A tela do painel mostra **"Conectada"** sozinha.

# 6. Cadastrar transmissores e aparelhos

## 6.1 Trazer os transmissores para o Clima Casa

1. Abra **Transmissores IR** no menu.
2. Clique em **Importar todos**: o sistema traz todos os transmissores infravermelhos da sua conta Smart Life,
   com IP e chave. Para escolher um por um, use **Importar um**.
3. Confira se cada um aparece com o ponto **verde** (online). Se não, clique em **Reconectar agora**.

Outras opções da tela: **Procurar na rede** (encontra transmissores no Wi-Fi), **Verificar** (atualiza o status) e
o lápis de cada transmissor (renomear, trocar de projeto, ajustar IP ou chave à mão).

## 6.2 Projetos (casa, escritório, outro endereço)

Um **projeto** é um lugar. Cada projeto tem os seus transmissores, aparelhos e cenas.

1. Abra **Projetos → Novo projeto**, dê nome, endereço e uma cor.
2. No topo do menu lateral, o **seletor de projeto** escolhe qual lugar as telas mostram ("Todos os projetos"
   mostra tudo junto).

## 6.3 Cadastrar um ar-condicionado

1. Abra **Aparelhos → Adicionar aparelho**.
2. Preencha:
   - **Nome**: é o nome que você vai falar para a Alexa. Prefira nomes curtos e diferentes entre si, como
     "Ar do escritório", "Ar da sala".
   - **Projeto** e **Cômodo**.
   - **Marca** (opcional).
   - **Transmissor**: o Smart IR que fica no mesmo cômodo.
   - **Temperatura mínima e máxima** do aparelho.
   - **Modos** que ele tem (frio, quente, ventilar, desumidificar, automático).
   - **Potência (W)**: usada para estimar consumo e custo nos relatórios (9.000 BTU ≈ 800 W, 12.000 BTU ≈ 1.100 W,
     18.000 BTU ≈ 1.650 W). Se não souber, deixe 1.000 W.
   - **Disponível na Alexa**: deixe ligado para controlar por voz.
3. Clique em **Adicionar**. O sistema abre a tela de gravação de botões.

Você pode ter **quantos ar-condicionados e transmissores quiser**, em quantos cômodos e projetos precisar. Um
transmissor pode controlar mais de um ar no mesmo cômodo, desde que "enxergue" todos.

# 7. Gravar os botões do controle original

O controle de ar-condicionado envia **tudo de uma vez** a cada toque: ligado, modo, temperatura e ventilação.
Por isso cada combinação que você quer usar vira um "botão gravado".

## 7.1 Passo a passo

1. Abra o aparelho (**Aparelhos → nome do ar**) e a aba **Botões gravados**.
2. Comece pelo **Desligar**: clique em **Gravar** na linha "Desligar".
3. Quando aparecer **"Aguardando o sinal do controle original"** (30 segundos):
   - aponte o controle para o **transmissor**, a **10 a 20 cm** dele;
   - aperte o botão **desligar** do controle uma vez.
4. Aparece **"Botão gravado"**. Pronto.
5. Agora as temperaturas: na grade **Frio**, clique numa temperatura (por exemplo **23°**).
6. **Antes** de apertar, deixe o **controle original** exatamente em: modo frio, 23°, ventilação automática
   (a tela mostra o ajuste esperado).
7. Clique em **Começar a gravar**, aponte e aperte qualquer botão do controle (por exemplo, a seta de temperatura
   e volte para 23°). O sinal enviado traz o ajuste completo.
8. Repita para as temperaturas e modos que você usa no dia a dia. As temperaturas gravadas ficam destacadas na
   grade.

## 7.2 Dicas

- Grave pelo menos **Desligar** e **3 a 5 temperaturas** do modo frio (por exemplo 20°, 22°, 23°, 24° e 25°).
- Se pedir uma temperatura não gravada, o sistema usa a **mais próxima** gravada no mesmo modo e mostra qual usou.
- Botões que não são de temperatura (swing, turbo, luz do painel) entram em **Gravar botão → Outro botão** e
  aparecem em "Outros botões" na aba Controle.
- Na primeira gravação o sistema descobre sozinho o "formato de comando" do transmissor (pode levar até 1 minuto).
- Gravar só funciona com o **Mac ligado na mesma rede** do transmissor. Pode ser feito pelo site ou pelo app de
  celular (Aparelhos → ar → **Gravar botão do controle**).

## 7.3 Sem gravar tudo: Gree e copiar de outro ar

Na aba **Botões gravados** há dois atalhos:

- **Controle Gree: gerar todos os botões.** Com só o **Desligar** gravado, o sistema monta os 300 ajustes (5 modos,
  16 a 30°, 4 ventilações). Siga os passos: **Conferir** (o sinal é Gree?), **Testar** (manda Frio 24°: o ar tem que
  apitar e ir para 24°) e **Gerar 300 botões**. Se o Conferir disser que não é Gree, grave os ajustes à mão.
- **Copiar de outro ar.** Ar do mesmo modelo (o mesmo controle remoto) de outro já pronto: escolha o ar e **Copiar
  botões**. Botões com o mesmo nome são substituídos.

# 8. Uso no dia a dia

## 8.1 Painel

- **Faixa de métricas**: quantos ares estão ligados, transmissores online, comandos e falhas nas últimas 24 h,
  agendamentos ativos.
- **Ar-condicionado em 3D** com controle rápido: escolha o aparelho, ajuste a temperatura (– e +), o modo e
  ligue ou desligue. O fluxo de ar muda de cor conforme o modo.
- **Integrações**: estado do agente do Mac, Alexa/Google, nuvem Tuya e skill própria.
- **Gráfico** de comandos e falhas dos últimos 14 dias e **atividade recente**.
- **Buscar** (⌘K ou Ctrl+K): encontra qualquer página ou aparelho pelo nome.
- O **sino** mostra os alertas abertos (ar ligado há mais de 12 h, falhas repetidas).

## 8.2 Tela do aparelho

- **Mostrador** com a temperatura, botões – e +, **Ligar/Desligar**, **modo** e **ventilação**.
- **Desligar automaticamente** em 30 min, 1 h, 2 h ou 4 h (funciona até se você ligou pela Alexa).
- **Outros botões** gravados (swing, turbo…).
- **Histórico** dos últimos comandos daquele ar, com origem (painel, Alexa, agenda…).
- Aba **Ajustes**: renomear, trocar de transmissor, cômodo, faixa de temperatura, modos, Alexa, remover.

## 8.3 Aparelhos

Lista de todos os ares, com busca, filtros (ligados, desligados, sem botões gravados, fora da Alexa), filtro por
cômodo, visualização em grade ou lista e o botão **Desligar todos os ligados**.

## 8.4 Cenas

Uma cena executa vários comandos com um toque. Exemplo **"Reunião"**: sala de reunião em 22° ventilação alta e recepção
desligada.

1. **Cenas → Nova cena**, dê o nome e escolha um ícone.
2. Adicione as ações (aparelho + ligar com modo/temperatura/ventilação, ou desligar).
3. **Executar** roda tudo. Pela Alexa, use uma Rotina (capítulo 10.7).

## 8.5 Agenda

Liga e desliga em horários fixos.

1. **Agenda → Novo agendamento**: aparelho, nome, horário, dias (atalhos: todos os dias, dias úteis, fim de
   semana) e a ação.
2. A **grade da semana** mostra quando cada agendamento dispara e a **próxima execução**.
3. O interruptor de cada linha pausa sem apagar.

## 8.6 Automações

Regras do tipo **"quando acontecer X, faça Y"**, inclusive quando o comando veio da Alexa.

- **Quando**: ligar, desligar (por qualquer meio ou só pela Alexa, painel, agenda, cena), ficar ligado por N
  minutos, ou todo dia às HH:MM.
- **Só se** (opcional): dias da semana e janela de horário (por exemplo, das 22:00 às 05:00).
- **Então**: ajustar um aparelho, executar uma cena ou **desligar depois de** N minutos.

Exemplos prontos na tela: "Boa noite: desligar sozinho" (ligou à noite → desliga 3 h depois), "Economia: ligado
há 4 horas" (sobe para 25°), "Madrugada mais fresca" (às 3h, 24° ventilação baixa).

## 8.7 Relatórios e Atividade

- **Relatórios**: escolha o período (7, 30, 90 dias, 12 meses ou **Datas** livres) e, se quiser, um aparelho só.
  A tela mostra comandos (com a variação contra o período anterior), taxa de sucesso, **horas ligado, kWh e custo
  estimados**, comandos por dia por origem, horário de pico, temperaturas escolhidas, **mapa de uso** (dia × hora),
  tabela por aparelho (clique no título da coluna para ordenar) e as falhas com o motivo.
  - **Tarifa**: digite o valor da sua conta de luz em R$/kWh no campo do topo; o custo é recalculado na hora.
  - **Exportar**: PDF, Word (DOCX), Excel (XLSX), CSV, HTML, XML, JSON ou Markdown, com as cores da sua marca.
    **Imprimir** usa a impressora do navegador.
  - Horas e custo são estimativas: contam do "ligar" ao "desligar" enviados pelo sistema.
- **Atividade**: linha do tempo de tudo, agrupada por dia, com busca, filtros por origem e aparelho, opção **Ao
  vivo** (atualiza sozinha) e **Exportar CSV** para planilha.

## 8.8 Configurações: aparência, marca e segurança

- **Aparência**: tema **Claro**, **Escuro** ou **Sistema** (também no botão do cabeçalho). Fica salvo neste navegador.
- **White label (marca própria)**: nome, logo, ícone da aba, cores, fonte, tamanho do texto, cantos, textos do login,
  nomes e itens do menu, banner de aviso, contato de suporte, °C/°F e relógio 12/24 h. A prévia à direita mostra o
  resultado antes de **Salvar**. **Versões** guarda as 15 últimas e permite voltar; **Exportar/Importar** leva a
  marca para outra instalação; **Voltar ao padrão** desfaz tudo.
- **Segurança**: o firewall bloqueia sozinho quem erra a senha várias vezes (5 por padrão), quem usa ferramentas de
  ataque e quem faz requisições demais. O bloqueio cresce a cada reincidência: 15 min, 1 h, 24 h, 7 dias. Na tela você
  vê os eventos, bloqueia ou libera um IP ou faixa (CIDR), bloqueia países e ajusta os limites.
  Use **Nunca bloquear meu IP** na rede do escritório para não se trancar do lado de fora.
- As senhas e chaves das integrações (Smart Life, Sinric, Alexa, chave do transmissor) ficam **cifradas** no banco
  (AES-256-GCM).

## 8.9 Notificações

Clique no sino no canto de cima. As abas separam **Todas**, **Não lidas**, **Importantes** e **Segurança**.
- Clique numa notificação para abrir a tela relacionada; o ponto verde some (lida).
- Botões direto na notificação: **Resolver**, **Desbloquear** (IP), **Reconectar agora** (transmissor), **Gravar botões**.
- **✓✓** marca todas como lidas; a **lixeira** limpa as lidas, as resolvidas ou todas; o **X** limpa uma só.
- A **engrenagem** escolhe quais tipos aparecem, liga um som para novidades e define quando limpar as resolvidas.
- Avisos de condição (transmissor offline, ar sem botões) somem sozinhos quando o problema é resolvido.

## 8.10 Segurança

Menu **Sistema → Segurança**. Mostra a nota de segurança, um **globo 3D** com de onde vêm os acessos (verde/azul) e
os ataques (vermelho), a lista ao vivo, os IPs com nota de risco (bloqueie por 24 h, de vez, ou marque como
confiável com um clique), países, rotas que tentaram atacar e o que está bloqueado agora. **Relatório** baixa tudo
em PDF, Word, Excel, CSV, HTML, XML, JSON ou Markdown, com recomendações. A localização vem do IP e é aproximada.

## 8.11 Baixar os apps

**Sistema → Baixar apps** reconhece o seu aparelho e sugere o arquivo certo. Cada app tem "Como instalar" e o
código SHA-256 para conferir que o arquivo é o original. No celular Android, leia o QR Code.

## 8.12 Usuários, níveis de acesso e permissões

Em **Configurações → Usuários** (dono, administradores e subadministradores):
- **Novo usuário**: nome, e-mail, cargo e o **nível**: Administrador, Subadministrador, Operador, Visualizador ou
  Personalizado. Cada nível já marca as permissões; dá para ajustar uma a uma.
- **Dados de ar-condicionado**: *Todos os projetos* (usa os mesmos ares), *Escolher projetos* ou *Começar do zero*
  (cria um projeto vazio só para a pessoa).
- **Primeiro acesso**: senha forte gerada (aparece uma vez para você passar adiante), senha definida por você ou
  convite por e-mail. Por padrão a pessoa troca a senha no primeiro login.
- No menu **⋯** de cada usuário: editar acesso, gerar senha nova, remover o autenticador (perdeu o celular) e apagar.
- As permissões valem no servidor: quem não tem acesso não consegue nem pela API. Ninguém dá uma permissão que não tem.

## 8.13 Verificação em duas etapas e biometria

Em **Configurações → Segurança**, cada usuário cuida da própria conta:
- **Google Authenticator**: *Ativar* → leia o QR Code no app → digite o código de 6 dígitos → pronto. Daí em diante
  todo login com senha pede o código. **Trocar de celular** gera um QR novo e só remove o antigo depois de confirmar.
  **Desativar** pede um código atual.
- **Biometria**: *Cadastrar aparelho* usa o Face ID / Touch ID / digital / Windows Hello do aparelho. Na tela de login,
  **Entrar com biometria** entra sem senha (e já vale como segunda etapa). Dá para renomear e remover aparelhos.

## 8.14 Infra: domínio, Vercel e Cloudflare

Menu **Sistema → Infra** (dono e administradores; só o dono altera). Quatro abas:

- **Visão geral**: a **saúde do domínio** zynio.com.br conferida ao vivo. Inclui o site e o app na Vercel, o envio de e-mail
  (Resend), o SPF, o DMARC, o recebimento de e-mails, o DNSSEC e o CAA. Cada item que falha diz o que fazer.
- **Vercel**: uso do plano, publicações (log, voltar versão, apagar), retenção e variáveis (só nomes).
- **Cloudflare**:
  - **DNS**: todos os registros com "serve para". Os que têm cadeado sustentam o site, o app ou os e-mails: para mudar,
    é preciso digitar o nome. O proxy laranja fica bloqueado nos endereços da Vercel. Tem gráfico de consultas e o
    botão **Exportar zona** (cópia de segurança).
  - **E-mails**: endereços **@zynio.com.br** (contato@, suporte@, financeiro@, seguranca@…), para onde cada um
    encaminha, o **pega-tudo** e os destinos. Um destino novo precisa confirmar pelo link que a Cloudflare manda.
    Também mostra o gráfico do que chegou nos últimos 7 dias.
  - **Turnstile**: os widgets anti-robô do login e do site, com os desafios por dia.
  - **Segurança**: **DNSSEC** (ligar, e depois colar o registro DS no Registro.br), as configurações da zona e o
    histórico de alterações da conta.
  - **Token**: confere o token e mostra o passo a passo para criá-lo.
- **Agentes**: os computadores com o agente.

A Vercel e a Cloudflare são operadas **pelo agente do escritório**: os tokens ficam só no `.env` do computador do
agente e nunca vão para a nuvem. Com o agente desligado, essas abas avisam e esperam.

Os endereços @zynio.com.br **só recebem**. Para responder como eles, use no Gmail **Configurações → Contas → Enviar
e-mail como**, com o servidor `smtp.resend.com`, a porta 465, o usuário `resend` e a chave do Resend como senha.

## 8.15 Novidades a cada versão

Quando o sistema é atualizado, aparece **uma vez** a janela **"O que há de novo"** com a versão e o que mudou, separado em
**Novo**, **Melhorias**, **Segurança** e **Correções**. Ao fechar, ela não volta naquela versão (vale em qualquer aparelho em
que você entrar). O histórico completo fica em **Sistema → Novidades**, e a central de notificações avisa "Versão X no ar".

# 9. Vários ares, vários transmissores

- Cadastre cada transmissor no Smart Life (capítulo 4) e use **Transmissores → Importar todos**.
- Cadastre cada ar escolhendo o **transmissor do mesmo cômodo**.
- Use **projetos** para separar lugares diferentes (casa, escritório, casa de praia).
- Na Alexa, cada ar aparece com o nome que você deu. Mantenha os nomes diferentes entre si.

## 9.1 Um transmissor para 3 ou 4 ares

Um transmissor no teto pode atender vários ares **do mesmo ambiente**:

1. **Posição**: no teto ou no alto da parede, no meio do ambiente, com visão direta do receptor de cada ar (o canto do
   painel onde você aponta o controle). Alcance bom: **8 a 10 metros**. Infravermelho não atravessa parede, divisória,
   porta fechada nem luminária: ar em outra sala precisa do próprio transmissor.
2. **Cadastro**: **Transmissores →** no cartão do transmissor, **Adicionar ar a este transmissor**. O transmissor e o projeto
   já vêm escolhidos. O ar pode pertencer a outro projeto e usar o mesmo transmissor.
3. **Botões**: grave o Desligar do primeiro ar. Controle Gree: use **Controle Gree** (seção 7.3). Ar do mesmo modelo de
   outro já pronto: **Copiar de outro ar** (seção 7.3).
4. **Ligar todos / Desligar todos**, no cartão do transmissor, mandam um ar de cada vez (cerca de 1 segundo entre eles).
5. O cartão mostra **"N de 4 recomendados"** e avisa quando passar disso.

**Ares iguais respondem juntos.** O sinal infravermelho não tem endereço: dois ares do **mesmo modelo** à vista do mesmo
transmissor obedecem a qualquer comando. O sistema percebe (mesmos botões no mesmo transmissor), atualiza os dois no
painel e mostra um aviso amarelo no cartão. Para comandar cada um separado, use **um transmissor para cada**, bem perto do
seu ar e virado só para ele. Modelos diferentes funcionam separados no mesmo transmissor.

**Teste**: com alguém olhando os ares, mande Ligar para um e veja quem apitou; depois Desligar.

# 10. Alexa e Google Home com o Sinric Pro

## 10.1 Como funciona

O Sinric Pro é um serviço intermediário: a Alexa conversa com o Sinric, e o Sinric conversa com o agente do Mac,
que dispara o infravermelho. Você não precisa criar uma skill: usa a skill pronta **"Sinric Pro"**.

- Cada ar-condicionado do Clima Casa vira um dispositivo do tipo **ar-condicionado** no Sinric.
- Quando o ar muda por outro caminho (painel, agenda), o Clima Casa avisa o Sinric, e a Alexa mostra o estado
  certo.
- **Plano gratuito do Sinric: até 3 dispositivos.** Para mais ares, é preciso um plano pago do Sinric.

## 10.2 Conta e credenciais do Sinric Pro (uma vez)

1. Acesse **https://portal.sinric.pro** e entre na sua conta (ou crie uma).
2. Menu **Credenciais**:
   - em **"Suas chaves de API"**, copie a **Chave API**;
   - em **"Suas chaves e senhas dos Apps"**, copie a **Chave do App** e a **Senha do App** de uma mesma linha
     (as duas precisam ser da mesma credencial).

## 10.3 Ligar o Sinric ao Clima Casa

1. No painel, abra **Alexa e Google** (menu Integrações).
2. Cole a **Chave de API**, a **Chave do App** e a **Senha do App** e clique em **Salvar credenciais**.
3. Deixe **Ativo** e **Criar automaticamente** ligados.
4. Em até 30 segundos o status fica **"Conectado"**.

## 10.4 Colocar os ares na Alexa

Com **Criar automaticamente** ligado, todo ar cadastrado com "Disponível na Alexa" é criado no Sinric sozinho, e
sai do Sinric quando é removido do Clima Casa.

Para ares que já existiam:

- em **Alexa e Google → Aparelhos ainda fora da Alexa**, clique em **Criar no Sinric**; ou
- no app de celular, abra o aparelho → **Disponibilizar na Alexa**.

Se você criar um dispositivo à mão no portal do Sinric, use o tipo **"Window AC Unit"** e a **mesma Chave do
App** cadastrada no Clima Casa. Depois, em **Dispositivos no Sinric Pro → Carregar**, escolha a qual aparelho ele
corresponde.

## 10.5 Ativar a skill na Alexa (primeira Alexa ou outra Alexa)

Faça isto no celular que tem o app **Amazon Alexa** da conta que vai usar:

1. No painel, abra **Alexa e Google** e escaneie o **QR Code** com o celular (ou abra
   https://www.amazon.com.br/dp/B07ZT5VDT8). Outra opção: app Alexa → **Mais → Skills e jogos** → buscar
   **"Sinric Pro"**.
2. Toque em **Ativar para uso**.
3. Entre com a **conta do Sinric Pro** (a mesma do portal) e autorize.
4. Os aparelhos aparecem sozinhos. Se não aparecerem em 1 minuto, diga **"Alexa, descobrir dispositivos"**.

Quantas contas Alexa quiser podem usar a mesma conta do Sinric: repita estes passos em cada uma. Isso é feito pelo
dono de cada conta Alexa (a Amazon exige a autorização dele).

## 10.6 Comandos de voz

A tela **Comandos de voz** lista todos os comandos possíveis para cada aparelho (com botão de copiar). Exemplos:

- "Alexa, ligar o ar do escritório" / "Alexa, desligar o ar do escritório"
- "Alexa, colocar o ar do escritório em 23 graus"
- "Alexa, aumentar a temperatura do ar do escritório" / "Alexa, diminuir…"
- "Alexa, colocar o ar do escritório no modo frio" (frio, aquecimento ou automático)
- "Alexa, colocar a velocidade do ar do escritório em 2"

## 10.7 Rotinas da Alexa: frases suas

As Rotinas criam comandos com a frase que você quiser:

1. App Alexa → **Mais → Rotinas → +**.
2. **Quando isto acontecer → Voz**: digite a frase (ex.: "boa noite").
3. **Adicionar ação → Casa inteligente →** escolha o ar → ligar, temperatura ou modo. Pode colocar vários ares e
   esperas entre eles.
4. Salve. Agora "Alexa, boa noite" executa tudo.

A Rotina também pode começar por horário, nascer/pôr do sol, chegada ou saída de casa (localização do celular) ou
alarme. Combine com as **Automações** do Clima Casa (ex.: "desligar 3 h depois").

## 10.8 Google Home

App Google Home → **+ → Configurar dispositivo → Funciona com o Google** → buscar **"Sinric Pro"** → entrar com a
mesma conta. Os mesmos aparelhos aparecem.

# 11. Skill própria da Alexa (opcional)

Além do Sinric, o Clima Casa tem uma skill própria, sem limite de dispositivos e com as **cenas** por voz
("Alexa, ativar Dormir"). Ela exige criar a skill no Alexa Developer Console e uma função na AWS (gratuita). O
passo a passo completo está na tela **Skill própria** do painel e no arquivo `alexa/GUIA.md` do projeto.

# 12. Mudança de Wi-Fi e reconfiguração automática

Quando o transmissor muda de rede ou é pareado de novo, o **IP** e a **chave de segurança** mudam. O Clima Casa
percebe e se ajusta sozinho:

1. Você pareia de novo no Smart Life (item 4.4).
2. Em até 2 minutos o agente do Mac:
   - procura o transmissor na rede e grava o **IP novo**;
   - busca a **chave nova** na sua conta Smart Life (precisa do capítulo 5 feito);
   - se o pareamento gerou um ID diferente, passa os aparelhos para o cadastro novo.
3. A tela **Transmissores** mostra "Reconfigurado sozinho" e a **Atividade** registra a mudança.

Quer acelerar? **Transmissores → Reconectar agora**. Se algo impedir, o cartão do transmissor mostra o motivo e o
que fazer. **O Mac precisa estar no mesmo Wi-Fi novo.** Os botões gravados e a Alexa continuam funcionando.

# 13. O agente do Mac

O agente é o programa que fica rodando no Mac. Ele inicia sozinho quando o Mac liga e reinicia se cair.

- **Ver se está funcionando:** no painel, o card **Integrações** mostra "Agente do Mac: executando comandos".
  Em **Configurações → Agente do Mac** aparece online/offline.
- Sem o agente, **nada chega ao ar** (exceto pela nuvem Tuya, quando disponível), a Alexa não responde e a agenda
  e as automações param.
- Para manutenção (Terminal, na pasta do projeto `ar-controle`):

```
./instalar-servico.sh           instala ou atualiza o agente
./instalar-servico.sh status    mostra se está rodando
tail -f ~/Library/Logs/ClimaCasa.log    acompanha o log
```

- Configure o Mac para **não dormir** com a tampa fechada/energia (Ajustes do Sistema → Bateria/Energia →
  impedir repouso automático quando conectado).


## 13.1 Outro computador com o agente (PC Windows do escritório)

1. No painel: **Infra → Agentes → Gerar código de instalação** (só o dono). Vale 30 min e serve uma vez.
2. No PC: PowerShell **como administrador** → cole o comando que o painel mostra. Ele baixa o sistema, instala o Python,
   recebe as chaves cifradas (só o código decifra, no PC) e cria o serviço que liga com o Windows, sem ninguém logado.
3. Rede do Windows como **Privada**.
4. Em **Infra → Agentes**, cada computador mostra quantos transmissores enxerga. **Preferir este** (dono ou admin) escolhe
   quem fica no comando. Quem não enxerga os transmissores passa o comando para quem enxerga; o preferido retoma quando
   volta ao escritório.

Atualizar o PC: gere outro código e rode o mesmo comando. Sem internet no PC: pasta e `.env` por pendrive e
`instalar-windows.ps1`.

# 14. Banco de dados, rotinas e backups

O sistema guarda tudo no **Supabase** e roda **10 rotinas automáticas**: marca transmissores sem sinal, calcula
métricas, cria alertas (ar ligado há 12 h, falhas seguidas), faz **backup diário** (guarda 14), limpa históricos
antigos e mede o espaço usado (limite de 500 MB no plano gratuito).

Na tela **Supabase** você vê cada rotina, a última execução, pode **pausar** ou **rodar agora**, ver o uso do
banco, os alertas, o gráfico e **baixar os backups**. Em **Configurações → Backup** há também o backup na hora.

# 15. Solução de problemas

| Problema | O que fazer |
|---|---|
| O ar não reage ao comando | Confira se o botão daquele ajuste foi gravado; se o transmissor está online; se ele tem visão direta do ar; se o agente do Mac está online |
| "Nenhum botão gravado para o modo…" | Grave pelo menos uma temperatura nesse modo (capítulo 7) |
| A gravação não recebe o sinal | Controle a 10–20 cm do transmissor, pilhas boas, aperte um botão depois que a contagem começar; o Mac precisa estar na mesma rede |
| Transmissor offline | Ele está na tomada? Mesma rede do Mac? Use **Reconectar agora**. Se trocou o Wi-Fi, veja o capítulo 12 |
| Transmissor com aviso "Local Key mudou" | Foi pareado de novo: conecte a conta Smart Life (capítulo 5) e clique em **Reconectar agora** |
| Alexa diz "o dispositivo não está respondendo" | Agente do Mac offline, transmissor offline ou botão não gravado. Veja o painel e a Atividade |
| Aparelho não aparece na Alexa | Ele está "Disponível na Alexa" e criado no Sinric? Diga "Alexa, descobrir dispositivos" |
| Portal do Sinric mostra "signature mismatched" | O dispositivo foi criado com outra credencial: recrie usando a mesma Chave do App do Clima Casa |
| Limite de dispositivos no Sinric | Plano gratuito tem 3. Remova os que não usa ou assine um plano |
| Não consigo baixar os apps | O repositório é privado: entre no GitHub com a conta que tem acesso |
| O painel mostra ligado mas o ar está desligado | Alguém usou o controle original. Envie o comando de novo pelo painel |

# 16. Perguntas frequentes

**Preciso deixar o Mac ligado?** Sim, para os comandos pela rede de casa, a Alexa, a agenda e as automações.

**Funciona fora de casa?** Sim. O painel e os apps funcionam de qualquer lugar; o comando chega ao Mac de casa
pela internet.

**Se eu trocar o roteador, perco tudo?** Não. Pareie os transmissores de novo no Smart Life (com o Mac na nova
rede) e o sistema se ajusta sozinho. Os botões gravados continuam.

**Posso usar o controle original junto?** Pode. Só que o painel não fica sabendo dessas mudanças.

**Quantas pessoas podem usar a Alexa?** Quantas contas Alexa quiserem, cada uma ativando a skill Sinric Pro.

**Quantos ares posso ter?** No Clima Casa, sem limite. Na Alexa pelo Sinric gratuito, 3 dispositivos.

# 17. Referência rápida

| Quero… | Onde |
|---|---|
| Ligar, desligar, mudar temperatura | Painel, Aparelhos ou "Alexa, …" |
| Gravar botões do controle | Aparelho → Botões gravados |
| Desligar daqui a X tempo | Aparelho → Desligar automaticamente |
| Vários comandos com um toque | Cenas |
| Horários fixos | Agenda |
| Regras automáticas | Automações |
| Novo transmissor | Smart Life (4.2) → Transmissores → Importar todos |
| Trocar de Wi-Fi | Smart Life (4.4); o sistema se ajusta (12) |
| Pôr um ar na Alexa | Alexa e Google → Criar no Sinric |
| Conectar outra Alexa | Alexa e Google → QR Code → skill Sinric Pro |
| Ver tudo o que aconteceu | Atividade (com exportação CSV) |
| Baixar os apps | Baixar apps |
| Backups e rotinas | Supabase |
