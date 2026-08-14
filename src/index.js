import express from 'express'
import 'dotenv/config';

const app = express()

app.listen(3004, () => {
    console.log('server started')
})