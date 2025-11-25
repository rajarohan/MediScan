const path = require('path');
const fs = require('fs').promises;
const multer = require('multer');
const File = require('../models/File');
const ProcessingJob = require('../models/ProcessingJob');
const AuditLog = require('../models/AuditLog');
const { logger } = require('../utils/logger');
const { 
    fileUploadSchema, 
    validateFile, 
    paginationSchema,
    sanitizeInput 
} = require('../utils/validation');
const { 
    generateSecureToken, 
    generateFileChecksum 
} = require('../utils/crypto');
const { v4: uuidv4 } = require('uuid');

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: async (req, file, cb) => {
        const uploadDir = process.env.LOCAL_UPLOAD_PATH || './uploads';
        try {
            await fs.mkdir(uploadDir, { recursive: true });
            cb(null, uploadDir);
        } catch (error) {
            cb(error);
        }
    },
    filename: (req, file, cb) => {
        const uniqueName = `${Date.now()}-${uuidv4()}${path.extname(file.originalname)}`;
        cb(null, uniqueName);
    }
});

const upload = multer({
    storage,
    limits: {
        fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10485760, // 10MB default
        files: 1
    },
    fileFilter: (req, file, cb) => {
        const validation = validateFile(file);
        if (!validation.isValid) {
            return cb(new Error(validation.errors.join(', ')), false);
        }
        cb(null, true);
    }
});

/**
 * Upload a file for processing
 */
