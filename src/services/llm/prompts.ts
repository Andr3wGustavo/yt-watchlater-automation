import type { VideoMetadata } from '../../types/index.js';
import { getConfig } from '../../config/env.js';

/**
 * Prompt principal de síntese de conhecimento.
 * Gera um Markdown estruturado a partir da transcrição de um vídeo.
 */
export function getSynthesisPrompt(transcript: string, metadata: VideoMetadata): string {
  let language: string;
  try {
    language = getConfig().SUMMARY_LANGUAGE;
  } catch {
    language = 'pt-BR';
  }

  const langInstruction = language === 'pt-BR'
    ? 'Escreva TODO o conteúdo em Português Brasileiro.'
    : language === 'en'
      ? 'Write ALL content in English.'
      : 'Write the content in the same language as the transcript.';

  return `
Você é um assistente de síntese de conhecimento. Sua tarefa é analisar a transcrição de um vídeo do YouTube e gerar um documento Markdown estruturado que capture a essência do conteúdo.

${langInstruction}

## Informações do Vídeo
- **Título:** ${metadata.title}
- **Canal:** ${metadata.channelName}
- **Duração:** ${metadata.duration || 'N/A'}
- **Link:** ${metadata.url}

## Regras Estritas
1. NÃO invente informações que não estão na transcrição.
2. NÃO repita o título do vídeo no conteúdo dos insights.
3. Seja conciso e direto. Cada insight deve ser acionável ou informativo.
4. Use bullet points (-) para listas, não números.
5. O Plano de Ação deve conter ações CONCRETAS que o espectador pode executar.
6. Gere entre 2 e 5 flashcards no formato Q&A para revisão futura (estilo Anki).

## Formato Obrigatório do Output

\`\`\`markdown
# 📺 {Título do Vídeo}

## 🧠 Insights Principais
- Insight 1: descrição concisa
- Insight 2: descrição concisa
- (3-7 insights)

## 🎯 Plano de Ação
- [ ] Ação concreta 1
- [ ] Ação concreta 2
- (2-5 ações)

## 💡 Resumo Executivo
Parágrafo de 2-4 frases resumindo o conteúdo principal do vídeo.

## 🃏 Flashcards
**P:** Pergunta 1
**R:** Resposta 1

**P:** Pergunta 2
**R:** Resposta 2

## 🏷️ Tags
- #tag1, #tag2, #tag3 (3 a 5 tags categorizando o conteúdo)

## 📋 Metadados
| Campo | Valor |
|:---|:---|
| Canal | ${metadata.channelName} |
| Duração | ${metadata.duration || 'N/A'} |
| Link | ${metadata.url} |
| Processado em | {data atual} |
\`\`\`

## Transcrição do Vídeo
${transcript}
`.trim();
}

/**
 * Prompt dedicado para Shorts (vídeos ≤ 60s).
 * Gera um mini-resumo compacto: ideia principal + bullets + links relacionados.
 */
export function getShortsSynthesisPrompt(transcript: string, metadata: VideoMetadata): string {
  let language: string;
  try {
    language = getConfig().SUMMARY_LANGUAGE;
  } catch {
    language = 'pt-BR';
  }

  const langInstruction = language === 'pt-BR'
    ? 'Escreva TODO o conteúdo em Português Brasileiro.'
    : language === 'en'
      ? 'Write ALL content in English.'
      : 'Write the content in the same language as the transcript.';

  return `
Você é um assistente de síntese de conhecimento. Sua tarefa é analisar a transcrição de um SHORT do YouTube (vídeo curto, ≤ 60 segundos) e gerar um mini-resumo Markdown compacto.

${langInstruction}

## Informações do Vídeo
- **Título:** ${metadata.title}
- **Canal:** ${metadata.channelName}
- **Duração:** ${metadata.duration || 'N/A'}
- **Link:** ${metadata.url}

## Regras Estritas
1. NÃO invente informações que não estão na transcrição.
2. Seja EXTREMAMENTE conciso — este é um short, não um vídeo longo.
3. A ideia principal deve caber em 1 frase impactante.
4. Os pontos-chave devem ter no máximo 3-4 bullets curtíssimos.
5. Sugira 2-3 temas/assuntos relacionados para o espectador se aprofundar.

## Formato Obrigatório do Output

\`\`\`markdown
# ⚡ {Título do Short}

## 💡 Ideia Principal
Uma frase concisa e impactante que resume o conteúdo do short.

## 📌 Pontos-Chave
- Ponto 1: descrição curta
- Ponto 2: descrição curta
- Ponto 3: descrição curta

## 🔗 Explore Mais
- **Tema 1** — breve descrição do que pesquisar para se aprofundar
- **Tema 2** — breve descrição do que pesquisar para se aprofundar
- **Tema 3** — breve descrição do que pesquisar para se aprofundar

## 🏷️ Tags
- #tag1, #tag2, #tag3 (3 a 5 tags categorizando o conteúdo)

## 📋 Metadados
| Campo | Valor |
|:---|:---|
| Canal | ${metadata.channelName} |
| Duração | ${metadata.duration || 'N/A'} |
| Tipo | Short |
| Link | ${metadata.url} |
| Processado em | {data atual} |
\`\`\`

## Transcrição do Short
${transcript}
`.trim();
}

/**
 * Prompt futuro para geração dedicada de flashcards Anki.
 * (Preparação para feature futura de integração com Anki)
 */
export function getAnkiFlashcardsPrompt(transcript: string, metadata: VideoMetadata): string {
  return `
Você é um especialista em criar flashcards para estudo espaçado (Anki).
Analise a transcrição abaixo e gere flashcards no formato CSV compatível com Anki.

Regras:
1. Cada flashcard deve ter uma Pergunta e uma Resposta.
2. Perguntas devem testar conceitos-chave, não detalhes triviais.
3. Respostas devem ser concisas (1-3 frases).
4. Gere entre 5 e 15 flashcards.
5. Use o formato: "Pergunta";"Resposta" (separador: ponto e vírgula)

Vídeo: ${metadata.title} (${metadata.channelName})

Transcrição:
${transcript}
`.trim();
}
