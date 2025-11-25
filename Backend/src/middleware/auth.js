const jwt = require('jsonwebtoken');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const { logger } = require('../utils/logger');

/**
 * Authentication middleware to verify JWT tokens
 */
const authenticate = async (req, res, next) => {
    try {
        const authHeader = req.header('Authorization');
        
        if (!authHeader) {
            await AuditLog.logEvent({
                userId: null,
                action: 'login_failed',
                resource: 'User',
                ipAddress: req.ip,
                userAgent: req.get('User-Agent'),
                endpoint: req.originalUrl,
                method: req.method,
                success: false,
                errorCode: 'NO_TOKEN',
                details: { reason: 'No authorization header provided' },
                riskLevel: 'medium'
            });
            
            return res.status(401).json({
                success: false,
                message: 'Access denied. No token provided.',
                code: 'NO_TOKEN'
            });
        }
        
        // Extract token from "Bearer <token>" format
        const token = authHeader.startsWith('Bearer ') 
            ? authHeader.substring(7) 
            : authHeader;
            
        if (!token) {
            await AuditLog.logEvent({
                userId: null,
                action: 'login_failed',
                resource: 'User',
                ipAddress: req.ip,
                userAgent: req.get('User-Agent'),
                endpoint: req.originalUrl,
                method: req.method,
                success: false,
                errorCode: 'INVALID_TOKEN_FORMAT',
                details: { reason: 'Invalid token format' },
                riskLevel: 'medium'
            });
            
            return res.status(401).json({
                success: false,
                message: 'Access denied. Invalid token format.',
                code: 'INVALID_TOKEN_FORMAT'
            });
        }
        
        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Get user from database
        const user = await User.findById(decoded.userId).select('+refreshTokens');
        
        if (!user) {
            await AuditLog.logEvent({
                userId: decoded.userId,
                action: 'login_failed',
                resource: 'User',
                ipAddress: req.ip,
                userAgent: req.get('User-Agent'),
                endpoint: req.originalUrl,
                method: req.method,
                success: false,
                errorCode: 'USER_NOT_FOUND',
                details: { reason: 'User not found' },
                riskLevel: 'high'
            });
            
            return res.status(401).json({
                success: false,
                message: 'Access denied. User not found.',
                code: 'USER_NOT_FOUND'
            });
        }
        
        if (!user.isActive) {
            await AuditLog.logEvent({
                userId: user._id,
                action: 'login_failed',
                resource: 'User',
                ipAddress: req.ip,
                userAgent: req.get('User-Agent'),
                endpoint: req.originalUrl,
                method: req.method,
                success: false,
                errorCode: 'ACCOUNT_INACTIVE',
                details: { reason: 'Account is inactive' },
                riskLevel: 'medium'
            });
            
            return res.status(401).json({
                success: false,
                message: 'Access denied. Account is inactive.',
                code: 'ACCOUNT_INACTIVE'
            });
        }
        
        if (user.isLocked) {
            await AuditLog.logEvent({
                userId: user._id,
                action: 'login_failed',
                resource: 'User',
                ipAddress: req.ip,
                userAgent: req.get('User-Agent'),
                endpoint: req.originalUrl,
                method: req.method,
                success: false,
                errorCode: 'ACCOUNT_LOCKED',
                details: { 
                    reason: 'Account is locked',
                    lockUntil: user.lockUntil
                },
                riskLevel: 'medium'
            });
            
            return res.status(423).json({
                success: false,
                message: 'Account is temporarily locked due to multiple failed login attempts.',
                code: 'ACCOUNT_LOCKED',
                lockUntil: user.lockUntil
            });
        }
        
        // Clean expired refresh tokens
        await user.cleanExpiredTokens();
        
        // Update last login timestamp
        user.lastLogin = new Date();
        await user.save();
        
        // Add user to request object
        req.user = user;
        req.token = token;
        
        next();
        
    } catch (error) {
        let errorCode = 'TOKEN_INVALID';
        let riskLevel = 'medium';
        
        if (error.name === 'TokenExpiredError') {
            errorCode = 'TOKEN_EXPIRED';
            riskLevel = 'low';
        } else if (error.name === 'JsonWebTokenError') {
            errorCode = 'TOKEN_INVALID';
            riskLevel = 'high'; // Potentially malicious
        }
        
        await AuditLog.logEvent({
            userId: null,
            action: 'login_failed',
            resource: 'User',
            ipAddress: req.ip,
            userAgent: req.get('User-Agent'),
            endpoint: req.originalUrl,
            method: req.method,
            success: false,
            errorCode,
            errorMessage: error.message,
            details: { reason: error.message },
            riskLevel
        });
        
        logger.warn('Authentication failed:', {
            error: error.message,
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            endpoint: req.originalUrl
        });
        
        res.status(401).json({
            success: false,
            message: 'Access denied. Invalid or expired token.',
            code: errorCode
        });
    }
};

