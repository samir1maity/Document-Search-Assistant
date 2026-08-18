import OpenAI from 'openai'
import config from './config.js'

// Singleton client, instantiated once and reused across the app —
// same pattern as the other external-service clients in this folder.
const openaiClient = new OpenAI({
    apiKey: config.openai.apiKey,
})

export default openaiClient
