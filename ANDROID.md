# App Android — campanha, vidas e monetização

O app da Play Store é a **campanha**: uma trilha de 59 fases, do movimento da pedra até partidas
contra o nível Implacável do motor. Roda **offline**: o motor de busca vive num Web Worker dentro
do app, sem servidor. A internet só é usada para anúncios e compras.

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
| Botão voltar | `platform/back.ts` | Fecha a folha aberta → pede confirmação para sair da fase → volta na trilha → minimiza o app. |

> **AdSense não serve para app Android.** O equivalente do Google para apps é o **AdMob** (mesma conta
> Google, mesmo pagamento). É o que está integrado.

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
   npm run android:sync -w @dama/web   # compila a campanha e copia para o projeto Android
   npm run android:open -w @dama/web   # abre no Android Studio → Build → Generate Signed Bundle (AAB)
   ```
7. **Ícone**: gere os ícones adaptativos em *Android Studio → New → Image Asset* a partir de
   `apps/web/public/icon-512.png` (de preferência uma arte de 1024 px).
8. **Teste interno** na Play antes de produção: compra com conta de teste de licença, anúncio
   recompensado com `VITE_ADS_TESTING=1` num aparelho de QA, retomada de fase após matar o app.
9. **Ficha da loja**: política de privacidade publicada (`VITE_PRIVACY_URL`), formulário de
   *Segurança dos dados* declarando o ID de publicidade (AdMob) e as compras (RevenueCat).

## Desenvolvimento

- `npm run dev` e abra `/campanha`: a campanha inteira roda no navegador, com **anúncio simulado** e
  compras de teste (só em desenvolvimento; no build de produção para web não há anúncio nem loja).
- `VITE_TARGET=app npx vite -w` (em `apps/web`): o app Android no navegador, sem servidor.
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
