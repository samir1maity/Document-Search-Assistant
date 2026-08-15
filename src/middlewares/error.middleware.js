import multer from 'multer'

const errorMiddleware = (err, req, res, next) => {
    console.error(err)

    if (err instanceof multer.MulterError) {
        return res.status(400).json({
            success: false,
            message: err.message
        })
    }

    const statusCode = err.statusCode || 500
    res.status(statusCode).json({
        success: false,
        message: err.message || 'Something went wrong'
    })
}

export default errorMiddleware