const uploadFile = async (req, res) => {
    try {
        // Log incoming request data for debugging
        logger.info('File upload attempt:', {
            body: req.body,
            consentRaw: req.body.consent,
            consentType: typeof req.body.consent,
            fileInfo: req.file ? {
                filename: req.file.filename,
                originalname: req.file.originalname,
                mimetype: req.file.mimetype,
                size: req.file.size
            } : 'NO_FILE',
            user: req.user ? req.user._id : 'NO_USER'
        });

        // Validate form data - handle various consent formats from different clients
        const rawConsent = req.body.consent;
        const consentValue = rawConsent === 'true' || 
                           rawConsent === true || 
                           rawConsent === 'True' || 
                           rawConsent === 1 || 
                           rawConsent === '1' ||
                           String(rawConsent).toLowerCase() === 'true';
                           
        logger.info('Consent processing:', { 
            rawConsent, 
            rawType: typeof rawConsent, 
            processedValue: consentValue 
        });
        
        let metadataValue = {};
        
        // Safely parse metadata
        if (req.body.metadata) {
            try {
                metadataValue = JSON.parse(req.body.metadata);
            } catch (parseError) {
                logger.error('Metadata JSON parse error:', parseError.message);
                return res.status(400).json({
                    success: false,
                    message: 'Invalid metadata format',
                    code: 'INVALID_METADATA_FORMAT'
                });
            }
        }
        
        logger.info('Validation input:', { consent: consentValue, metadata: metadataValue });
        
        const { error: formError, value: formData } = fileUploadSchema.validate({
            consent: consentValue,
            metadata: metadataValue
        });
        
        if (formError) {
            logger.error('Form validation error:', formError.details);
            
            // Clean up uploaded file if validation fails
            if (req.file) {
                await fs.unlink(req.file.path).catch(() => {});
            }
            
            return res.status(400).json({
                success: false,
                message: 'Validation error',
                code: 'VALIDATION_ERROR',
                details: formError.details.map(detail => ({
                    field: detail.path[0],
                    message: detail.message
                }))
            });
        }
        
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No file uploaded',
                code: 'NO_FILE_UPLOADED'
            });
        }
        
        const { consent, metadata } = formData;
        const user = req.user;
        
        // Extract text extraction data from separate form fields
        const extractedText = req.body.extractedText || null;
        const textExtractionTimestamp = req.body.textExtractionTimestamp || null;
        const textExtractionModel = req.body.textExtractionModel || null;
        
        logger.info('Extracted text data received:', {
            hasExtractedText: !!extractedText,
            textLength: extractedText ? extractedText.length : 0,
            extractionModel: textExtractionModel,
            extractionTimestamp: textExtractionTimestamp
        });
        
        // Generate file checksum
        const checksum = await generateFileChecksum(req.file.path);
        
        // Check for duplicate files
        const existingFile = await File.findOne({ checksum, userId: user._id });
        if (existingFile) {
            // Clean up the duplicate file
            await fs.unlink(req.file.path).catch(() => {});
            
            return res.status(409).json({
                success: false,
                message: 'File has already been uploaded',
                code: 'DUPLICATE_FILE',
                data: {
                    existingFileId: existingFile._id,
                    uploadedAt: existingFile.createdAt
                }
            });
        }
        
        // Create file record with extracted text support
        const fileDoc = new File({
            userId: user._id,
            filename: req.file.filename,
            originalName: sanitizeInput(req.file.originalname),
            mimeType: req.file.mimetype,
            size: req.file.size,
            checksum,
            storageLocation: req.file.filename,
            storageType: process.env.STORAGE_TYPE || 'local',
            metadata: {
                ...metadata,
                uploadedFrom: {
                    ip: req.ip,
                    userAgent: req.get('User-Agent')
                }
            },
            status: 'uploaded',
            // Store extracted text data if provided
            extractedText: extractedText,
            textExtractionData: extractedText ? {
                extractedAt: textExtractionTimestamp ? new Date(textExtractionTimestamp) : new Date(),
                extractionModel: textExtractionModel || 'unknown',
                textLength: extractedText.length,
                extractionMethod: 'frontend'
            } : null
        });
        
        await fileDoc.save();
        
        // Create processing job with different steps based on whether text is pre-extracted
        const jobId = uuidv4();
        const hasExtractedText = !!extractedText;
        
        const processingSteps = hasExtractedText ? [
            { name: 'file_validation', status: 'completed' },
            { name: 'text_processing', status: 'pending' },
            { name: 'entity_extraction', status: 'pending' },
            { name: 'summarization', status: 'pending' },
            { name: 'quality_check', status: 'pending' }
        ] : [
            { name: 'file_validation', status: 'pending' },
            { name: 'ocr_processing', status: 'pending' },
            { name: 'text_extraction', status: 'pending' },
            { name: 'entity_extraction', status: 'pending' },
            { name: 'summarization', status: 'pending' },
            { name: 'quality_check', status: 'pending' }
        ];

        const processingJob = new ProcessingJob({
            fileId: fileDoc._id,
            userId: user._id,
            jobId,
            status: 'queued',
            processingSteps,
            aiServiceMetadata: {
                callbackUrl: `${req.protocol}://${req.get('host')}/api/v1/internal/ai/callback`,
                hasPreExtractedText: hasExtractedText,
                processingMethod: hasExtractedText ? 'text_direct' : 'file_ocr'
            },
            performance: {
                queuedAt: new Date()
            },
            compliance: {
                dataClassification: 'restricted',
                auditTrail: [{
                    action: 'job_created',
                    timestamp: new Date(),
                    userId: user._id,
                    details: hasExtractedText ? 
                        'Processing job created with pre-extracted text' : 
                        'Processing job created for uploaded file'
                }]
            }
        });
        
        await processingJob.save();
        
        // Update file with processing job reference
        fileDoc.processingJob = processingJob._id;
        fileDoc.status = 'processing';
        await fileDoc.save();
        
        // Send to AI service for processing - choose endpoint based on whether text is pre-extracted
        const aiServiceUrl = hasExtractedText ? 
            `${process.env.AI_SERVICE_URL}/internal/ai/process-text` :
            `${process.env.AI_SERVICE_URL}/internal/ai/process`;
        const callbackUrl = `${req.protocol}://${req.get('host')}/api/v1/internal/ai/callback`;
        
        try {
            const axios = require('axios');
            
            let aiPayload;
            if (hasExtractedText) {
                // Use text processing endpoint
                aiPayload = {
                    jobId: processingJob.jobId,
                    fileId: fileDoc._id.toString(),
                    fileName: fileDoc.originalName,
                    extractedText: metadata.extractedText,
                    callbackUrl,
                    metadata: {
                        ...fileDoc.metadata,
                        textExtractionData: fileDoc.textExtractionData
                    }
                };
                
                logger.info('Using text processing endpoint for pre-extracted text:', {
                    fileId: fileDoc._id,
                    jobId: processingJob.jobId,
                    textLength: metadata.extractedText.length
                });
            } else {
                // Use traditional file processing endpoint
                aiPayload = {
                    jobId: processingJob.jobId,
                    fileId: fileDoc._id.toString(),
                    fileUrl: `${req.protocol}://${req.get('host')}/uploads/${fileDoc.storageLocation}`,
                    fileName: fileDoc.originalName,
                    mimeType: fileDoc.mimeType,
                    callbackUrl,
                    metadata: fileDoc.metadata
                };
                
                logger.info('Using traditional file processing endpoint:', {
                    fileId: fileDoc._id,
                    jobId: processingJob.jobId
                });
            }
            
            // Add HMAC signature for security
            const crypto = require('../utils/crypto');
            const signature = crypto.generateHMACSignature(aiPayload, process.env.AI_SERVICE_SECRET);
            
            await axios.post(aiServiceUrl, aiPayload, {
                headers: {
                    'Content-Type': 'application/json',
                    'X-Signature': signature,
                    'User-Agent': 'MediScan-Backend/1.0'
                },
                timeout: 10000 // 10 second timeout
            });
            
            logger.info('File sent to AI service for processing:', {
                fileId: fileDoc._id,
                jobId: processingJob.jobId,
                userId: user._id
            });
            
        } catch (aiError) {
            logger.error('Failed to send file to AI service:', aiError);
            
            // Update job status to failed
            processingJob.status = 'failed';
            processingJob.errorDetails = {
                code: 'AI_SERVICE_ERROR',
                message: 'Failed to send file to AI service',
                timestamp: new Date()
            };
            await processingJob.save();
            
            fileDoc.status = 'failed';
            await fileDoc.save();
        }
        
        // Log file upload
        await AuditLog.logEvent({
            userId: user._id,
            action: 'file_upload',
            resource: 'File',
            resourceId: fileDoc._id,
            ipAddress: req.ip,
            userAgent: req.get('User-Agent'),
            endpoint: req.originalUrl,
            method: req.method,
            success: true,
            details: {
                filename: fileDoc.originalName,
                size: fileDoc.size,
                mimeType: fileDoc.mimeType,
                jobId: processingJob.jobId
            },
            riskLevel: 'low',
            phiAccessed: true,
            phiTypes: ['medical_data']
        });
        
        // Set retention policy
        if (fileDoc.setRetentionPolicy) {
            await fileDoc.setRetentionPolicy('default');
        }
        
        res.status(202).json({
            success: true,
            message: 'File uploaded and processing started',
            data: {
                fileId: fileDoc._id,
                jobId: processingJob.jobId,
                status: processingJob.status,
                filename: fileDoc.originalName,
                uploadedAt: fileDoc.createdAt,
                estimatedCompletion: new Date(Date.now() + 120000) // 2 minutes estimate
            }
        });
        
    } catch (error) {
        logger.error('File upload error:', error);
        
        // Clean up uploaded file on error
        if (req.file) {
            await fs.unlink(req.file.path).catch(() => {});
        }
        
        await AuditLog.logEvent({
            userId: req.user?._id,
            action: 'file_upload',
            resource: 'File',
            ipAddress: req.ip,
            userAgent: req.get('User-Agent'),
            endpoint: req.originalUrl,
            method: req.method,
            success: false,
            errorCode: 'FILE_UPLOAD_ERROR',
            errorMessage: error.message,
            details: { error: error.message },
            riskLevel: 'medium'
        });
        
        res.status(500).json({
            success: false,
            message: 'File upload failed',
            code: 'FILE_UPLOAD_ERROR'
        });
    }
};

