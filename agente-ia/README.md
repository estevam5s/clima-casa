# clima-ia · agente de IA no terminal

Agente de IA do **Clima Escritório** que roda no terminal, no estilo do Claude Code, com modelos da **NVIDIA**
(`integrate.api.nvidia.com`). Conversa em português, conhece o projeto e controla o sistema.

```bash
./agente-ia/instalar.sh              # uma vez (macOS ou Linux)
clima-ia                             # conversa
clima-ia "quais ares estão ligados?" # uma pergunta só
clima-ia --modelo rapido             # ultra (padrão) · rapido · mistral · ou o ID completo do modelo
```

## O que ele faz
| Ferramenta | O que é | Pede confirmação |
|---|---|---|
| `estado_sistema` | computadores do agente (online, principal, transmissores que enxerga), transmissores e todos os ares | não |
| `atividade` | últimos eventos (comandos, falhas) | não |
| `consultar_banco` | SELECT no Postgres para responder perguntas (sem tabelas sensíveis) | não |
| `ler_arquivo`, `listar`, `buscar` | código do projeto | não |
| `comandar_ar`, `desligar_todos`, `executar_cena` | ares e cenas, pelas mesmas funções do painel (origem "ia" na Atividade) | **sim** |
| `editar_arquivo`, `escrever_arquivo` | muda arquivos (mostra a diferença antes) | **sim** |
| `executar_comando` | comando no terminal na raiz do projeto (build, testes, git) | **sim** |

Comandos dentro da conversa: `/ajuda`, `/status`, `/modelo`, `/limpar`, `/salvar`, `/sair`.

Ele começa já sabendo as seções 0 a 2 do `CLAUDE.md` e o estado registrado na última sessão (`docs/continuar/`), e lê o
resto quando precisa.

## Segurança
- **Segredos não saem desta máquina**: todo texto é mascarado antes de ir para a NVIDIA (tokens, chaves, senhas, valores
  cifrados, JWT). Ele não lê `.env`, `docs/credentials` nem chaves, e não sai da pasta do projeto.
- Banco só com `SELECT`, fora de `config`, contas, sessões, OAuth, passkeys e botões IR.
- Comandos com `sudo`, `.env`, apagar disco ou `push --force` são recusados mesmo com confirmação.
- Tudo que muda algo pede **sim** no terminal e fica na Atividade.

## Requisitos
- `.env` da raiz com `NVIDIA_API_KEY` (build.nvidia.com → API Keys) e as chaves do banco (o mesmo `.env` do agente).
- Python 3.13 e `uv`. No Windows: `uv venv .venv --python 3.13`, `uv pip install -r backend\requirements.txt -r agente-ia\requirements.txt`
  e `.venv\Scripts\python agente-ia\clima_ia.py`.

## Modelos
| Atalho | Modelo | Observação |
|---|---|---|
| `ultra` (padrão) | `nvidia/nemotron-3-ultra-550b-a55b` | ferramenta certa em ~1,5 s nos testes |
| `rapido` | `nvidia/nemotron-3.5-lightning-30b-a3b` | mais rápido, para perguntas simples |
| `mistral` | `mistralai/mistral-large-4-1t-a52b` | alternativa (~10 s) |

Outro padrão: `CLIMA_IA_MODELO=<id>` no ambiente.
