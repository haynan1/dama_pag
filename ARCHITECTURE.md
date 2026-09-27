# Arquitetura — Dama

Jogo de damas com regras brasileiras (CBJD), jogável na rede local, com um motor de IA próprio
rodando no PC, modo mentor, casos de estudo com repetição espaçada, histórico e progressão.

## Visão geral

```
┌──────────────────────── navegador (PC, celular, tablet na mesma rede) ────────────────────────┐
│  apps/web — React 19 + Vite                                                                    │
│  tabuleiro · mentor · árvore de 3 jogadas · estudos · histórico · progresso                    │
│  usa @dama/engine localmente só para desenhar lances legais e animar (o servidor é quem decide) │
└───────────────┬──────────────────────── HTTP (REST) + WebSocket ───────────────────────────────┘
                │  cookie HttpOnly · mesma origem · CSP estrita
┌───────────────▼───────────────── apps/server — Node 24 + Fastify ─────────────────────────────┐
│  http/     rotas REST, WebSocket, segurança (origem, rate limit, validação zod)                │
│  games/    GameManager + GameSession: estado autoritativo, relógio, IA, mentor, revisões        │
│  progress/ XP, níveis, Elo, conquistas, repetição espaçada                                      │
│  db/       SQLite embutido (node:sqlite), migrações versionadas                                 │
│  ai/       pool de worker_threads ──► @dama/engine (busca síncrona, isolada do event loop)      │
└────────────────────────────────────────────────────────────────────────────────────────────────┘
packages/engine    regras, gerador de lances, busca alfa-beta, avaliação, mentor (zero dependências)
packages/campaign  campanha: fases, juiz de lances, vidas, estrelas, progresso (lógica pura)
packages/protocol  contrato cliente/servidor: tipos (entrada principal) + schemas zod (`/schemas`)
```

## Por que cada escolha

| Camada | Escolha | Por quê |
|---|---|---|
| Linguagem | **TypeScript em tudo** | O mesmo motor roda no servidor (IA, validação) e no navegador (lances legais instantâneos, animação). Um único conjunto de regras testado, zero divergência. |
| Runtime | **Node 24, TypeScript nativo** (type stripping) | Sem etapa de build no servidor: o que está no repositório é o que roda. `erasableSyntaxOnly` garante compatibilidade. |
| Servidor | **Fastify 5** em vez de Flask | O coração do projeto é o motor de busca. Em Python ele seria ~30× mais lento e não seria compartilhável com o navegador. Fastify tem o melhor desempenho entre servidores Node, logs estruturados (pino) e plugins oficiais mantidos para WebSocket, CSP, cookies e rate limit. |
| IA | **Motor próprio** (alfa-beta + PVS + TT + LMR) em `worker_threads` | Damas é um jogo de cálculo exato: um motor de busca joga muito melhor que qualquer LLM local e explica jogadas com fatos verificáveis (material, capturas forçadas, ameaças). As threads mantêm o servidor responsivo; o pool prioriza lance da IA > mentor > revisões. |
| Tempo real | **WebSocket** (`@fastify/websocket`/`ws`) | Relógio, lances e revisões chegam sem polling. Reconexão com backoff e reassinatura automática no cliente. |
| Banco | **SQLite via `node:sqlite`** (WAL) | Aplicação local de um PC: zero serviço extra, zero addon nativo, backup = copiar um arquivo. Consultas de microssegundos; o trabalho pesado está nas threads. |
| Validação | **zod 4** só no servidor | Toda entrada da rede é validada. O zod fica fora do bundle do navegador (`@dama/protocol/schemas`). |
| Front-end | **React 19 + Vite 8**, CSS Modules + tokens | Ecossistema maduro; CSS próprio (sem framework de UI) para uma identidade visual única e controle total de movimento e tipografia. |
| Dados no cliente | **TanStack Query** | Cache e invalidação de histórico/estudos/perfil sem código de sincronização manual. |
| Rotas | **wouter** (2 KB) | Sete rotas simples não justificam um roteador maior. |
| Ícones / fontes | **Phosphor**, fontes via `@fontsource` | Ícones SVG consistentes. Fontes empacotadas: funciona sem internet e sem vazar requisições para terceiros. |
| Qualidade | **Biome** (lint + formato), **Vitest**, TS estrito | Uma ferramenta rápida para lint/format; testes unitários, de integração (HTTP + WebSocket + threads reais) e de componentes. |

## O motor (`packages/engine`)

- **Regras** (`position.ts`): tabuleiro em `Int8Array` só com casas escuras; raios diagonais pré-calculados.
  Captura obrigatória, **lei da maioria** (quantidade), pedras capturam para trás, **damas voadoras**,
  peças capturadas ficam no tabuleiro até o fim do lance (sem salto duplo), pedra que passa pela
  última fileira no meio de uma captura não é promovida, lances duplicados deduplicados.
- **Validação**: perft internacional 10×10 idêntico aos valores publicados (9 → 1.049.442 em
  profundidade 7) — mesmas regras da brasileira, só muda o tabuleiro. ~2,6 M posições/s.
- **Variantes**: brasileira 8×8, internacional 10×10, canadense 12×12. Empates: repetição tripla,
  20 lances só de damas (brasileira) / 25 (demais), regra dos finais curtos.
- **Busca** (`search.ts`): aprofundamento iterativo, PVS, tabela de transposição (Zobrist 53 bits,
  arrays tipados, ~10 MB por thread), killer moves, histórico, LMR, extensão de lance único,
  capturas no horizonte (quiescência natural), multi-PV exato para análise.
