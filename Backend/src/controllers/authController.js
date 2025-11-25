const jwt = require('jsonwebtoken');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const { logger, logAuditEvent } = require('../utils/logger');
const { 
    registerSchema, 
    loginSchema, 
    refreshTokenSchema,
    sanitizeInput 
} = require('../utils/validation');
const { generateSecureToken } = require('../utils/crypto');

/**
 * Generate JWT tokens
 */
const generateTokens = (userId) => {
    const accessToken = jwt.sign(
        { userId },
        process.env.JWT_SECRET,
        { 
            expiresIn: process.env.JWT_EXPIRES_IN || '15m',
            issuer: 'mediscan-api',
            audience: 'mediscan-client'
        }
    );
    
    const refreshToken = jwt.sign(
        { userId, tokenId: generateSecureToken(16) },
        process.env.JWT_REFRESH_SECRET,
        { 
            expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
            issuer: 'mediscan-api',
            audience: 'mediscan-client'
        }
    );
    
    return { accessToken, refreshToken };
};

/**
 * User Registration
 */
const register = async (req, res) => {
    try {
        // Validate input
        const { error, value } = registerSchema.validate(req.body);
        if (error) {
            return res.status(400).json({
                success: false,
                message: 'Validation error',
                code: 'VALIDATION_ERROR',
                details: error.details.map(detail => ({
                    field: detail.path[0],
                    message: detail.message
                }))
            });
        }
        
        const { name, email, password } = value;
        
        // Sanitize inputs
        const sanitizedName = sanitizeInput(name);
        const sanitizedEmail = sanitizeInput(email.toLowerCase());
        
        // Check if user already exists
        const existingUser = await User.findOne({ email: sanitizedEmail });
        if (existingUser) {
            await AuditLog.logEvent({
                userId: null,
                action: 'registration_failed',
                resource: 'User',
                ipAddress: req.ip,
                userAgent: req.get('User-Agent'),
                endpoint: req.originalUrl,
                method: req.method,
                success: false,
                errorCode: 'EMAIL_ALREADY_EXISTS',
                details: { email: sanitizedEmail },
                riskLevel: 'low'
            });
            
            return res.status(409).json({
                success: false,
                message: 'User with this email already exists',
                code: 'EMAIL_ALREADY_EXISTS'
            });
        }
        
        // Create user
        const user = new User({
            name: sanitizedName,
            email: sanitizedEmail,
            password,
            emailVerificationToken: generateSecureToken(),
            profile: {},
            preferences: {
                notifications: { email: true, push: true, sms: false },
                language: 'en',
                timezone: 'UTC'
            }
        });
        
        await user.save();
        
        // Generate tokens
        const { accessToken, refreshToken } = generateTokens(user._id);
        
        // Store refresh token
        await user.addRefreshToken(refreshToken);
        
        // Log successful registration
        await AuditLog.logEvent({
            userId: user._id,
            action: 'user_created',
            resource: 'User',
            resourceId: user._id,
            ipAddress: req.ip,
            userAgent: req.get('User-Agent'),
            endpoint: req.originalUrl,
            method: req.method,
            success: true,
            details: { 
                email: user.email,
                name: user.name,
                role: user.role
            },
            riskLevel: 'low'
        });
        
        logger.info('User registered successfully:', {
            userId: user._id,
            email: user.email,
            ip: req.ip
        });
        
        // Return success response (exclude sensitive data)
        res.status(201).json({
            success: true,
            message: 'User registered successfully',
            data: {
                user: {
                    id: user._id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    emailVerified: user.emailVerified,
                    createdAt: user.createdAt
                },
                tokens: {
                    accessToken,
                    refreshToken,
                    expiresIn: 900 // 15 minutes in seconds
                }
            }
        });
        
    } catch (error) {
        logger.error('Registration error:', error);
        
        await AuditLog.logEvent({
            userId: null,
            action: 'registration_failed',
            resource: 'User',
            ipAddress: req.ip,
            userAgent: req.get('User-Agent'),
            endpoint: req.originalUrl,
            method: req.method,
            success: false,
            errorCode: 'INTERNAL_ERROR',
            errorMessage: error.message,
            details: { error: error.message },
            riskLevel: 'medium'
        });
        
        res.status(500).json({
            success: false,
            message: 'Registration failed',
            code: 'REGISTRATION_ERROR'
        });
    }
};

