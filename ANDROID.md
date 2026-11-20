# App Android — o sistema completo no celular

O app é o Dama inteiro, **offline**: partidas contra a IA (10 níveis) com mentor, campanha de 59 fases,
estudos com repetição espaçada, análise livre, histórico com revisão lance a lance e progresso. A
internet só é usada para anúncios e compras. Jogar **com outra pessoa** é a única coisa que pede um
computador: o app se conecta ao servidor Dama da mesma Wi-Fi (**Jogar com outra pessoa**, na tela inicial).

## O servidor dentro do app

O app roda o **próprio servidor do Dama** no aparelho — não uma versão paralela. Num Web Worker:

| Peça | No servidor (PC) | No app | Compartilhado |
|---|---|---|---|
| Rotas da API | Fastify | Roteador mínimo em `apps/server/src/embedded.ts` | `http/routes/*` (as mesmas funções) |
| Partidas ao vivo | WebSocket | `postMessage` (`src/local/client.ts` imita o WebSocket) | `games/*`, `http/ws.ts#dispatchClientMessage` |
| Banco | `node:sqlite` | SQLite WebAssembly persistido no OPFS (`src/local/wasm-database.ts`) | migrações e repositórios (`db/sql.ts`) |
| IA | `worker_threads` | Web Workers (1–2 no celular) | fila e prioridades (`ai/runner.ts`), `ai/tasks.ts` |
| Erros | `setErrorHandler` | `handle()` | `http/errors.ts` (mesma tabela) |

- **Troca no build, não em tempo de execução**: o alias `@dama/transport` (vite.config) aponta para o
  servidor da rede (`src/lib/transport.ts`) ou para o embutido (`src/local/transport.ts`). Nenhuma tela
  sabe a diferença, e o bundle do navegador não leva SQLite nem workers do servidor.
- **Testado dos dois lados**: `apps/server/test/embedded.test.ts` roda o servidor embutido com o banco e a
  IA do Node (partida completa, mentor, estudos, análise, PDN, erros); `apps/web/test/wasm-database.test.ts`
  roda as migrações e rotas no SQLite WebAssembly.
- **Sessão**: um perfil por aparelho. O token fica no próprio banco (`embedded_session`), ao lado do perfil.
- **Sem OPFS** (WebView muito antiga): o app funciona com banco em memória e avisa que nada será salvo.
- **PDN**: a WebView não baixa arquivos; no app o botão copia o PDN para a área de transferência.

### Dois tipos de página dentro da WebView

A WebView do app mostra duas coisas diferentes, e o código precisa distinguir as duas:

| Página | Build | Como saber | Campanha no menu |
|---|---|---|---|
| A interface do próprio app (`https://localhost`) | `--mode app` (`TARGET === 'app'`) | `TARGET` | Rota interna `/campanha` |
| Uma página do servidor da rede local (`http://192.168.x.x:5810`) | build web (`TARGET === 'web'`) | marca `DamaApp/1` no user agent | Link para `https://localhost/campanha` (a do aparelho) |

**O user agent sozinho não basta**: as duas páginas têm a marca `DamaApp/1`. Já houve um APK em que o
item **Campanha** levava para a tela inicial porque a regra olhava só o user agent. A decisão fica em
`deviceCampaignUrl()` (`src/platform/runtime.ts`), com os três casos em `apps/web/test/lan.test.ts`.

## Como funciona

