# 🛣️ Watch Later Agent — Feature Roadmap

> Ideias de features futuras organizadas por prioridade e impacto.  
> Marque com `[x]` conforme for implementando.

---

## 🔥 Alto Impacto — Fácil de Implementar

| # | Feature | Descrição | Comando | Complexidade |
|:--|:--------|:----------|:--------|:-------------|
| 1 | **Reprocessar** | Re-rodar o LLM em vídeos que já têm transcrição salva, sem extrair de novo. Útil ao mudar prompt ou trocar de modelo. | `/reprocessar <id>` | Baixa |
| 2 | **Pular vídeo** | Marcar um vídeo como `skipped` sem processar. Pra conteúdo que você sabe que não vale a pena. | `/pular <url>` | Baixa |
| 3 | **Notificação proativa** | Ao fazer sync e descobrir vídeos novos, enviar mensagem automática: _"🆕 3 vídeos novos na WL!"_ | Automático | Baixa |
| 4 | **Retry automático** | Vídeos com status `failed` são retentados no próximo `/processar-fila`, com limite de 3 tentativas. | Automático | Baixa |
| 5 | **Estimativa de tempo** | Calcular tempo total de vídeo pendente e mostrar no `/status`: _"⏱️ 14h37m de conteúdo pendente"_ | `/status` | Baixa |

---

## 🧠 Médio Impacto — Enriquece o Segundo Cérebro

| # | Feature | Descrição | Comando | Complexidade |
|:--|:--------|:----------|:--------|:-------------|
| 6 | **Tags automáticas** | LLM categoriza cada vídeo (ex: `#programação`, `#IA`, `#finanças`). Salvar no banco e poder filtrar por tag. | `/fila --tag <tag>` | Média |
| 7 | **Busca semântica** | Buscar nas transcrições salvas no banco. Achar aquele insight que você viu "em algum vídeo". | `/buscar <termo>` | Média |
| 8 | **Resumo semanal** | Cron que toda segunda envia um digest: _"📊 Semana: 12 processados, 47 na fila. Top tags: IA (5), DevOps (3)"_ | Automático (cron) | Média |
| 9 | **Ranking de canais** | Estatísticas por canal: quantos vídeos assistidos, média de insights, canais mais frequentes. | `/canais` | Média |
| 10 | **Resumo em thread** | Ao invés de só mandar o .md, criar uma thread no Discord com embed + preview dos insights inline. | `/processar --thread` | Média |

---

## 🚀 Alto Impacto — Requer mais trabalho

| # | Feature | Descrição | Comando | Complexidade |
|:--|:--------|:----------|:--------|:-------------|
| 11 | **Export Anki `.apkg`** | Parser dos flashcards do .md → gerar deck Anki importável direto, sem precisar converter manualmente. | `/anki <id>` | Alta |
| 12 | **Modo Watch (auto-pilot)** | Scheduler interno (cron) que roda sync a cada 6h e auto-processa vídeos novos sem comando manual. | `/autopilot on/off` | Média-Alta |
| 13 | **Multi-playlist** | Suportar outras playlists além da WL (ex: playlists temáticas, cursos). | `/playlist add <url>` | Alta |
| 14 | **Dashboard web** | Frontend terminal-style (verde no preto) que consome a mesma base SQLite via API REST. Logs ao vivo, gráficos de progresso. | `npm run dashboard` | Alta |
| 15 | **Export Obsidian/Notion** | Integração direta com vault do Obsidian (salvar .md na pasta certa) ou via API do Notion. | `/export obsidian` | Média-Alta |

---

## 🔮 Futuro Distante — Nice to Have

| # | Feature | Descrição | Comando | Complexidade |
|:--|:--------|:----------|:--------|:-------------|
| 16 | **Resumo de canal** | Processar múltiplos vídeos de um canal e gerar um meta-resumo: _"O que este canal ensina no geral"_. | `/canal-resumo <nome>` | Alta |
| 17 | **Comparador de vídeos** | Comparar 2+ resumos e gerar um diff de ideias: onde concordam, onde divergem. | `/comparar <id1> <id2>` | Alta |
| 18 | **Voice summary** | Gerar áudio TTS do resumo pra ouvir no celular/carro (Google TTS ou ElevenLabs). | `/audio <id>` | Alta |
| 19 | **Import de URLs externas** | Processar vídeos que não estão na WL — colar uma URL qualquer no Discord e processar. | `/importar <url>` | Baixa |
| 20 | **Modo podcast** | Suporte a podcasts longos (+1h): dividir em chunks, resumir cada parte, gerar table of contents. | `/podcast <url>` | Alta |
| 21 | **Knowledge graph** | Conectar insights entre vídeos: _"Este conceito apareceu em 3 vídeos diferentes"_. Visualizar como grafo. | `/grafo` | Muito Alta |
| 22 | **API REST local** | Expor endpoints REST para que outros tools/scripts possam consultar o banco e disparar processamento. | `npm run api` | Média |

---

> **💡 Dica:** Comece pelas features 1-5 (alto impacto, baixa complexidade) e vá subindo.  
> A arquitetura atual já suporta todas essas extensões sem refatoração pesada.
