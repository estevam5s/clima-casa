# Raspberry Pi como agente do Clima Escritório

Guia de uso do Raspberry Pi que fica ligado no escritório e manda os comandos para os ares. Escrito em 22/11/2026, com
o primeiro Raspberry instalado de verdade (Pi 3 Model B, Raspberry Pi OS Lite 64-bit, Debian 13 "trixie").

> Resumo: ligue na tomada com uma fonte boa, conecte **na mesma rede dos transmissores** (cabo ou Wi-Fi), espere ele
> aparecer em **Infra → Agentes** com "enxerga 2 de 2" e clique em **Preferir este**.

---

## 1. O que ele faz

- Roda o **agente**: o programa que fala com os transmissores Smart IR (SRW-004) pela rede local e manda o sinal
  infravermelho para os ares. Sem um agente no escritório, nenhum comando chega aos ares (painel, Alexa, agenda).
- Fica ligado 24 h gastando pouca energia, sem depender de alguém deixar um PC ligado.
- Pode haver vários agentes (Mac, PC, Raspberry). Só um manda (o **principal**); os outros ficam de **reserva** e
  assumem em até 45 s se o principal sumir. Quem **não enxerga os transmissores** nunca fica no comando.

Arduino, ESP32 e ESP8266 **não** rodam o agente (ele precisa de Linux, Windows ou macOS de 64 bits).

## 2. O que precisa

| Item | Detalhe |
|---|---|
| Raspberry Pi | 3B, 3B+, 4 ou 5. Sistema **de 64 bits** (o de 32 bits não funciona) |
| Fonte | **A oficial do modelo**: Pi 3B = 5 V **2,5 A**; Pi 4 = 5,1 V 3 A (USB-C); Pi 5 = 5,1 V 5 A. Fonte de celular dá "Undervoltage detected" e pode corromper o cartão |
| Cartão microSD | 16 GB ou mais, de boa marca (classe A1) |
| Rede | Cabo de rede (recomendado) ou Wi-Fi 2,4 GHz, **na mesma rede dos transmissores** |

## 3. Acesso

- Usuário: **`clima`**.
- **SSH só com a chave** do Mac do dono (`~/.ssh/clima-agente`). Senha não entra pelo SSH.
  ```
  ssh -i ~/.ssh/clima-agente clima@clima-agente.local
  ```
  Se `clima-agente.local` não responder (redes corporativas costumam bloquear esse tipo de nome), use o IP, que
  aparece no próprio monitor do Raspberry na linha **"My IP address is …"**.
- **Teclado e monitor**: entram com `clima` e a senha criada pelo dono (a senha não está anotada em lugar nenhum do
  projeto). Para criar ou trocar a senha, pelo Mac:
  ```
  ssh -t -i ~/.ssh/clima-agente clima@<IP> sudo passwd clima
  ```
- O usuário `clima` é administrador (`sudo` sem senha) e lê as chaves do sistema: trate o Raspberry como um cofre.

## 4. Levar para a rede da prefeitura

### Opção A: cabo de rede (recomendado)

**Só plugar.** O Raspberry pega o endereço sozinho (DHCP) e o agente volta a falar com o painel em 1 a 2 minutos. Não
precisa configurar nada.

Confira com a TI se a tomada de rede está na **mesma rede (VLAN) dos transmissores**. Em muitas prefeituras o cabo é
uma rede e o Wi-Fi é outra: o Raspberry no cabo fala com a internet, mas não alcança os transmissores no Wi-Fi.
O painel mostra isso em Infra → Agentes ("enxerga 0 de 2").

### Opção B: Wi-Fi

O Wi-Fi gravado no cartão é o da rede onde ele foi preparado. Na prefeitura, cadastre a rede nova uma vez. Ela fica
salva e ele reconecta sozinho depois de reiniciar.

**Pelo teclado e monitor** (ou por SSH, ainda no cabo), com o menu de rede:
```
sudo nmtui
```
1. **Activate a connection** → escolha a rede da prefeitura → digite a senha → **Activate**.
2. Use a rede **2,4 GHz** (a mesma dos transmissores). Se a rede tiver só 5 GHz, o Pi 3B nem a enxerga.
3. **Back → Quit**. Confira o IP novo com `hostname -I`.

**Por comando** (troque o nome e a senha, mantendo as aspas):
```
sudo nmcli device wifi connect "NOME-DA-REDE" password "SENHA-DA-REDE"
```

**Rede com login por usuário e senha (WPA2-Enterprise / 802.1X, comum em órgãos públicos):** no `sudo nmtui`, em
**Edit a connection → Add → Wi-Fi**, escolha Security **WPA & WPA2 Enterprise**, método **PEAP**, autenticação interna
**MSCHAPv2**, e informe o usuário e a senha que a TI fornecer.

**Rede com página de login no navegador (portal cativo):** não funciona para o Raspberry (ele não tem navegador).
Peça à TI uma liberação pelo endereço MAC (veja abaixo) ou use o cabo.

### O que pedir à TI da prefeitura

| Pedido | Por quê |
|---|---|
| Saída **TCP 443 (HTTPS)** para `app.zynio.com.br`, `*.supabase.co`, `api.sinric.pro`, `openapi.tuyaus.com` | painel, Alexa e nuvem Tuya |
| Saída **TCP 6543** para `*.pooler.supabase.com` | é o banco de dados. Sem ela o agente não funciona. É o bloqueio mais comum |
| **Sem inspeção SSL** para `zynio.com.br` e `supabase.co` | firewalls como o FortiGate trocam o certificado e o agente recusa a conexão |
| Raspberry e transmissores **na mesma rede/VLAN**, com TCP 6668 e UDP 6666/6667 livres entre eles | é por onde o sinal vai ao transmissor |
| (Se exigido) cadastro do **endereço MAC** | veja abaixo como descobrir |

