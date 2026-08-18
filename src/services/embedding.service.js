import { randomUUID } from 'crypto'
import constants from '../config/constants.js'
import openaiClient from '../config/openai.client.js'
import qdrantClient from '../config/qdrant.client.js'

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

async function ensureCollection() {
   const { collections } = await qdrantClient.getCollections();
   const exists = collections.some(c => c.name === constants.qdrant.COLLECTION_NAME);

   if (!exists) {
      await qdrantClient.createCollection(constants.qdrant.COLLECTION_NAME, {
         vectors: {
            size: constants.embedding.DIMENSIONS,
            distance: constants.qdrant.DISTANCE
         }
      });
   }
}

async function saveChildChunks({ embeddedChunks }) {
   if (embeddedChunks.length === 0) {
      return;
   }

   await ensureCollection();

   await qdrantClient.upsert(constants.qdrant.COLLECTION_NAME, {
      wait: true,
      points: embeddedChunks.map(chunk => ({
         id: randomUUID(),
         vector: chunk.embedding,
         payload: {
            chunk_id: chunk.chunk_id,
            parent_id: chunk.parent_id,
            document_id: chunk.document_id,
            document_name: chunk.document_name,
            section_title: chunk.section_title,
            text: chunk.text,
            start_page: chunk.start_page,
            end_page: chunk.end_page
         }
      }))
   });
}

async function searchChildChunks({ queryEmbedding, limit = 5 }) {
   const result = await qdrantClient.query(constants.qdrant.COLLECTION_NAME, {
      query: queryEmbedding,
      limit,
      with_payload: true
   });

   return result.points;
}

export default {
   embedChildChunks,
   saveChildChunks,
   searchChildChunks
}
