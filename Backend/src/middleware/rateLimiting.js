const rateLimit = require('express-rate-limit');
const { logger } = require('../utils/logger');
const AuditLog = require('../models/AuditLog');
const { getRedisClient } = require('../config/redis');

/**
 * Create rate limiter with Redis store if available
 */
const createRateLimiter = (options) => {
    const redisClient = getRedisClient();
    
    // Base configuration
    const config = {
        windowMs: options.windowMs || parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes default
        max: options.max || parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // 100 requests per window default
        message: {
            success: false,
            message: options.message || 'Too many requests, please try again later.',
            code: 'RATE_LIMIT_EXCEEDED',
            retryAfter: Math.ceil(options.windowMs / 1000) || parseInt(process.env.RATE_LIMIT_RETRY_AFTER) || 900
        },
        standardHeaders: true,
        legacyHeaders: false,
        handler: async (req, res) => {
            // Log rate limit violations
            await AuditLog.logEvent({
                userId: req.user?._id || null,
                action: 'rate_limit_exceeded',
                resource: 'System',
                ipAddress: req.ip,
                userAgent: req.get('User-Agent'),
                endpoint: req.originalUrl,
                method: req.method,
                success: false,
                errorCode: 'RATE_LIMIT_EXCEEDED',
                details: {
                    limit: options.max,
                    window: options.windowMs,
                    endpoint: req.originalUrl
                },
                riskLevel: options.riskLevel || 'medium'
            });
            
            logger.warn('Rate limit exceeded:', {
                ip: req.ip,
                endpoint: req.originalUrl,
                userAgent: req.get('User-Agent'),
                userId: req.user?._id
            });
            
            res.status(429).json(config.message);
        },
        ...options
    };
    
    // Add Redis store if available
    if (redisClient) {
        try {
            const RedisStore = require('rate-limit-redis');
            config.store = new RedisStore({
                sendCommand: (...args) => redisClient.sendCommand(args),
                prefix: 'rl:', // Redis key prefix
            });
        } catch (error) {
            logger.warn('Redis rate limiting not available, falling back to memory store:', error.message);
        }
    }
    
    return rateLimit(config);
};

/**
 * General API rate limiting
 */
const apiLimiter = createRateLimiter({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW) * 60 * 1000 || 15 * 60 * 1000, // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // 100 requests per IP
    message: 'Too many API requests from this IP, please try again later.',
    riskLevel: 'low'
});

/**
 * Strict rate limiting for authentication endpoints
 */
const authLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // Only 5 login attempts per IP
    message: 'Too many login attempts from this IP, please try again later.',
    riskLevel: 'high',
    skipSuccessfulRequests: true // Don't count successful logins
});

/**
 * File upload rate limiting
 */
const uploadLimiter = createRateLimiter({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 20, // 20 file uploads per hour
    message: 'Too many file uploads from this IP, please try again later.',
    riskLevel: 'medium'
});

/**
 * Password reset rate limiting
 */
const passwordResetLimiter = createRateLimiter({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 3, // Only 3 password reset attempts per hour
    message: 'Too many password reset requests, please try again later.',
    riskLevel: 'medium'
});

/**
 * File download rate limiting
 */
const downloadLimiter = createRateLimiter({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 30, // 30 downloads per 5 minutes
    message: 'Too many download requests, please slow down.',
    riskLevel: 'low'
});

/**
 * Admin endpoint rate limiting
 */
const adminLimiter = createRateLimiter({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 50, // 50 admin requests per 5 minutes
    message: 'Too many admin requests, please slow down.',
    riskLevel: 'high'
});

/**
 * Search/Query rate limiting
 */
const searchLimiter = createRateLimiter({
    windowMs: 60 * 1000, // 1 minute
    max: 30, // 30 searches per minute
    message: 'Too many search requests, please slow down.',
    riskLevel: 'low'
});

/**
 * User-specific rate limiting (by user ID)
 */
const createUserLimiter = (options) => {
    return createRateLimiter({
        ...options,
        keyGenerator: (req) => {
            // Use user ID if authenticated, otherwise fall back to IP
            return req.user ? `user_${req.user._id}` : req.ip;
        }
    });
};

/**
 * Dynamic rate limiting based on user role
 */