/**
 * Get file processing status
 */
const getFileStatus = async (req, res) => {
    try {
        const { fileId } = req.params;
        const user = req.user;
        
        const file = await File.findOne({ _id: fileId, userId: user._id })
            .populate('processingJob');
        
        if (!file) {
            return res.status(404).json({
                success: false,
                message: 'File not found',
                code: 'FILE_NOT_FOUND'
            });
        }
        
        // Log file status access
        if (file.logAccess) {
            await file.logAccess(user._id, 'view', {
                ip: req.ip,
                userAgent: req.get('User-Agent')
            });
        }
        
        const response = {
            success: true,
            message: 'File status retrieved successfully',
            data: {
                fileId: file._id,
                filename: file.originalName,
                status: file.status,
                uploadedAt: file.createdAt,
                size: file.size,
                mimeType: file.mimeType
            }
        };
        
        if (file.processingJob) {
            const job = file.processingJob;
            response.data.processing = {
                jobId: job.jobId,
                status: job.status,
                progress: job.progress,
                completionPercentage: job.completionPercentage,
                estimatedCompletion: job.estimatedCompletion,
                steps: job.processingSteps.map(step => ({
                    name: step.name,
                    status: step.status,
                    duration: step.duration
                }))
            };
            
            if (job.errorDetails) {
                response.data.processing.error = {
                    code: job.errorDetails.code,
                    message: job.errorDetails.message,
                    retryCount: job.errorDetails.retryCount
                };
            }
        }
        
        res.json(response);
        
    } catch (error) {
        logger.error('Get file status error:', error);
        
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve file status',
            code: 'FILE_STATUS_ERROR'
        });
    }
};

