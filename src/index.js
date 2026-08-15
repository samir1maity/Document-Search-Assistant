import express from 'express'
import 'dotenv/config';
import appRouter from './routes/index.js';

const app = express()

app.use(express.json())

app.use('/api/v1', appRouter)

app.listen(3004, () => {
    console.log('server started')
})