/**
 * Authorization middleware to check user roles
 */
const authorize = (...roles) => {
    return async (req, res, next) => {
        try {
            if (!req.user) {
                return res.status(401).json({
                    success: false,
                    message: 'Authentication required.',
                    code: 'AUTH_REQUIRED'
                });
            }
            
            if (roles.length && !roles.includes(req.user.role)) {
                await AuditLog.logEvent({
                    userId: req.user._id,
                    action: 'access_denied',
                    resource: 'System',
                    ipAddress: req.ip,
                    userAgent: req.get('User-Agent'),
                    endpoint: req.originalUrl,
                    method: req.method,
                    success: false,
                    errorCode: 'INSUFFICIENT_PRIVILEGES',
                    details: { 
                        userRole: req.user.role,
                        requiredRoles: roles 
                    },
                    riskLevel: 'medium'
                });
                
                return res.status(403).json({
                    success: false,
                    message: 'Access denied. Insufficient privileges.',
                    code: 'INSUFFICIENT_PRIVILEGES'
                });
            }
            
            next();
        } catch (error) {
            logger.error('Authorization error:', error);
            res.status(500).json({
                success: false,
                message: 'Authorization check failed.',
                code: 'AUTH_ERROR'
            });
        }
    };
};

/**
 * Optional authentication - doesn't fail if no token provided
 */
const optionalAuth = async (req, res, next) => {
    try {
        const authHeader = req.header('Authorization');
        
        if (!authHeader) {
            return next();
        }
        
        const token = authHeader.startsWith('Bearer ') 
            ? authHeader.substring(7) 
            : authHeader;
            
        if (!token) {
            return next();
        }
        
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const user = await User.findById(decoded.userId);
            
            if (user && user.isActive && !user.isLocked) {
                req.user = user;
                req.token = token;
            }
        } catch (error) {
            // Silently ignore invalid tokens for optional auth
            logger.debug('Optional auth token invalid:', error.message);
        }
        
        next();
    } catch (error) {
        logger.error('Optional auth error:', error);
        next();
    }
};

/**
 * Resource ownership middleware
 */
const requireOwnership = (resourceModel, resourceIdParam = 'id') => {
    return async (req, res, next) => {
        try {
            const resourceId = req.params[resourceIdParam];
            const resource = await resourceModel.findById(resourceId);
            
            if (!resource) {
                return res.status(404).json({
                    success: false,
                    message: 'Resource not found.',
                    code: 'RESOURCE_NOT_FOUND'
                });
            }
            
            // Check if user owns the resource or is admin
            if (resource.userId?.toString() !== req.user._id.toString() && 
                req.user.role !== 'admin') {
                
                await AuditLog.logEvent({
                    userId: req.user._id,
                    action: 'access_denied',
                    resource: resourceModel.modelName,
                    resourceId: resource._id,
                    ipAddress: req.ip,
                    userAgent: req.get('User-Agent'),
                    endpoint: req.originalUrl,
                    method: req.method,
                    success: false,
                    errorCode: 'RESOURCE_ACCESS_DENIED',
                    details: { 
                        resourceOwner: resource.userId,
                        requestingUser: req.user._id
                    },
                    riskLevel: 'high'
                });
                
                return res.status(403).json({
                    success: false,
                    message: 'Access denied. You do not own this resource.',
                    code: 'RESOURCE_ACCESS_DENIED'
                });
            }
            
            req.resource = resource;
            next();
        } catch (error) {
            logger.error('Resource ownership check error:', error);
            res.status(500).json({
                success: false,
                message: 'Resource ownership check failed.',
                code: 'OWNERSHIP_CHECK_ERROR'
            });
        }
    };
};

module.exports = {
    authenticate,
    authorize,
    optionalAuth,
    requireOwnership
};