/**
 * User Login
 */
const login = async (req, res) => {
    try {
        // Validate input
        const { error, value } = loginSchema.validate(req.body);
        if (error) {
            return res.status(400).json({
                success: false,
                message: 'Validation error',
                code: 'VALIDATION_ERROR',
                details: error.details.map(detail => ({
                    field: detail.path[0],
                    message: detail.message
                }))
            });
        }
        
        const { email, password } = value;
        const sanitizedEmail = sanitizeInput(email.toLowerCase());
        
        // Find user and include password for comparison
        const user = await User.findOne({ email: sanitizedEmail })
            .select('+password +refreshTokens +loginAttempts +lockUntil');
        
        if (!user) {
            await AuditLog.logEvent({
                userId: null,
                action: 'login_failed',
                resource: 'User',
                ipAddress: req.ip,
                userAgent: req.get('User-Agent'),
                endpoint: req.originalUrl,
                method: req.method,
                success: false,
                errorCode: 'INVALID_CREDENTIALS',
                details: { email: sanitizedEmail },
                riskLevel: 'medium'
            });
            
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password',
                code: 'INVALID_CREDENTIALS'
            });
        }
        
        // Check if account is locked
        if (user.isLocked) {
            await AuditLog.logEvent({
                userId: user._id,
                action: 'login_failed',
                resource: 'User',
                resourceId: user._id,
                ipAddress: req.ip,
                userAgent: req.get('User-Agent'),
                endpoint: req.originalUrl,
                method: req.method,
                success: false,
                errorCode: 'ACCOUNT_LOCKED',
                details: { lockUntil: user.lockUntil },
                riskLevel: 'high'
            });
            
            return res.status(423).json({
                success: false,
                message: 'Account is temporarily locked due to multiple failed login attempts',
                code: 'ACCOUNT_LOCKED',
                lockUntil: user.lockUntil
            });
        }
        
        // Check if account is active
        if (!user.isActive) {
            await AuditLog.logEvent({
                userId: user._id,
                action: 'login_failed',
                resource: 'User',
                resourceId: user._id,
                ipAddress: req.ip,
                userAgent: req.get('User-Agent'),
                endpoint: req.originalUrl,
                method: req.method,
                success: false,
                errorCode: 'ACCOUNT_INACTIVE',
                details: {},
                riskLevel: 'medium'
            });
            
            return res.status(401).json({
                success: false,
                message: 'Account is inactive',
                code: 'ACCOUNT_INACTIVE'
            });
        }
        
        // Verify password
        const isValidPassword = await user.comparePassword(password);
        
        if (!isValidPassword) {
            // Increment login attempts
            await user.incLoginAttempts();
            
            await AuditLog.logEvent({
                userId: user._id,
                action: 'login_failed',
                resource: 'User',
                resourceId: user._id,
                ipAddress: req.ip,
                userAgent: req.get('User-Agent'),
                endpoint: req.originalUrl,
                method: req.method,
                success: false,
                errorCode: 'INVALID_CREDENTIALS',
                details: { 
                    loginAttempts: (user.loginAttempts || 0) + 1
                },
                riskLevel: 'medium'
            });
            
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password',
                code: 'INVALID_CREDENTIALS'
            });
        }
        
        // Successful login - reset login attempts
        if (user.loginAttempts) {
            await user.resetLoginAttempts();
        }
        
        // Generate tokens
        const { accessToken, refreshToken } = generateTokens(user._id);
        
        // Store refresh token
        await user.addRefreshToken(refreshToken);
        
        // Update last login
        user.lastLogin = new Date();
        await user.save();
        
        // Log successful login
        await AuditLog.logEvent({
            userId: user._id,
            action: 'login',
            resource: 'User',
            resourceId: user._id,
            ipAddress: req.ip,
            userAgent: req.get('User-Agent'),
            endpoint: req.originalUrl,
            method: req.method,
            success: true,
            details: { 
                email: user.email,
                lastLogin: user.lastLogin
            },
            riskLevel: 'low'
        });
        
        logger.info('User logged in successfully:', {
            userId: user._id,
            email: user.email,
            ip: req.ip
        });
        
        res.json({
            success: true,
            message: 'Login successful',
            data: {
                user: {
                    id: user._id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    emailVerified: user.emailVerified,
                    lastLogin: user.lastLogin
                },
                tokens: {
                    accessToken,
                    refreshToken,
                    expiresIn: 900 // 15 minutes in seconds
                }
            }
        });
        
    } catch (error) {
        logger.error('Login error:', error);
        
        await AuditLog.logEvent({
            userId: null,
            action: 'login_failed',
            resource: 'User',
            ipAddress: req.ip,
            userAgent: req.get('User-Agent'),
            endpoint: req.originalUrl,
            method: req.method,
            success: false,
            errorCode: 'INTERNAL_ERROR',
            errorMessage: error.message,
            details: { error: error.message },
            riskLevel: 'high'
        });
        
        res.status(500).json({
            success: false,
            message: 'Login failed',
            code: 'LOGIN_ERROR'
        });
    }
};

