Você vai continuar o trabalho no sistema Clima Escritório (marca zynio) nesta pasta. Responda sempre em português do Brasil.

Antes de qualquer mudança, leia nesta ordem:
1. `CLAUDE.md` (seções 0 a 2 obrigatórias; regras de ouro: segredos, produção, não inventar, testar antes de entregar, novidades por versão).
2. `docs/continuar/sessao-2026-11-17/00-LEIA-PRIMEIRO.md` e os arquivos 01 a 05 da mesma pasta (histórico, estado atual, pendências, decisões já tomadas e como testar).

Regras desta continuação:
- Não pergunte de novo o que está em `04-decisoes.md`.
- Ação irreversível, mudança no Sinric/Alexa, apagar dados ou mexer em conta de terceiros: mostre a prévia e peça o "sim" do dono.
- Commit só com a checagem de segredos encadeada com `&&`; publicar com `./publicar-vercel.sh` e atualizar o agente com `./instalar-servico.sh`; nova entrada em `backend/app/novidades.json` quando o usuário notar a mudança.
- Diga sempre o que não foi testado.

Comece conferindo o estado real (git status, `/saude` em produção, Infra → Agentes pelo banco, Sinric 9/9) e me diga, em poucas linhas, o que está pronto e qual pendência de `03-pendencias.md` você sugere atacar primeiro. Depois espere a minha resposta.