/**
 * Get file details
 */
const getFileDetails = async (req, res) => {
    try {
        const { fileId } = req.params;
        const user = req.user;
        
        const file = await File.findOne({ _id: fileId, userId: user._id })
            .populate('processingJob')
            .exec();
        
        if (!file) {
            return res.status(404).json({
                success: false,
                message: 'File not found',
                code: 'FILE_NOT_FOUND'
            });
        }
        
        // Create audit log entry
        await AuditLog.create({
            userId: user._id,
            action: 'file_accessed',
            resourceType: 'file',
            resourceId: file._id,
            details: {
                fileName: file.filename,
                fileId: file._id.toString()
            }
        });
        
        const response = {
            success: true,
            data: {
                fileId: file._id,
                filename: file.filename,
                originalName: file.originalName,
                size: file.size,
                mimeType: file.mimeType,
                uploadDate: file.uploadDate,
                status: file.status,
                metadata: file.metadata || {}
            }
        };
        
        // Add processing information if available
        if (file.processingJob) {
            const job = file.processingJob;
            response.data.processing = {
                jobId: job.jobId,
                status: job.status,
                progress: job.progress,
                completionPercentage: job.completionPercentage,
                estimatedCompletion: job.estimatedCompletion,
                createdAt: job.createdAt,
                updatedAt: job.updatedAt
            };
            
            if (job.errorDetails) {
                response.data.processing.error = {
                    code: job.errorDetails.code,
                    message: job.errorDetails.message,
                    retryCount: job.errorDetails.retryCount
                };
            }
        }
        
        res.json(response);
        
    } catch (error) {
        logger.error('Get file details error:', error);
        
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve file details',
            code: 'FILE_DETAILS_ERROR'
        });
    }
};

/**
 * Get file processing results
 */
const getFileResult = async (req, res) => {
    try {
        const { fileId } = req.params;
        const user = req.user;
        
        const file = await File.findOne({ _id: fileId, userId: user._id })
            .populate({
                path: 'processingJob',
                select: '+results.ocrText' // Include OCR text if needed
            });
        
        if (!file) {
            return res.status(404).json({
                success: false,
                message: 'File not found',
                code: 'FILE_NOT_FOUND'
            });
        }
        
        if (file.status !== 'completed') {
            return res.status(404).json({
                success: false,
                message: 'Processing results not available yet',
                code: 'RESULTS_NOT_READY',
                data: {
                    status: file.status,
                    progress: file.processingJob?.progress || 0
                }
            });
        }
        
        const job = file.processingJob;
        if (!job || !job.results) {
            return res.status(404).json({
                success: false,
                message: 'Processing results not found',
                code: 'RESULTS_NOT_FOUND'
            });
        }
        
        // Log PHI access
        await AuditLog.logEvent({
            userId: user._id,
            action: 'file_view',
            resource: 'File',
            resourceId: file._id,
            ipAddress: req.ip,
            userAgent: req.get('User-Agent'),
            endpoint: req.originalUrl,
            method: req.method,
            success: true,
            details: {
                filename: file.originalName,
                resultType: 'full_results'
            },
            riskLevel: 'medium',
            phiAccessed: true,
            phiTypes: ['medical_data', 'diagnosis', 'treatment']
        });
        
        if (file.logAccess) {
            await file.logAccess(user._id, 'view', {
                ip: req.ip,
                userAgent: req.get('User-Agent')
            });
        }
        
        res.json({
            success: true,
            message: 'Processing results retrieved successfully',
            data: {
                fileId: file._id,
                filename: file.originalName,
                processedAt: job.performance.completedAt,
                processingDuration: job.performance.processingDuration,
                summary: job.results.summary,
                extractedEntities: job.results.extractedEntities,
                qualityMetrics: job.results.qualityMetrics,
                flags: job.results.flags,
                confidence: {
                    overall: job.results.qualityMetrics.extractionConfidence,
                    ocr: job.results.qualityMetrics.ocrConfidence,
                    documentQuality: job.results.qualityMetrics.documentQuality
                }
            }
        });
        
    } catch (error) {
        logger.error('Get file result error:', error);
        
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve processing results',
            code: 'FILE_RESULT_ERROR'
        });
    }
};

