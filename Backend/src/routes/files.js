const express = require('express');
const { 
    uploadFile, 
    getFileStatus, 
    getFileResult,
    getFiles,
    getFileDetails,
    deleteFile,
    downloadFile
} = require('../controllers/fileController');
const { authenticate } = require('../middleware/auth');
const { 
    uploadLimiter, 
    downloadLimiter, 
    apiLimiter 
} = require('../middleware/rateLimiting');

const router = express.Router();

/**
 * @route GET /api/v1/files
 * @desc Get user's files with pagination
 * @access Private
 */
router.get('/', authenticate, apiLimiter, getFiles);

/**
 * @route POST /api/v1/files
 * @desc Upload a file for processing
 * @access Private
 */
router.post('/', authenticate, uploadLimiter, uploadFile);

/**
 * @route POST /api/v1/files/upload
 * @desc Upload a file for processing (alternative endpoint)
 * @access Private
 */
router.post('/upload', authenticate, uploadLimiter, uploadFile);

/**
 * @route GET /api/v1/files/:fileId
 * @desc Get file details
 * @access Private
 */
router.get('/:fileId', authenticate, apiLimiter, getFileDetails);

/**
 * @route GET /api/v1/files/:fileId/status
 * @desc Get file processing status
 * @access Private
 */
router.get('/:fileId/status', authenticate, apiLimiter, getFileStatus);

/**
 * @route GET /api/v1/files/:fileId/result
 * @desc Get file processing results
 * @access Private
 */
router.get('/:fileId/result', authenticate, downloadLimiter, getFileResult);

/**
 * @route GET /api/v1/files/:fileId/download
 * @desc Download the original file
 * @access Private
 */
router.get('/:fileId/download', authenticate, downloadLimiter, downloadFile);

/**
 * @route DELETE /api/v1/files/:fileId
 * @desc Delete a file
 * @access Private
 */
router.delete('/:fileId', authenticate, apiLimiter, deleteFile);

module.exports = router;