| Peça | Onde | Decisão |
|---|---|---|
| Regras da campanha (fases, vidas, estrelas, desbloqueio) | `packages/campaign` | Lógica pura, sem I/O, 100% testada. Cada exercício é **resolvido pelo motor em teste**: fase sem solução não passa no CI. |
| Juiz dos lances | `packages/campaign/src/goals.ts` | Nada de "resposta decorada": o lance é aceito se vale tanto quanto o melhor do motor (margem de 0,4 pedra). A busca é limitada por profundidade, então o veredito é igual em qualquer aparelho. |
| Motor no aparelho | `apps/web/src/campaign/engine/` | Web Worker dedicado (a interface nunca trava), tabela de transposição de ~2,5 MB, reinício automático se travar. |
| Progresso | `apps/web/src/campaign/store.ts` | Preferences (SharedPreferences) no Android — o sistema não descarta, ao contrário do localStorage da WebView. Entra no backup automático do Google. Leitura defensiva: save corrompido ou adulterado nunca trava o app. |
| Vidas | `packages/campaign/src/lives.ts` | 3 vidas, 1 volta por hora. **Descontada ao entrar e devolvida ao concluir**: fechar o app numa fase perdida não salva a vida. Relógio do aparelho voltando no tempo não gera vidas. |
| Retomada | `useLevelSession.ts` | A fase em andamento é salva a cada lance. Se o Android encerrar o app em segundo plano, ela continua de onde parou. |
| Anúncios | `apps/web/src/platform/ads.ts` | AdMob. Consentimento (UMP/LGPD/GDPR) antes de qualquer pedido. Recompensado só por escolha do jogador (+1 vida, até 5 por dia). Intersticial nunca no tutorial nem no meio de uma fase: no máximo a cada 3 fases e 4 minutos, e nunca para quem tem o Pro. |
| Compras | `apps/web/src/platform/billing.ts` | Google Play Billing via **RevenueCat**: o app não tem servidor, e compra validada só no aparelho é falsificável. A RevenueCat valida o recibo com o Google, reconhece a compra no prazo (sem isso a Play estorna em 3 dias) e trata Pix/boleto pendentes. |
| Tela cheia | `MainActivity.java` | Imersiva no nativo (barras do sistema escondidas, voltam com um deslize). A Fullscreen API da WebView não controla as barras do sistema. |
| Botão voltar | `platform/back.ts`, `platform/native-app.ts` | Fecha a folha aberta → pede confirmação para sair da fase → volta no histórico → na raiz, minimiza o app. |
| Rede local | `platform/lan.ts`, `campaign/ui/Lan.tsx`, `LanNavigationPlugin.java` | Ver abaixo. |

## Jogar com outra pessoa (rede local)

Para partidas entre aparelhos, o app **navega até a origem do servidor** (`http://192.168.x.x:5810`) na própria WebView, em vez de
chamar a API de longe. Assim nada muda no servidor: cookie de sessão `SameSite=Strict`, CSP `'self'`
e checagem de `Origin` continuam valendo exatamente como no navegador.

