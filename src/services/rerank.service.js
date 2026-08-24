import constants from '../config/constants.js'
import cohereClient from '../config/cohere.client.js'

// refines an already RRF-merged pool down to the final top N, scored on the
// actual query+chunk pair instead of just rank position
async function rerankMatches({ query, matches, topN }) {
   if (matches.length === 0) {
      return matches;
   }

   const response = await cohereClient.rerank({
      model: constants.rerank.MODEL,
      query,
      documents: matches.map(match => match.payload.text),
      topN
   });

   return response.results.map(result => ({
      ...matches[result.index],
      rerank_score: result.relevanceScore
   }));
}

export default {
   rerankMatches
}