/**
 * Get user's files with pagination and filtering
 */
const getFiles = async (req, res) => {
    try {
        const user = req.user;
        
        // Validate pagination parameters
        const { error, value } = paginationSchema.validate(req.query);
        if (error) {
            return res.status(400).json({
                success: false,
                message: 'Invalid pagination parameters',
                code: 'PAGINATION_ERROR',
                details: error.details
            });
        }
        
        const { page, limit, sortBy, sortOrder } = value;
        const skip = (page - 1) * limit;
        
        // Build filter query
        const filter = { userId: user._id };
        
        // Add status filter if provided
        if (req.query.status) {
            const validStatuses = ['uploaded', 'processing', 'completed', 'failed'];
            if (validStatuses.includes(req.query.status)) {
                filter.status = req.query.status;
            }
        }
        
        // Add date range filter if provided
        if (req.query.startDate || req.query.endDate) {
            filter.createdAt = {};
            if (req.query.startDate) {
                filter.createdAt.$gte = new Date(req.query.startDate);
            }
            if (req.query.endDate) {
                filter.createdAt.$lte = new Date(req.query.endDate);
            }
        }
        
        // Add search filter if provided
        if (req.query.search) {
            const searchTerm = sanitizeInput(req.query.search);
            filter.$or = [
                { originalName: { $regex: searchTerm, $options: 'i' } },
                { 'metadata.patientName': { $regex: searchTerm, $options: 'i' } },
                { 'metadata.reportType': { $regex: searchTerm, $options: 'i' } }
            ];
        }
        
        // Execute query with pagination
        const [files, total] = await Promise.all([
            File.find(filter)
                .populate('processingJob', 'jobId status progress')
                .sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            File.countDocuments(filter)
        ]);
        
        // Log files access
        await AuditLog.logEvent({
            userId: user._id,
            action: 'files_listed',
            resource: 'File',
            ipAddress: req.ip,
            userAgent: req.get('User-Agent'),
            endpoint: req.originalUrl,
            method: req.method,
            success: true,
            details: {
                totalFiles: total,
                page,
                limit,
                filters: filter
            },
            riskLevel: 'low'
        });
        
        res.json({
            success: true,
            message: 'Files retrieved successfully',
            data: {
                files: files.map(file => ({
                    id: file._id,
                    filename: file.originalName,
                    status: file.status,
                    size: file.size,
                    mimeType: file.mimeType,
                    uploadedAt: file.createdAt,
                    metadata: file.metadata,
                    processing: file.processingJob ? {
                        jobId: file.processingJob.jobId,
                        status: file.processingJob.status,
                        progress: file.processingJob.progress
                    } : null
                })),
                pagination: {
                    current: page,
                    total: Math.ceil(total / limit),
                    totalItems: total,
                    hasNext: page < Math.ceil(total / limit),
                    hasPrev: page > 1
                }
            }
        });
        
    } catch (error) {
        logger.error('Get files error:', error);
        
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve files',
            code: 'GET_FILES_ERROR'
        });
    }
};

/**
 * Delete a file
 */
