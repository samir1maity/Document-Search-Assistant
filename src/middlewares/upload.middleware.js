import multer from 'multer'

// Keep the file in memory as a Buffer (req.file.buffer) instead of writing
// to disk — the service streams it straight to LlamaCloud, no local copy needed.
const storage = multer.memoryStorage()

const upload = multer({
    storage,
    limits: {
        fileSize: 25 * 1024 * 1024, // 25MB
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype !== 'application/pdf') {
            return cb(new Error('Only PDF files are allowed'))
        }
        cb(null, true)
    }
})

export default upload
