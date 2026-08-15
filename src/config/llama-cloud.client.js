import LlamaCloud from '@llamaindex/llama-cloud'
import config from './config.js'

const llamaCloudClient = new LlamaCloud({
    apiKey: config.llamaCloud.apiKey,
});

export default llamaCloudClient;
