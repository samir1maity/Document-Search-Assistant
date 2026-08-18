import multer from 'multer'

const storage = multer.memoryStorage()

const upload = multer({
    storage,
    limits: {
        fileSize: 25 * 1024 * 1024, // 25MB
    },
    fileFilter: (req, file, cb) => {
        console.log('upload fileFilter:', {
            fieldname: file.fieldname,
            originalname: file.originalname,
            mimetype: file.mimetype
        })

        const isPdfMimetype = file.mimetype === 'application/pdf'
        const isPdfExtension = file.originalname.toLowerCase().endsWith('.pdf')

        if (!isPdfMimetype && !isPdfExtension) {
            return cb(new Error(`Only PDF files are allowed (got mimetype: "${file.mimetype}", filename: "${file.originalname}")`))
        }
        cb(null, true)
    }
})

export default upload
