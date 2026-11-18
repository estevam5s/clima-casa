# Pendências (ordem de prioridade)

## Dependem do dono (pedir o "sim" ou a ação)
1. **Alexa nova**: no app Alexa da conta nova, "Alexa, descobrir dispositivos" e depois "Alexa, ligue o ar do escritório". Confirmar na Atividade (origem `sinric`) ou em Integrações → teste ao vivo. Se não achar nada: desativar e ativar a skill Sinric Pro com a MESMA conta do Sinric que tem os 9 ares.
2. **Raspberry Pi**: gravar o Raspberry Pi OS Lite 64-bit, ligar no Wi-Fi 2,4 GHz do escritório, instalar com o código (Infra → Agentes) e "Preferir este". Teste real em hardware ainda não feito.
3. **Teste de interferência** no salão (Transmissores → Testar interferência) com agente no escritório: grava as zonas reais.
4. **Transmissor C** (Reunião): comprar, parear no Smart Life, importar e vincular ao "Ar da reunião".
5. **Conformidade**: Deison ativar 2FA; dono definir responsável do plano de incidentes e escopo; aprovar os riscos sugeridos; revisar acessos; aprovar e assinar as minutas (Segurança → Conformidade → Documentos) e marcar os controles com a evidência.
6. **Apps**: nova release Android/desktop (ver `CLAUDE.md` §10). Só depois subir `versao_apps.json`.

## Técnicas (posso fazer sem perguntar)
- Relatórios: o Word do modelo Prefeitura tem o cabeçalho com brasão; conferir num Word de verdade (só foi visto pelo QuickLook do macOS).
- Mapa: carros não desviam do avatar na calçada/rua (o avatar anda até 5,2 m fora do pódio); se o dono quiser andar pela cidade, ampliar a grade do térreo e dar colisão com carros.
- Vista da Ilha: relevo é ruído (ilustração); dá para trocar por altitude real (SRTM) se o dono pedir.
- `8.31` (ambientes separados): os testes locais usam o banco de produção. Criar um projeto Supabase de homologação resolveria (custo/decisão do dono).
