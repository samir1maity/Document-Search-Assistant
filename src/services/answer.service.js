import constants from '../config/constants.js'
import openaiClient from '../config/openai.client.js'

// numbered context blocks, one per matched parent chunk, so the model can cite [n]
function buildContext(results) {
   return results
      .filter(result => result.parent)
      .map((result, index) => `[${index + 1}] (${result.parent.section_title ?? 'Untitled section'})\n${result.parent.text}`)
      .join('\n\n')
}

// same order/numbering as buildContext, so an answer's [n] maps to sources[n - 1]
function buildSources(results) {
   return results
      .filter(result => result.parent)
      .map(result => ({
         document_name: result.parent.document_name,
         section_title: result.parent.section_title,
         start_page: result.parent.start_page,
         end_page: result.parent.end_page
      }))
}

async function generateAnswer({ query, results }) {
   const context = buildContext(results)

   if (!context) {
      return {
         answer: "I couldn't find anything relevant in the documents to answer that.",
         sources: []
      };
   }

   const response = await openaiClient.chat.completions.create({
      model: constants.answer.MODEL,
      messages: [
         {
            role: 'system',
            content: 'Answer the question using only the provided context. If the context does not contain the answer, say you don\'t know. Cite sources using their [number].'
         },
         {
            role: 'user',
            content: `Context:\n${context}\n\nQuestion: ${query}`
         }
      ]
   });

   return {
      answer: response.choices[0].message.content,
      sources: buildSources(results)
   };
}

export default {
   generateAnswer
}