Endereços MAC (cabo e Wi-Fi):
```
ip -br link | grep -E "eth0|wlan0"
```

## 5. Conferir se está funcionando

**No painel** (o jeito mais fácil): **Infra → Agentes**, cartão **clima-agente**:
- "visto agora" = está conectado ao sistema;
- "enxerga N de M transmissores": precisa ser maior que 0 para mandar nos ares;
- modelo, IP, temperatura, memória e disco;
- **Preferir este**: deixa ele no comando sempre que estiver ligado e enxergando os transmissores;
- **Reiniciar agente**: funciona de qualquer lugar, sem SSH.

**No Raspberry** (teclado ou SSH):

| Para… | Comando |
|---|---|
| Ver se o agente está rodando (deve dizer `active (running)`; **q** sai) | `systemctl status clima-escritorio-agente` |
| Ver o registro ao vivo (Ctrl+C sai) | `journalctl -u clima-escritorio-agente -f` |
| Reiniciar o agente | `sudo systemctl restart clima-escritorio-agente` |
| Ver o IP | `hostname -I` |
| Ver em qual rede está | `nmcli -t -f DEVICE,STATE,CONNECTION device` |
| Testar o painel | `curl -s -o /dev/null -w "%{http_code}\n" https://app.zynio.com.br/saude` (200 = ok) |
| Testar a porta do banco | `timeout 8 bash -c "</dev/tcp/aws-1-us-east-2.pooler.supabase.com/6543" && echo ok \|\| echo bloqueado` |
| Temperatura (dividir por 1000) | `cat /sys/class/thermal/thermal_zone0/temp` |
| Desligar com segurança | `sudo poweroff` (espere o LED verde parar antes de tirar da tomada) |

Dica: digite o começo do nome e aperte **Tab** para completar (`systemctl status clima-esc` + Tab).

## 6. Atualizar o agente

Depois de uma versão nova do sistema, o Raspberry continua com o código antigo até ser atualizado. Duas formas:

1. **Pelo painel** (sem SSH): Infra → Agentes → **Gerar código de instalação** → aba **Raspberry Pi** → copie o comando
   e rode no Raspberry (teclado ou SSH). O mesmo comando instala e atualiza.
2. **Pelo Mac na mesma rede**, com o código do repositório:
   ```
   cd ~/Documents/projeto-deison/ar-controle
   git archive --format=tar HEAD backend requirements.txt instalar-linux.sh | gzip > /tmp/codigo.tar.gz
   scp -i ~/.ssh/clima-agente /tmp/codigo.tar.gz clima@<IP>:/tmp/
   ssh -i ~/.ssh/clima-agente clima@<IP> 'cd /opt/clima-escritorio/ar-controle && sudo tar -xzf /tmp/codigo.tar.gz && sudo ./instalar-linux.sh'
   ```

## 7. Problemas comuns

| Sintoma | O que fazer |
|---|---|
| **"Undervoltage detected!"** na tela | Fonte fraca. Troque pela oficial (Pi 3B: 5 V 2,5 A) e use cabo curto. Periféricos (teclado) pioram |
| **"Failed to start cloud-final.service"** no primeiro boot | A instalação automática rodou antes de a rede ficar pronta. Desde 22/11 o cartão novo tenta de novo a cada minuto; num cartão antigo, rode a atualização (seção 6) |
| `sudo: unable to resolve host clima-agente` | Aviso inofensivo. Corrige com `echo "127.0.1.1 clima-agente" \| sudo tee -a /etc/hosts` |
| "Login incorrect" no teclado | Senha errada, ou a senha ainda não foi criada (seção 3) |
| `Unit … could not be found` | Nome digitado errado: é `clima-escritorio-agente` (com **e** no fim) |
| Painel mostra "enxerga 0 de N" | Fora da rede dos transmissores ou VLAN diferente (seção 4). Em casa é o esperado |
| Não aparece em Infra → Agentes | Sem internet ou porta 6543 bloqueada: teste com os comandos da seção 5 |
| Relógio errado depois de ficar sem energia | O Pi não tem bateria de relógio; com internet ele acerta sozinho em segundos (`timedatectl` mostra `synchronized: yes`) |

## 8. Tirar o agente (teste ou troca de computador)

```
cd /opt/clima-escritorio/ar-controle && sudo ./instalar-linux.sh remover
```
Depois, com ele desligado, **Infra → Agentes → Tirar da lista**. Se o Raspberry for doado ou descartado, **apague o
cartão** e troque as chaves do sistema: o arquivo `.env` dele tem todas.

## 9. Preparar um cartão novo (do zero)

No Mac do dono, com o microSD no leitor (ele é apagado inteiro):
```
cd ~/Documents/projeto-deison/ar-controle && ./scripts/preparar-cartao-raspberry.sh
```
O script pede o disco do cartão, a palavra APAGAR, o nome e a senha do Wi-Fi (Enter vazio = só cabo) e a senha do Mac.
No primeiro boot o Raspberry entra na rede, espera a internet, o DNS e o relógio, e instala o agente sozinho (10 a
20 minutos no Pi 3B). Acompanhar: `ssh … "sudo tail -f /var/log/clima-primeiro-boot.log"`.

Até ser ligado, o cartão carrega as chaves do sistema: se ele se perder antes disso, as chaves precisam ser trocadas.
