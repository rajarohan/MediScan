const express = require('express');
const ProcessingJob = require('../models/ProcessingJob');
const File = require('../models/File');
const AuditLog = require('../models/AuditLog');
const User = require('../models/User');
const { logger } = require('../utils/logger');
const { verifyHMACSignature } = require('../utils/crypto');

const router = express.Router();

/**
 * @route POST /api/v1/internal/ai/process
 * @desc Send file to AI service for processing (internal use)
 * @access Internal
 */
router.post('/ai/process', async (req, res) => {
    try {
        // This endpoint would be called by the backend to send files to AI service
        // Implementation depends on AI service architecture
        res.json({
            success: true,
            message: 'Internal AI processing endpoint',
            code: 'AI_PROCESS_INTERNAL'
        });
    } catch (error) {
        logger.error('Internal AI process error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal processing failed',
            code: 'INTERNAL_AI_ERROR'
        });
    }
});

/**
 * @route POST /api/v1/internal/ai/callback
 * @desc Receive results from AI service
 * @access Internal - AI Service only
 */
router.post('/ai/callback', async (req, res) => {
    try {
        const signature = req.get('X-Signature');
        const payload = req.body;
        
        // Verify HMAC signature
        if (!verifyHMACSignature(payload, signature, process.env.AI_SERVICE_SECRET)) {
            logger.warn('Invalid HMAC signature from AI service:', {
                signature,
                ip: req.ip
            });
            
            return res.status(403).json({
                success: false,
                message: 'Invalid signature',
                code: 'INVALID_SIGNATURE'
            });
        }
        
        const { jobId, status, results, error } = payload;
        
        // Find processing job
        const job = await ProcessingJob.findOne({ jobId });
        if (!job) {
            return res.status(404).json({
                success: false,
                message: 'Job not found',
                code: 'JOB_NOT_FOUND'
            });
        }
        
        // Update job based on status
        if (status === 'completed' && results) {
            await job.markCompleted(results);
            
            // Update file status
            const file = await File.findById(job.fileId);
            if (file) {
                file.status = 'completed';
                await file.save();
            }
            
            logger.info('Processing job completed:', {
                jobId,
                fileId: job.fileId,
                userId: job.userId
            });
            
        } else if (status === 'failed') {
            await job.markFailed(new Error(error?.message || 'AI processing failed'));
            
            // Update file status
            const file = await File.findById(job.fileId);
            if (file) {
                file.status = 'failed';
                await file.save();
            }
            
            logger.error('Processing job failed:', {
                jobId,
                error,
                fileId: job.fileId,
                userId: job.userId
            });
        }
        
        // Log processing result
        await AuditLog.logEvent({
            userId: job.userId,
            action: status === 'completed' ? 'processing_completed' : 'processing_failed',
            resource: 'ProcessingJob',
            resourceId: job._id,
            ipAddress: req.ip,
            userAgent: req.get('User-Agent'),
            endpoint: req.originalUrl,
            method: req.method,
            success: status === 'completed',
            details: {
                jobId,
                fileId: job.fileId,
                status,
                aiServiceMetadata: payload.metadata
            },
            riskLevel: status === 'completed' ? 'low' : 'medium'
        });
        
        res.json({
            success: true,
            message: 'Callback processed successfully',
            data: {
                jobId,
                status: job.status
            }
        });
        
    } catch (error) {
        logger.error('AI callback error:', error);
        res.status(500).json({
            success: false,
            message: 'Callback processing failed',
            code: 'CALLBACK_ERROR'
        });
    }
});

/**
 * @route GET /api/v1/internal/health
 * @desc Health check endpoint
 * @access Internal
 */
router.get('/health', async (req, res) => {
    try {
        // Check database connection
        const dbStatus = await ProcessingJob.findOne().limit(1).lean();
        
        // Check queue status
        const queueStats = await ProcessingJob.getQueueStats();
        
        res.json({
            success: true,
            message: 'Service healthy',
            data: {
                timestamp: new Date().toISOString(),
                database: dbStatus !== null ? 'connected' : 'disconnected',
                queue: queueStats,
                uptime: process.uptime(),
                memory: process.memoryUsage(),
                version: process.env.npm_package_version || '1.0.0'
            }
        });
    } catch (error) {
        logger.error('Health check error:', error);
        res.status(503).json({
            success: false,
            message: 'Service unhealthy',
            code: 'HEALTH_CHECK_FAILED',
            error: error.message
        });
    }
});

/**
 * @route GET /api/v1/internal/debug/users
 * @desc Debug endpoint to check users in database (development only)
 * @access Internal
 */
router.get('/debug/users', async (req, res) => {
    try {
        if (process.env.NODE_ENV !== 'development') {
            return res.status(403).json({
                success: false,
                message: 'Debug endpoint only available in development',
                code: 'DEBUG_FORBIDDEN'
            });
        }

        const users = await User.find({}, {
            email: 1,
            firstName: 1,
            lastName: 1,
            isActive: 1,
            createdAt: 1,
            loginAttempts: 1,
            isLocked: 1
        }).sort({ createdAt: -1 }).limit(10);

        res.json({
            success: true,
            data: {
                count: users.length,
                users: users
            }
        });
    } catch (error) {
        logger.error('Debug users error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch users',
            code: 'DEBUG_ERROR',
            error: error.message
        });
    }
});

module.exports = router;