/**
 * Refresh Token
 */
const refreshToken = async (req, res) => {
    try {
        // Validate input
        const { error, value } = refreshTokenSchema.validate(req.body);
        if (error) {
            return res.status(400).json({
                success: false,
                message: 'Validation error',
                code: 'VALIDATION_ERROR',
                details: error.details.map(detail => ({
                    field: detail.path[0],
                    message: detail.message
                }))
            });
        }
        
        const { refreshToken: token } = value;
        
        // Verify refresh token
        const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
        
        // Find user with this refresh token
        const user = await User.findOne({
            _id: decoded.userId,
            'refreshTokens.token': token
        }).select('+refreshTokens');
        
        if (!user) {
            await AuditLog.logEvent({
                userId: decoded.userId,
                action: 'token_refresh_failed',
                resource: 'User',
                ipAddress: req.ip,
                userAgent: req.get('User-Agent'),
                endpoint: req.originalUrl,
                method: req.method,
                success: false,
                errorCode: 'INVALID_REFRESH_TOKEN',
                details: { reason: 'User not found or token not in database' },
                riskLevel: 'high'
            });
            
            return res.status(403).json({
                success: false,
                message: 'Invalid refresh token',
                code: 'INVALID_REFRESH_TOKEN'
            });
        }
        
        // Check if user is active
        if (!user.isActive) {
            await AuditLog.logEvent({
                userId: user._id,
                action: 'token_refresh_failed',
                resource: 'User',
                resourceId: user._id,
                ipAddress: req.ip,
                userAgent: req.get('User-Agent'),
                endpoint: req.originalUrl,
                method: req.method,
                success: false,
                errorCode: 'ACCOUNT_INACTIVE',
                details: {},
                riskLevel: 'medium'
            });
            
            return res.status(401).json({
                success: false,
                message: 'Account is inactive',
                code: 'ACCOUNT_INACTIVE'
            });
        }
        
        // Remove old refresh token
        await user.removeRefreshToken(token);
        
        // Generate new tokens
        const { accessToken, refreshToken: newRefreshToken } = generateTokens(user._id);
        
        // Store new refresh token
        await user.addRefreshToken(newRefreshToken);
        
        // Log token refresh
        await AuditLog.logEvent({
            userId: user._id,
            action: 'token_refreshed',
            resource: 'User',
            resourceId: user._id,
            ipAddress: req.ip,
            userAgent: req.get('User-Agent'),
            endpoint: req.originalUrl,
            method: req.method,
            success: true,
            details: {},
            riskLevel: 'low'
        });
        
        res.json({
            success: true,
            message: 'Token refreshed successfully',
            data: {
                tokens: {
                    accessToken,
                    refreshToken: newRefreshToken,
                    expiresIn: 900 // 15 minutes in seconds
                }
            }
        });
        
    } catch (error) {
        let errorCode = 'TOKEN_REFRESH_ERROR';
        let riskLevel = 'medium';
        
        if (error.name === 'TokenExpiredError') {
            errorCode = 'REFRESH_TOKEN_EXPIRED';
            riskLevel = 'low';
        } else if (error.name === 'JsonWebTokenError') {
            errorCode = 'INVALID_REFRESH_TOKEN';
            riskLevel = 'high';
        }
        
        logger.error('Token refresh error:', error);
        
        await AuditLog.logEvent({
            userId: null,
            action: 'token_refresh_failed',
            resource: 'User',
            ipAddress: req.ip,
            userAgent: req.get('User-Agent'),
            endpoint: req.originalUrl,
            method: req.method,
            success: false,
            errorCode,
            errorMessage: error.message,
            details: { error: error.message },
            riskLevel
        });
        
        res.status(403).json({
            success: false,
            message: 'Token refresh failed',
            code: errorCode
        });
    }
};