const deleteFile = async (req, res) => {
    try {
        const { fileId } = req.params;
        const user = req.user;
        
        const file = await File.findOne({ _id: fileId, userId: user._id });
        
        if (!file) {
            return res.status(404).json({
                success: false,
                message: 'File not found',
                code: 'FILE_NOT_FOUND'
            });
        }
        
        // Check if file is protected from deletion
        if (file.retention && file.retention.isProtected) {
            return res.status(403).json({
                success: false,
                message: 'File is protected and cannot be deleted',
                code: 'FILE_PROTECTED'
            });
        }
        
        // Cancel processing job if still running
        if (file.processingJob) {
            const job = await ProcessingJob.findById(file.processingJob);
            if (job && ['queued', 'processing'].includes(job.status)) {
                job.status = 'cancelled';
                await job.save();
            }
        }
        
        // Delete physical file
        const filePath = path.join(process.env.LOCAL_UPLOAD_PATH || './uploads', file.storageLocation);
        try {
            await fs.unlink(filePath);
        } catch (unlinkError) {
            logger.warn('Failed to delete physical file:', unlinkError);
        }
        
        // Mark file as deleted (soft delete)
        file.status = 'deleted';
        await file.save();
        
        // Log file deletion
        await AuditLog.logEvent({
            userId: user._id,
            action: 'file_delete',
            resource: 'File',
            resourceId: file._id,
            ipAddress: req.ip,
            userAgent: req.get('User-Agent'),
            endpoint: req.originalUrl,
            method: req.method,
            success: true,
            details: {
                filename: file.originalName,
                size: file.size,
                storageLocation: file.storageLocation
            },
            riskLevel: 'medium',
            phiAccessed: true
        });
        
        res.json({
            success: true,
            message: 'File deleted successfully',
            data: {
                fileId: file._id,
                filename: file.originalName,
                deletedAt: new Date()
            }
        });
        
    } catch (error) {
        logger.error('Delete file error:', error);
        
        res.status(500).json({
            success: false,
            message: 'Failed to delete file',
            code: 'FILE_DELETE_ERROR'
        });
    }
};

/**
 * Download a file
 */
const downloadFile = async (req, res) => {
    try {
        const { fileId } = req.params;
        const user = req.user;
        
        const file = await File.findOne({ _id: fileId, userId: user._id });
        
        if (!file) {
            return res.status(404).json({
                success: false,
                message: 'File not found',
                code: 'FILE_NOT_FOUND'
            });
        }
        
        if (file.status === 'deleted') {
            return res.status(410).json({
                success: false,
                message: 'File has been deleted',
                code: 'FILE_DELETED'
            });
        }
        
        // Check file access
        if (file.hasAccess && !file.hasAccess(user._id, 'download')) {
            return res.status(403).json({
                success: false,
                message: 'Access denied',
                code: 'ACCESS_DENIED'
            });
        }
        
        const filePath = path.join(process.env.LOCAL_UPLOAD_PATH || './uploads', file.storageLocation);
        
        // Check if file exists on disk
        try {
            await fs.access(filePath);
        } catch (error) {
            return res.status(404).json({
                success: false,
                message: 'File not found on storage',
                code: 'FILE_NOT_ON_STORAGE'
            });
        }
        
        // Log file download
        await AuditLog.logEvent({
            userId: user._id,
            action: 'file_download',
            resource: 'File',
            resourceId: file._id,
            ipAddress: req.ip,
            userAgent: req.get('User-Agent'),
            endpoint: req.originalUrl,
            method: req.method,
            success: true,
            details: {
                filename: file.originalName,
                size: file.size
            },
            riskLevel: 'medium',
            phiAccessed: true
        });
        
        if (file.logAccess) {
            await file.logAccess(user._id, 'download', {
                ip: req.ip,
                userAgent: req.get('User-Agent')
            });
        }
        
        // Set appropriate headers
        res.setHeader('Content-Type', file.mimeType);
        res.setHeader('Content-Disposition', `attachment; filename="${file.originalName}"`);
        res.setHeader('Content-Length', file.size);
        
        // Stream file to response
        const fileStream = require('fs').createReadStream(filePath);
        fileStream.pipe(res);
        
        fileStream.on('error', (error) => {
            logger.error('File streaming error:', error);
            if (!res.headersSent) {
                res.status(500).json({
                    success: false,
                    message: 'Error streaming file',
                    code: 'FILE_STREAM_ERROR'
                });
            }
        });
        
    } catch (error) {
        logger.error('Download file error:', error);
        
        if (!res.headersSent) {
            res.status(500).json({
                success: false,
                message: 'Failed to download file',
                code: 'FILE_DOWNLOAD_ERROR'
            });
        }
    }
};

module.exports = {
    uploadFile: [upload.single('file'), uploadFile],
    getFileStatus,
    getFileResult,
    getFiles,
    getFileDetails,
    deleteFile,
    downloadFile
};