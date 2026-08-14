import config from '../config/config'
import { UnstructuredClient } from "unstructured-client";
import { PartitionResponse } from "unstructured-client/sdk/models/operations";
import { Strategy } from "unstructured-client/sdk/models/shared";
import * as fs from "fs";

const client = new UnstructuredClient({
    serverURL: config.unstructured.url,
    security: {
        apiKeyAuth: config.unstructured.key,
    },
});

const filename = "/Users/samirmaity/Downloads/Amrito_Laravel_Expert.pdf";
const data = fs.readFileSync(filename);

client.general.partition({
    partitionParameters: {
        files: {
            content: data,
            fileName: filename,
        },
        strategy: Strategy.HiRes,
        splitPdfPage: true,
        splitPdfAllowFailed: true,
        splitPdfConcurrencyLevel: 15,
        languages: ['eng']
    }
}).then((res) => {
    if (res.statusCode == 200) {
        // Print the processed data's first element only.
        console.log(res.elements?.[0])

        // Write the processed data to a local file.
        const jsonElements = JSON.stringify(res, null, 2)

        fs.writeFileSync("PATH_TO_OUTPUT_FILE", jsonElements)
    }
}).catch((e) => {
    if (e.statusCode) {
      console.log(e.statusCode);
      console.log(e.body);
    } else {
      console.log(e);
    }
});


function documentPraser(){

}