/**
 * Logout
 */
const logout = async (req, res) => {
    try {
        const user = req.user;
        const token = req.token;
        
        // If refresh token provided in body, remove it
        const { refreshToken: refreshTokenToRemove } = req.body;
        
        if (refreshTokenToRemove) {
            await user.removeRefreshToken(refreshTokenToRemove);
        }
        
        // Log logout
        await AuditLog.logEvent({
            userId: user._id,
            action: 'logout',
            resource: 'User',
            resourceId: user._id,
            ipAddress: req.ip,
            userAgent: req.get('User-Agent'),
            endpoint: req.originalUrl,
            method: req.method,
            success: true,
            details: {},
            riskLevel: 'low'
        });
        
        logger.info('User logged out:', {
            userId: user._id,
            email: user.email,
            ip: req.ip
        });
        
        res.json({
            success: true,
            message: 'Logged out successfully'
        });
        
    } catch (error) {
        logger.error('Logout error:', error);
        
        res.status(500).json({
            success: false,
            message: 'Logout failed',
            code: 'LOGOUT_ERROR'
        });
    }
};

/**
 * Logout from all devices
 */
const logoutAll = async (req, res) => {
    try {
        const user = req.user;
        
        // Clear all refresh tokens
        user.refreshTokens = [];
        await user.save();
        
        // Log logout all
        await AuditLog.logEvent({
            userId: user._id,
            action: 'logout_all_devices',
            resource: 'User',
            resourceId: user._id,
            ipAddress: req.ip,
            userAgent: req.get('User-Agent'),
            endpoint: req.originalUrl,
            method: req.method,
            success: true,
            details: {},
            riskLevel: 'medium'
        });
        
        logger.info('User logged out from all devices:', {
            userId: user._id,
            email: user.email,
            ip: req.ip
        });
        
        res.json({
            success: true,
            message: 'Logged out from all devices successfully'
        });
        
    } catch (error) {
        logger.error('Logout all error:', error);
        
        res.status(500).json({
            success: false,
            message: 'Logout from all devices failed',
            code: 'LOGOUT_ALL_ERROR'
        });
    }
};

/**
 * Get current user profile
 */
const getProfile = async (req, res) => {
    try {
        const user = req.user;
        
        // Log profile access
        await AuditLog.logEvent({
            userId: user._id,
            action: 'profile_viewed',
            resource: 'User',
            resourceId: user._id,
            ipAddress: req.ip,
            userAgent: req.get('User-Agent'),
            endpoint: req.originalUrl,
            method: req.method,
            success: true,
            details: {},
            riskLevel: 'low'
        });
        
        res.json({
            success: true,
            message: 'Profile retrieved successfully',
            data: {
                user: {
                    id: user._id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    emailVerified: user.emailVerified,
                    profile: user.profile,
                    preferences: user.preferences,
                    lastLogin: user.lastLogin,
                    createdAt: user.createdAt,
                    updatedAt: user.updatedAt
                }
            }
        });
        
    } catch (error) {
        logger.error('Get profile error:', error);
        
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve profile',
            code: 'PROFILE_ERROR'
        });
    }
};

module.exports = {
    register,
    login,
    refreshToken,
    logout,
    logoutAll,
    getProfile
};