| Decisão | Por quê |
|---|---|
| Endereço conferido antes de sair (`GET /api/meta` pelo HTTP nativo) | IP errado vira mensagem clara na folha, não a página de erro da WebView. Pelo `fetch` seria conteúdo misto (app em https://localhost) e o servidor não libera CORS — de propósito. |
| Só IPv4 privado (10/8, 172.16/12, 192.168/16) e `*.local` | Mesmas faixas que o servidor anuncia. Validado no JS (`isLanHost`) e de novo no nativo (`LanHosts.java`), com testes dos dois lados. |
| Navegação liberada por plugin nativo, **não** por `server.allowNavigation` | Curingas como `192.168.*.*` não são regras de origem válidas para a ponte; o Capacitor então cai em `addJavascriptInterface`, que expõe a ponte nativa (compras, anúncios) a **qualquer** página — inclusive às do servidor. Com o plugin, a ponte continua restrita a `https://localhost`. |
| HTTP em claro liberado (`network_security_config.xml`) | Não há certificado para IP privado, e o Android não restringe tráfego em claro por faixa de IP. A restrição real é a da navegação, acima. |
| Marca `DamaApp/1` no user agent | As páginas do servidor não recebem a ponte; é por ela que sabem que estão no app. Nelas, o item **Campanha** do menu volta para a campanha do aparelho (`https://localhost/campanha`) em vez de abrir uma segunda campanha no servidor — ver *Dois tipos de página*, acima. |
| `server.errorPath` → `/rede-local?falha=1` | Se o servidor cair ou o Wi-Fi mudar, o app volta para a folha de rede local com o aviso, e não para a tela de erro crua. |
| Voltar | Na tela inicial do servidor, o botão voltar do Android retorna ao app (histórico da WebView). |

No computador: `npm run build && npm start` (o servidor escuta em `0.0.0.0:5810`). O endereço aparece
na tela inicial do Dama. No Windows, permita o Node.js em **redes privadas** quando o firewall perguntar.

> **AdSense não serve para app Android.** O equivalente do Google para apps é o **AdMob** (mesma conta
> Google, mesmo pagamento). É o que está integrado.

## Ícone e tela de abertura

Tudo sai de uma geometria só, em `apps/web/scripts/brand-icons.mjs`: a peça de latão com a coroa da
dama gravada, sobre obsidiana com luz quente de cima — as cores da interface (`--brass`, `#0a0a0b`).

| Arquivo | Para quê |
|---|---|
| `res/drawable/ic_launcher_{background,foreground}.xml` | Ícone adaptativo (Android 8+), em vetor: nítido em qualquer densidade e em qualquer máscara (círculo, gota, quadrado). A peça fica no círculo central de 66 dp, que nenhuma máscara corta. |
| `res/drawable/ic_launcher_monochrome.xml` | Ícone temático do Android 13+ (contorno da peça + coroa, pintados pelo sistema). |
| `res/mipmap-*/ic_launcher{,_round}.png` | Android 7 (API 24–25), que não tem ícone adaptativo. |
| `res/values/styles.xml` (`windowSplashScreenAnimatedIcon`) | Tela de abertura: a mesma peça sobre obsidiana, sem clarão branco. |
| `public/favicon.svg`, `icon-192.png`, `icon-512.png`, `apple-touch-icon.png` | Navegador e PWA. Os PNGs da web são *maskable* (peça dentro dos 80% centrais). |

Para mudar o ícone, edite a geometria no script e rode `npm run icons -w @dama/web`. Os PNGs são
rasterizados pelo Chromium do Playwright, o mesmo dos testes E2E. Não edite os arquivos gerados à
mão: eles dizem isso no cabeçalho. Ícone da Play Store (512 px): `apps/web/public/icon-512.png`.

## Produtos

| ID na Play Console | Tipo | O que faz |
|---|---|---|
| `vidas_recarga` | Produto no app, **consumível** | Enche as vidas na hora. |
| `dama_pro` | Produto no app, **não consumível** | Vidas infinitas e sem intersticiais, para sempre. Libera o entitlement `pro`. |

## Passo a passo para publicar

1. **Play Console**: crie o app (pacote `app.dama.campanha` — trocar depois é impossível; se quiser
   outro, mude `appId` em `apps/web/capacitor.config.ts` e o `namespace`/`applicationId` em
   `android/app/build.gradle` **antes** do primeiro envio). Em *Público-alvo*, marque 13+ para não
   cair nas regras do programa Famílias.
2. **Produtos**: crie `vidas_recarga` e `dama_pro` em *Monetizar → Produtos no app* e defina os preços.
3. **RevenueCat**: crie o projeto, conecte o app Google Play (conta de serviço com acesso financeiro),
   importe os dois produtos, crie o entitlement `pro` ligado a `dama_pro` e uma *offering* atual com
   os dois pacotes. Copie a chave pública `goog_...`.
4. **AdMob**: crie o app, um bloco *Premiado* e um *Intersticial*. Em *Privacidade e mensagens*,
   publique a mensagem de consentimento GDPR (e a de estados dos EUA). Guarde o **ID do app**
   (`ca-app-pub-...~...`) e os IDs dos blocos.
5. **Configuração local** (fora do git):
   - `apps/web/.env.app.local` a partir de `apps/web/.env.app.example`.
   - `~/.gradle/gradle.properties`:
     ```properties
     DAMA_ADMOB_APP_ID=ca-app-pub-XXXXXXXXXXXXXXXX~XXXXXXXXXX
     DAMA_VERSION_CODE=1
     DAMA_VERSION_NAME=1.0.0
     DAMA_KEYSTORE=C:/caminho/upload.jks
     DAMA_KEYSTORE_PASSWORD=...
     DAMA_KEY_ALIAS=upload
     DAMA_KEY_PASSWORD=...
     ```
   - Chave de upload: `keytool -genkeypair -v -keystore upload.jks -keyalg RSA -keysize 4096 -validity 10000 -alias upload`.
     Guarde-a fora do repositório e com backup; ative a *Assinatura de apps do Google Play*.
6. **Build**:
   ```bash
   npm run android:sync -w @dama/web   # compila o app e copia para o projeto Android
   npm run android:open -w @dama/web   # abre no Android Studio → Build → Generate Signed Bundle (AAB)
   ```
7. **Ícone**: já está no projeto (ver *Ícone e tela de abertura*). Na ficha da loja, use
   `apps/web/public/icon-512.png`.
8. **Teste interno** na Play antes de produção: compra com conta de teste de licença, anúncio
   recompensado com `VITE_ADS_TESTING=1` num aparelho de QA, retomada de fase após matar o app.
9. **Ficha da loja**: política de privacidade publicada (`VITE_PRIVACY_URL`), formulário de
   *Segurança dos dados* declarando o ID de publicidade (AdMob) e as compras (RevenueCat).

## Gerar um APK para instalar direto no celular

Sem Android Studio — só JDK 21 e Android SDK (platform 36, build-tools 36):

```bash
npm run android:sync -w @dama/web
cd apps/web/android && ./gradlew testDebugUnitTest assembleDebug
```

O APK sai em `apps/web/android/app/build/outputs/apk/debug/app-debug.apk`. No celular, abra o arquivo e
permita *instalar apps desconhecidos* para o app que o abriu (Arquivos, Drive, WhatsApp…). Esse APK é
assinado com a chave de depuração: serve para uso pessoal e testes, **não** para a Play Store, e não
atualiza uma versão instalada pela loja (assinaturas diferentes) — para a loja, siga o passo 6 acima.

Um APK novo de depuração instala **por cima** do anterior (mesma chave de depuração deste computador),
e as partidas, estudos e a campanha continuam. Se o Android recusar ("pacote em conflito"), desinstale o
antigo antes; isso apaga o progresso do aparelho.

O ícone novo pode demorar para aparecer na tela inicial: alguns launchers guardam o antigo em cache até
reiniciar o celular ou remover e pôr de novo o atalho.

### Conferir antes de entregar um APK

Os testes cobrem a lógica; isto cobre o que só se vê no aparelho:

1. Abre na peça sobre fundo escuro (sem tela branca) e cai na criação de perfil ou na tela inicial.
2. **Jogar**: uma partida contra a IA anda, e o mentor responde.
3. **Campanha** (aba): abre a trilha, entra numa fase, faz um lance; o botão voltar pede confirmação.
4. **Estudos**, **Histórico** e **Progresso** abrem; fechar e reabrir o app mantém a partida no histórico.
5. **Jogar com outra pessoa**: com o servidor do PC ligado, conecta; na página do servidor, o item
   **Campanha** volta para a campanha do aparelho.
6. Ícone na tela inicial e no seletor de apps; no Android 13+, com *ícones temáticos* ligados, o
   monocromático.

## Desenvolvimento

- `npm run dev` e abra `/campanha`: a campanha inteira roda no navegador, com **anúncio simulado** e
  compras de teste (só em desenvolvimento; no build de produção para web não há anúncio nem loja).
- `npx vite --mode app` (em `apps/web`): o app Android no navegador, com o servidor embutido e sem o
  servidor Node. É o jeito mais rápido de testar uma mudança do app antes de gerar o APK.
- `npm run icons -w @dama/web`: regenera ícone e tela de abertura (ver acima).
- Novas fases: `node packages/campaign/scripts/mine.ts 250 11 > mine.json`, depois
  `node packages/campaign/scripts/curate.ts mine.json` e `scripts/inspect.ts` para revisar uma posição.
  Toda fase nova precisa passar em `test/levels.test.ts`. **Nunca renomeie o id de uma fase publicada**
  (é a chave do progresso salvo).

## Limites conhecidos

- **Vidas e estrelas ficam no aparelho.** Quem mexe no relógio consegue acelerar a recarga (mitigado,
  não eliminado) — o mesmo trade-off de jogos casuais offline. Sincronização em nuvem (Play Games
  Services ou conta própria) é o próximo passo se o ranking ou a troca de aparelho virarem requisito.
- **Recompensa do anúncio é concedida no aparelho.** Verificação no servidor (SSV do AdMob) exige um
  backend; para uma vida grátis por anúncio, o risco não compensa o custo agora.
- O build de release roda sem R8 (`minifyEnabled false`, padrão do Capacitor): ligar exige regras de
  ProGuard para os plugins, validadas num aparelho.
