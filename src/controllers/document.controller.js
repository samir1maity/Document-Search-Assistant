import documentService from '../services/document-parser.service.js'

export const handleDocument = async (req, res) => {
 try {
    const data = await documentService.documentParser()
    res.status(200).json({
      data,
      success : true
    })
 } catch (error) {
    console.log(error)
 }
}

export default {
    handleDocument
}