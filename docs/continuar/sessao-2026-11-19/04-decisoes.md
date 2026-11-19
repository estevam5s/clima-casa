# Decisões e armadilhas (não repetir)

- Modelos 3D brutos (`new-blenders/`, `blender/`) ficam fora do git e da Vercel (.gitignore/.vercelignore): 1,5 GB estourou o limite.
- Modelos do Tripo vêm com ~2 milhões de triângulos: sempre reduzir (gltf-transform + meshoptimizer; script no
  scratchpad da sessão) e ter três versões: leve (9 mil, trânsito), média (25 mil, dirigir), completa (biblioteca).
  Separar as rodas de um modelo de 120 mil travava a tela.
- InstancedMesh espalhado pelo andar: `frustumCulled = false` (a esfera calculada errada sumia com os monitores).
- Carro parado com o freio segurado engata a ré: durante a animação de entrar, usar o freio de mão.
- `/api/mapa` devolve `{ mapa: {...} }`: os dados ficam em `.mapa`.
- Dias da agenda: 0 = domingo (como o JavaScript); dias das pessoas do mapa são isoweekday (1 a 7).
- Estrutura Harmonizada: a numeração de 2021 (6.3 mudanças; 10.1 melhoria; 10.2 não conformidade) só confere em
  27001:2022, 42001:2023, 37301:2021. Não perguntar isso para 9001:2015, 14001:2015, 45001:2018.
- Checagem de segredos antes do commit: o padrão `nvapi-` sozinho dá falso positivo no placeholder; o padrão certo
  exige a chave inteira. Encadear com `&&` e conferir que o commit saiu (`git log -1`).
- Sessão paralela pode usar o mesmo número de versão: conferir `novidades.json` antes de numerar.
