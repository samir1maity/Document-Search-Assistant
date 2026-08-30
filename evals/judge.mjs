// LLM-as-judge helpers for generation evals — each returns parsed JSON, not raw text.

import constants from '../src/config/constants.js'
import openaiClient from '../src/config/openai.client.js'

async function askJudge(systemPrompt, userPrompt) {
   const response = await openaiClient.chat.completions.create({
      model: constants.eval.JUDGE_MODEL,
      response_format: { type: 'json_object' },
      messages: [
         { role: 'system', content: systemPrompt },
         { role: 'user', content: userPrompt }
      ]
   });

   return JSON.parse(response.choices[0].message.content);
}

// is every claim in the answer actually supported by the retrieved context?
async function judgeFaithfulness({ context, answer }) {
   return askJudge(
      'You judge whether every claim in an AI-generated answer is supported by the given context. Respond with JSON: {"faithful": true|false, "reasoning": "one sentence"}.',
      `Context:\n${context}\n\nAnswer:\n${answer}`
   );
}

// does the answer actually address the question asked?
async function judgeRelevance({ question, answer }) {
   return askJudge(
      'You judge how well an answer addresses the question asked, on a scale of 1-5 (5 = fully addresses it). Respond with JSON: {"score": 1-5, "reasoning": "one sentence"}.',
      `Question: ${question}\n\nAnswer:\n${answer}`
   );
}

// does the answer match the expected answer in meaning, not exact wording?
async function judgeCorrectness({ answer, expectedAnswer }) {
   return askJudge(
      'You judge whether a generated answer is semantically correct compared to the expected answer, on a scale of 1-5 (5 = fully correct; exact wording does not matter). Respond with JSON: {"score": 1-5, "reasoning": "one sentence"}.',
      `Expected answer:\n${expectedAnswer}\n\nGenerated answer:\n${answer}`
   );
}

export {
   judgeFaithfulness,
   judgeRelevance,
   judgeCorrectness
}
