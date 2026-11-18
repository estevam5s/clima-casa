# Decisões já tomadas pelo dono (não perguntar de novo)

- CAPTCHA do Supabase Auth: **ligado** (17/11). Efeito: login por senha do app Android antigo para (Google continua).
- Vercel: apagar publicações antigas e **reter 7 dias** (feito).
- Os 6 ares do Escritório ficam **na Alexa, um dispositivo por ar**, cada um na sala do Sinric com o nome do projeto (mesmo sendo zona).
- 5 ares religados ao transmissor do Escritório.
- Transmissor **B = "Smart IR · Fabio e Devs"** atende Ar do Fabio e Ar dos devs; **Reunião sem transmissor** até o C.
- Relatórios: modelo da **Prefeitura** é o padrão (brasão e cabeçalho oficial); "Moderno" fica como opção.

# Regras físicas (explicar, não "consertar")
- Infravermelho só vai num sentido e o SRW-004 não tem sensor: o sistema não sabe quando usam o controle remoto (há o botão "Ligaram ou mudaram pelo controle?").
- Ares iguais à vista do mesmo transmissor obedecem juntos (zona). Gravar os botões de novo **não** separa; só um transmissor dedicado, perto e virado só para aquele ar.
- Gravar botão e mandar comando só funcionam com um agente **na rede do escritório** enxergando o transmissor.
- Redes com Fortinet (inspeção SSL) bloqueiam o banco (5432/6543) e trocam o certificado de zynio.com.br: o agente não roda lá.
- Raspberry Pi: só sistema **64 bits**. Arduino, ESP32 e ESP8266 não rodam o agente.
