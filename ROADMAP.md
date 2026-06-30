# 🗺️ ROADMAP & MELHORIAS FUTURAS — Segundo Cérebro

Este documento centraliza as ideias, visões de longo prazo e sugestões de melhoria para transformar o **Watch Later Agent** em um ecossistema completo de RAG (Retrieval-Augmented Generation) e processamento contínuo.

---

## 🚀 Próximas Features (Curto Prazo)

1. **Transcrição por Áudio (Whisper Fallback)**
   - **O Problema:** Alguns vídeos no YouTube não possuem legenda (closed captions) disponíveis para o `youtube-transcript`.
   - **A Solução:** Quando não houver legenda, baixar o áudio localmente e rodar através da API do Groq usando Whisper (ou OpenAI Whisper). Isso garante taxa de sucesso próxima a 100%.

2. **Novos Comandos no WhatsApp**
   - Atualmente o WhatsApp funciona apenas como um "Receptor" (recebe os resumos diários ou instantâneos).
   - **Melhoria:** O bot também escutará mensagens suas no WhatsApp. 
   - **Caso de uso:** Mandar um link direto pro bot via WhatsApp, e ele responder na hora com o resumo processado do vídeo, sem precisar ir para o Discord ou para a WL.

3. **Publicação Automática (Notion/Obsidian)**
   - O Markdown que é salvo no disco pode ser disparado para ferramentas PKM (Personal Knowledge Management).
   - Sincronização via API para uma base do Notion (taggeando assunto, data e link).

---

## 🧠 Visão de Longo Prazo (Médio/Longo Prazo)

### 1. Construção do Cérebro RAG (Retrieval-Augmented Generation)
Assim que os mais de 3.000 vídeos pendentes forem totalmente consumidos, o volume de conhecimento processado será gigante. 
A ideia é construir um "Chatbot do Segundo Cérebro":
- **Vetorização:** Armazenar cada resumo processado em um banco de dados vetorial (como ChromaDB, Pinecone ou Qdrant).
- **Busca Semântica:** Em vez de procurar por palavras-chave, você poderá fazer perguntas abertas no Discord/WhatsApp.
- **Exemplo de uso:** *"Quais foram as dicas de produtividade e foco que eu salvei na última semana baseada nos meus vídeos curtidos?"*

### 2. Agentes Específicos
- **Criar Agentes Especialistas:** Com todos os dados salvos em RAG, podemos "invocar" sub-agentes. Um Agente especializado em "Economia" (que só lê os vídeos da sua pasta de economia) ou um Agente de "Programação" que consulta seu backlog inteiro de tutoriais antes de te responder.

### 3. Integração com Outras Fontes
- Expandir a ingestão inteligente de `yt-dlp` para outros locais:
  - Links soltos do X (Twitter)
  - Threads e Newsletters.
  - Links do TikTok/Instagram Reels.

---

## 🛠️ Performance e Confiabilidade (Garantias Atuais)

A arquitetura atual foi modelada visando alta estabilidade para listas gigantescas:

- **Fila (Queue) Resiliente:** Com o SQLite, cada vídeo tem o status `pending`, `processing`, `done` ou `failed`. 
- **Sem Travamentos:** O processamento ocorre em série (um a um). Você não tomará _Rate Limit_ brusco do Google Gemini nem do YouTube, pois há _delays_ configurados.
- **Autopilot Conservador:** A rotina do autopilot processa o lote de maneira segura. Os mais de 3000 vídeos estão completamente seguros; levará algum tempo, mas a automação vai rodar silenciosamente dia após dia cortando a fila até chegar a 0.
- **Tolerância a falhas:** Se o YouTube bloquear algo temporariamente, o status vai pra `failed` e você pode apertar o botão "Reprocessar Falhos" no Discord futuramente, sem corromper ou perder o rastreio da WL.

> *"A digestão dos seus 3.000 vídeos será uma maratona contínua. Em breve, a base vetorial fará do seu segundo cérebro uma verdadeira biblioteca interativa."*