const roleBasedLimiter = (req, res, next) => {
    if (!req.user) {
        return apiLimiter(req, res, next);
    }
    
    const limits = {
        admin: { max: 1000, windowMs: 15 * 60 * 1000 }, // 1000 requests per 15 min
        clinician: { max: 500, windowMs: 15 * 60 * 1000 }, // 500 requests per 15 min
        patient: { max: 200, windowMs: 15 * 60 * 1000 } // 200 requests per 15 min
    };
    
    const userLimit = limits[req.user.role] || limits.patient;
    
    const dynamicLimiter = createRateLimiter({
        max: userLimit.max,
        windowMs: userLimit.windowMs,
        keyGenerator: (req) => `role_${req.user.role}_${req.user._id}`,
        message: `Too many requests for ${req.user.role} role, please try again later.`,
        riskLevel: 'low'
    });
    
    return dynamicLimiter(req, res, next);
};

/**
 * Progressive rate limiting - increases restrictions for repeated violations
 */
const progressiveLimiter = (baseOptions) => {
    return async (req, res, next) => {
        const redisClient = getRedisClient();
        const key = `progressive_${req.ip}`;
        
        try {
            if (redisClient) {
                // Get current violation count
                const violations = await redisClient.get(`violations_${key}`) || 0;
                const violationCount = parseInt(violations);
                
                // Adjust limits based on violation history
                const adjustedMax = Math.max(1, baseOptions.max - (violationCount * 10));
                const adjustedWindow = baseOptions.windowMs * Math.max(1, violationCount);
                
                const limiter = createRateLimiter({
                    ...baseOptions,
                    max: adjustedMax,
                    windowMs: adjustedWindow,
                    handler: async (req, res) => {
                        // Increment violation count
                        await redisClient.setEx(
                            `violations_${key}`, 
                            24 * 60 * 60, // 24 hours
                            violationCount + 1
                        );
                        
                        // Log progressive rate limit
                        await AuditLog.logEvent({
                            userId: req.user?._id || null,
                            action: 'progressive_rate_limit',
                            resource: 'System',
                            ipAddress: req.ip,
                            userAgent: req.get('User-Agent'),
                            endpoint: req.originalUrl,
                            method: req.method,
                            success: false,
                            errorCode: 'PROGRESSIVE_RATE_LIMIT',
                            details: {
                                violationCount: violationCount + 1,
                                adjustedMax,
                                adjustedWindow
                            },
                            riskLevel: violationCount > 3 ? 'high' : 'medium'
                        });
                        
                        res.status(429).json({
                            success: false,
                            message: 'Rate limit exceeded. Restrictions increased due to repeated violations.',
                            code: 'PROGRESSIVE_RATE_LIMIT',
                            violationCount: violationCount + 1,
                            retryAfter: Math.ceil(adjustedWindow / 1000)
                        });
                    }
                });
                
                return limiter(req, res, next);
            }
        } catch (error) {
            logger.error('Progressive rate limiter error:', error);
        }
        
        // Fallback to regular rate limiter
        const fallbackLimiter = createRateLimiter(baseOptions);
        return fallbackLimiter(req, res, next);
    };
};

/**
 * IP whitelist bypass for rate limiting
 */
const createWhitelistedLimiter = (limiter, whitelist = []) => {
    return (req, res, next) => {
        const clientIP = req.ip;
        
        // Check if IP is whitelisted
        const isWhitelisted = whitelist.some(whitelistEntry => {
            if (typeof whitelistEntry === 'string') {
                return clientIP === whitelistEntry;
            }
            // Support CIDR notation
            if (whitelistEntry.includes('/')) {
                const [network, mask] = whitelistEntry.split('/');
                // Simple CIDR check (would need proper library for production)
                return clientIP.startsWith(network.split('.').slice(0, parseInt(mask) / 8).join('.'));
            }
            return false;
        });
        
        if (isWhitelisted) {
            return next();
        }
        
        return limiter(req, res, next);
    };
};

module.exports = {
    apiLimiter,
    authLimiter,
    uploadLimiter,
    passwordResetLimiter,
    downloadLimiter,
    adminLimiter,
    searchLimiter,
    roleBasedLimiter,
    progressiveLimiter,
    createUserLimiter,
    createRateLimiter,
    createWhitelistedLimiter
};