- **Avaliação** (`evaluate.ts`): material (dama ≈ 3 pedras), avanço, centro, guarda da base,
  pedras com caminho livre, grande diagonal, escalonamento de finais empatados.
- **Níveis** (`ai.ts`): 10 níveis de ~600 a ~2400 de rating estimado. Níveis baixos sorteiam entre
  lances "quase tão bons" — erram como humanos, não entregam peças absurdamente.
- **Mentor** (`analysis.ts`): classificação de lances (golpe brilhante → erro grave) por perda de
  probabilidade de vitória; explicações geradas só a partir de fatos medidos; dica em dois
  estágios; árvore de 3 jogadas (seus 4 candidatos → 3 respostas → 2 continuações).

## Partida ao vivo (`apps/server/src/games/session.ts`)

- O servidor é a única fonte da verdade: posição, relógio (com incremento), resultado.
- Toda tarefa assíncrona carrega uma **geração**; desfazer ou encerrar invalida resultados antigos.
- Cada lance humano é revisado em segundo plano. No modo mentor a revisão chega ao jogador na hora;
  sem mentor, só no fim (na rede, o adversário nunca vê análise durante a partida).
- **Modo estudo** (contra a IA): pausa o relógio e a IA; desfazer volta até o seu último lance.
  Qualquer ajuda marca a partida como assistida: metade do XP e sem efeito no rating.

## Campanha e app Android

A campanha roda inteira no aparelho — o motor num Web Worker, o progresso no armazenamento local —
e é o mesmo código no app da rede local (`/campanha`) e no app Android (build `VITE_TARGET=app`,
empacotado com Capacitor). Detalhes, monetização e publicação em [ANDROID.md](ANDROID.md).

## Progressão

- **XP e níveis** (30 níveis, 11 títulos), **Elo** contra a IA (sem ajuda) e contra pessoas na rede.
- **21 conquistas** (bronze → platina) avaliadas no fim de cada partida ou estudo.
- **Casos de estudo**: até 5 erros por partida viram estudo automaticamente; qualquer posição pode
  ser salva manualmente. Treino com **repetição espaçada** (SM-2 simplificado): acerto espaça
  (1, 3, ~8 dias…), erro volta em 10 minutos. O motor aceita lances equivalentes ao melhor.

## Segurança

| Ameaça | Defesa |
|---|---|
| Roubo de sessão | Token aleatório de 256 bits em cookie `HttpOnly; SameSite=Strict`. No banco só o SHA-256. |
| CSRF / WebSocket de outro site | Requisições que alteram estado e o handshake do WebSocket exigem `Origin` igual ao `Host` (ou listado em `EXTRA_ORIGINS`). |
| XSS | CSP `default-src 'self'` sem `unsafe-inline`; React escapa conteúdo; nomes validados por regex Unicode. |
| Entrada maliciosa | zod em toda rota e mensagem; limite de corpo 16 KB, mensagem WS 4 KB, FEN com tamanho e alfabeto restritos. |
| Abuso / DoS na LAN | Rate limit global e por rota (perfis 10/h, análise 30/min), balde de fichas por conexão WS, heartbeat, tarefas da IA com tempo máximo e threads substituídas se travarem. |
| Trapaça na rede | Mentor e revisões ao vivo bloqueados em partidas entre pessoas; servidor valida vez, `ply` e legalidade de cada lance. |
| Container | Multi-stage, usuário `node` (não-root), sistema de arquivos somente leitura, `cap_drop: ALL`, `no-new-privileges`, dados em volume nomeado. |

**Sem HTTPS por padrão**: é um app de rede local. Para expor fora da LAN, coloque um proxy com TLS
(Caddy) na frente e defina `EXTRA_ORIGINS` — não exponha a porta diretamente à internet.

## Custo e desempenho

- Custo de operação: **zero** (nada de API externa). Consumo: ~10 MB de RAM por thread da IA.
- Threads: `núcleos − 1`, máximo 8 (`AI_WORKERS`). Lance da IA nível 10: ≤ 5 s; árvore de 3 jogadas:
  ~1–3 s no 8×8, até ~4 s nos tabuleiros maiores; revisão por lance ~1 s em segundo plano.
- Bundle inicial: ~40 KB gzip de app + React (68 KB gzip, chunk separado com cache imutável).
  Páginas carregadas sob demanda.

## Estrutura

```
packages/engine/     src/ (variants, geometry, position, notation, game, evaluate, search, analysis, ai)
                     test/ (regras + perft, busca + mentor)   bench/ (perft, benchmark)
packages/protocol/   src/index.ts (tipos + validações puras)  src/schemas.ts (zod, só servidor)
apps/server/         src/ (main, app, config, http/, games/, ai/, db/, progress/)   test/
apps/web/            src/ (pages/, components/, lib/, styles/)   test/
scripts/             dev.ts (sobe tudo), smoke.ts (teste ponta a ponta contra servidor rodando)
```

## Portas

| Porta | Serviço |
|---|---|
| 5810 | Servidor (HTTP + WebSocket + front-end compilado) |
| 5173 | Vite em desenvolvimento (proxy para 5810) |

## Decisões conscientes

- **Sem `docker-compose.override.yml` de desenvolvimento**: o fluxo de dev é nativo (`npm run dev`,
  com watch no servidor e HMR no Vite) — mais rápido que montar volumes em container no Windows.
  O Docker é o caminho de produção.
- **Sem contas com senha**: perfil local por navegador. Na LAN de casa isso é o equilíbrio certo
  entre segurança e atrito. O token nunca aparece para o JavaScript da página.
- **Sem LLM**: as explicações do mentor vêm de fatos calculados pelo motor. Um modelo de linguagem
  local seria mais lento, exigiria GPU e inventaria análises de damas.
