import { CohereClientV2 } from 'cohere-ai'
import config from './config.js'

// Singleton client, instantiated once and reused across the app —
// same pattern as the other external-service clients in this folder.
const cohereClient = new CohereClientV2({
    token: config.cohere.apiKey,
})

export default cohereClient
