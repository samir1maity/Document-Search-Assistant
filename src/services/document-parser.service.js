import { toFile } from '@llamaindex/llama-cloud'
import llamaCloudClient from '../config/llama-cloud.client.js'

async function documentParser(fileBuffer, fileName, mimeType) {
    const uploadFile = await toFile(fileBuffer, fileName, { type: mimeType })

    const result = await llamaCloudClient.parsing.parse({
        tier: "agentic",
        version: "latest",
        upload_file: uploadFile,
        expand: ["items"],
    });

    return result.items;
}

export default {
    documentParser
};
