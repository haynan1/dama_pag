# Dama

Damas brasileiras (e internacional 10×10, canadense 12×12) na sua rede local, com um motor de IA
que roda no seu PC, um **mentor** que mostra dicas e mapeia 3 jogadas à frente, **casos de estudo**
gerados a partir dos seus erros, histórico com revisão lance a lance, conquistas e rating.

## Rodar

Requer **Node 24+**.

```bash
npm install
npm run build     # compila o front-end
npm start         # http://localhost:5810 e o endereço da rede local aparece no terminal
```

Outros dispositivos da mesma rede (celular, notebook) abrem o endereço `http://192.168.x.x:5810`
mostrado no terminal. No Windows, permita o Node no firewall para redes privadas na primeira vez.

### Docker

```bash
docker compose up -d --build
```

Os dados ficam no volume `dama-data`.

### Desenvolvimento

```bash
cp .env.example .env   # opcional
npm run hooks          # ativa o pre-commit (lint + tipos)
npm run dev            # servidor com watch (5810) + Vite com HMR (5173)
npm run check          # lint + tipos + testes unitários/integração
npm run e2e            # navegador real (desktop + celular), acessibilidade WCAG AA com axe
npm run bench          # força do motor (profundidade, nós/s, partidas IA × IA)
```

## Como jogar e estudar

- **Contra a IA**: 10 níveis (Aprendiz → Implacável). Ligue o **modo mentor** para dicas em dois
  estágios, árvore de 3 jogadas, **modo estudo** (pausa o relógio e a IA) e desfazer.
- **Na rede**: crie uma sala e passe o código de 6 letras (ou o link) para o adversário.
- **Estudos**: erros viram posições para treinar com repetição espaçada.
- **Análise**: tabuleiro livre para testar ideias com o motor.

Detalhes técnicos e decisões em [ARCHITECTURE.md](ARCHITECTURE.md).
