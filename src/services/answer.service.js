import constants from '../config/constants.js'
import openaiClient from '../config/openai.client.js'

// numbered context blocks, one per matched parent chunk, so the model can cite [n]
function buildContext(results) {
   return results
      .filter(result => result.parent)
      .map((result, index) => `[${index + 1}] (${result.parent.section_title ?? 'Untitled section'})\n${result.parent.text}`)
      .join('\n\n')
}

async function generateAnswer({ query, results }) {
   const context = buildContext(results)

   if (!context) {
      return "I couldn't find anything relevant in the documents to answer that.";
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

   return response.choices[0].message.content;
}

export default {
   generateAnswer
}
