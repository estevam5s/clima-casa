# Estado no fim da sessão (19/11, noite)

- Produção: app.zynio.com.br na 1.24.0 (saúde 200; rotas novas 401 sem login; HSTS, CSP, X-Frame, nosniff ativos).
- Agente do Mac reinstalado depois de cada publicação. O Mac está fora do escritório: nenhum comando chega aos ares
  até um computador do escritório (ou o Raspberry Pi) ficar ligado como preferido.
- Biblioteca de avatares: ids 19–52 (34 modelos de `new-blenders`), 53–56 (monitor/teclado/mouse/PC leves das mesas),
  57–64 (carros leves do trânsito), 65–72 (carros médios para dirigir). `config.mapa_modelos` aponta para eles.
- `config.mapa_veiculos`: 8 veículos nas ruas (nitro em todos; voo em todos menos moto e ônibus).
- Banco: tabela nova `ia_conversas`; política Realtime em `realtime.messages` para o canal `mapa-escritorio`;
  bucket privado `backups-sistema` (limite 50 MB por arquivo, do plano).
- E-mails: o domínio está certo (SPF/DKIM/DMARC). Gmail e o domínio da Prefeitura recebem na hora; Outlook/Hotmail
  seguram por horas ou mandam para o lixo (reputação de domínio novo). O sistema agora avisa quando atrasa ou volta.
- Spotify: 403 continua até o dono incluir a conta em User Management no developer.spotify.com.
- Bugs: 7, 8 e 9 corrigidos (agente fora do escritório virou notificação, não bug).
