import { QdrantClient } from '@qdrant/js-client-rest'
import config from './config.js'

const qdrantClient = new QdrantClient({
    url: config.qdrant.url,
})

export default qdrantClient
