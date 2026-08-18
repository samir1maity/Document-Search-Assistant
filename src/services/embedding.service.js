import constants from '../config/constants.js'
import openaiClient from '../config/openai.client.js'

async function embedChildChunks({ childChunks }) {
   if (childChunks.length === 0) {
      return childChunks;
   }

   const response = await openaiClient.embeddings.create({
      model: constants.embedding.MODEL,
      input: childChunks.map(chunk => chunk.text)
   });

   return childChunks.map((chunk, index) => ({
      ...chunk,
      embedding: response.data[index].embedding
   }));
}

export default {
   embedChildChunks
}
