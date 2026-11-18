# Avatares 3D (GLB) do mapa do escritório

Módulo para importar, ver e usar personagens 3D de corpo inteiro nas pessoas do mapa (`/avatares` no painel).
Sem avatar importado, cada pessoa continua com o boneco desenhado pelo próprio sistema.

## 1. Arquitetura

| Parte | Arquivo | O que faz |
|---|---|---|
| Biblioteca (backend) | `backend/app/avatares.py` | Envio direto ao Storage, conferência do GLB, link assinado de leitura, apagar |
| Rotas | `backend/app/rotas/api.py` (`/api/avatares…`) | `GET` lista e arquivo (qualquer pessoa logada); importar e apagar só dono/admin |
| Tabela | `avatares` (`supabase/schema.sql`) | nome, descrição, **origem**, **licença**, arquivo, tamanho, estado, `info` (clips, esqueleto, morphs) |
| Arquivos | Supabase Storage, bucket **privado** `avatares` (até 30 MB por arquivo) | O GLB nunca fica público: leitura por link assinado de 10 min |
| Visualizador | `frontend/src/components/avatares/AvatarViewer.jsx` | Corpo inteiro, giro 360°, zoom limitado, luz de estúdio, sombra, crossfade, velocidade, repetir, expressões |
| Página | `frontend/src/pages/Avatares.jsx` | Galeria, busca, importação com progresso, animações, expressões, quem usa no mapa |
| Mapa | `frontend/src/components/Mapa3D.jsx` (`E.glbs`) | Pessoa com `avatar_id` troca o boneco pelo modelo; animação pelo movimento: Parado, Andando, Sentado |

Por que o arquivo vai direto ao Storage: a Vercel aceita no máximo 4,5 MB por pedido. O painel pede um endereço
assinado de envio (`POST /api/avatares/envio`), o navegador envia o `.glb` para lá e depois o servidor confere
(`POST /api/avatares/{id}/confirmar`) lendo só o cabeçalho e o bloco JSON do glTF (pedido com `Range`).

## 2. O que o servidor confere

- É **GLB 2.0** (cabeçalho `glTF`, bloco JSON válido).
- **Sem recursos externos**: buffers e imagens precisam estar dentro do `.glb` (nada por URL).
- **Sem compressão** Draco/Meshopt (exigiria decodificadores extras no navegador).
- Lista **animações** (clips), **esqueleto** (ossos), **malhas**, **materiais** e **morph targets** (expressões).
- Mapeia os clips para os nomes do sistema (`idle`, `walking`, `running`, `sitting`, `typing`, `drinking`, `talking`,
  `waving`, `greeting`, `thinking`, `happy`, `sad`, `surprised`, `pointing`, `listening`) por palavras do nome do clip.
  O que o arquivo não tem fica marcado como indisponível: **nenhuma animação é inventada**.
- Arquivo recusado é apagado do Storage na hora.

## 3. Animações que o mapa usa

| Situação no mapa | Clip procurado (no nome) | Sem o clip |
|---|---|---|
| Parado | idle, stand, breath | primeiro clip do arquivo |
| Andando | walk | usa o "parado" |
| Sentado na mesa | sit, seat | usa o "parado" |

Troca com crossfade de 0,3 s. O mapa decide pela velocidade do personagem (andando acima de ~0,25 m/s).

## 4. Preparar um modelo no Blender (FBX, DAE ou outro → GLB)

1. **Arquivo → Importar** o FBX/DAE. Confira a escala (o sistema reescala para 1,72 m de altura, mas o modelo deve estar em pé no eixo Y/Z certo).
2. Junte as animações no mesmo esqueleto (ações separadas no **Dope Sheet → Action Editor**) com nomes claros: `Idle`, `Walk`, `Sit`, `Wave`…
3. Expressões: use **Shape Keys** com nomes como `Happy`, `Sad`, `Angry`, `Surprised` (viram morph targets).
4. **Arquivo → Exportar → glTF 2.0**: formato **glTF Binary (.glb)**; marque **Animation** (todas as ações), **Shape Keys**,
   **Skinning**; **desmarque** compressão Draco; texturas embutidas.
5. Teste em `/avatares` → Importar. Preencha origem e licença com a verdade.

## 5. Personagens exportados de jogos (ex.: The Sims 4)

Ferramentas de terceiros conseguem exportar personagens de jogos para formatos 3D. **Exportar não dá direito de uso**: os
personagens, roupas e animações continuam protegidos pelos direitos do dono do jogo. Antes de importar um modelo assim:

- confira os termos do jogo e da ferramenta, e tenha **autorização** para usar no seu sistema;
- registre a origem e a licença exatas no formulário (fica visível para quem administra);
- não publique nem redistribua o arquivo (o bucket é privado e o link vale 10 min).

Se não houver autorização, use modelos próprios (feitos no Blender, encomendados) ou com licença aberta.

## 6. Avatar de demonstração

A biblioteca vem com o **Robô (demonstração)**: `RobotExpressive.glb`, exemplo oficial do Three.js de Tomás Laulhé, licença
**CC0 1.0** (domínio público), com 14 animações e 3 expressões. Serve para testar; pode ser apagado em `/avatares`.

## 7. Usar no mapa

Em `/avatares` → **Quem usa no mapa** → **Usar** na pessoa (grava `avatar_id` em `mapa.pessoas`). O mapa troca o boneco na
próxima abertura. Para voltar ao boneco do sistema, clique de novo (fica **Usar**) ou apague o avatar.

## 8. Problemas comuns

| Sintoma | Causa / solução |
|---|---|
| "Não é um arquivo GLB" | exportou .gltf (texto) ou FBX: exporte como **glTF Binary (.glb)** |
| "aponta para arquivos externos" | texturas fora do arquivo: exporte com imagens embutidas |
| "está comprimido (Draco/Meshopt)" | desmarque a compressão na exportação |
| Modelo enorme ou minúsculo | a geometria com ossos vem em cm: o sistema mede já com o esqueleto (`caixaReal`) |
| Fica parado na pose T | o arquivo não tem clip "idle": importe com a animação |
| Não aparece no mapa | a pessoa só aparece no expediente dela (Mapa → Equipe) |
