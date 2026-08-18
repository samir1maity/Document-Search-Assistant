const config = {
    llamaCloud: {
        apiKey: process.env.LLAMA_CLOUD_API_KEY
    },
    openai: {
        apiKey: process.env.OPENAI_API_KEY
    },
    qdrant: {
        url: process.env.QDRANT_URL
    }
}

export default config;
