require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const path = require('path');

const connectDB = require('./config/db');
const { connectRedis } = require('./config/redis');
const { logger } = require('./utils/logger');
const { apiLimiter } = require('./middleware/rateLimiting');

// Import routes
const authRoutes = require('./routes/auth');
const fileRoutes = require('./routes/files');
const internalRoutes = require('./routes/internal');

const app = express();

// Trust proxy for accurate IP addresses
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https:"],
        },
    },
}));

// CORS configuration
const corsOptions = {
    origin: function (origin, callback) {
        const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',');
        
        // Allow requests with no origin (mobile apps, curl, etc.)
        if (!origin) return callback(null, true);
        
        if (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development') {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    optionsSuccessStatus: 200,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Signature']
};

app.use(cors(corsOptions));

// Compression middleware
app.use(compression());

// Request parsing middleware
app.use(express.json({ 
    limit: process.env.REQUEST_BODY_LIMIT || '10mb',
    verify: (req, res, buf) => {
        req.rawBody = buf;
    }
}));
app.use(express.urlencoded({ extended: true, limit: process.env.REQUEST_BODY_LIMIT || '10mb' }));

// Logging middleware
const morganFormat = process.env.NODE_ENV === 'production' 
    ? 'combined' 
    : 'dev';
    
app.use(morgan(morganFormat, {
    stream: {
        write: (message) => logger.info(message.trim())
    }
}));

// Rate limiting
app.use('/api/', apiLimiter);

// Static files for uploaded content (with authentication)
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// API Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/files', fileRoutes);
app.use('/api/v1/internal', internalRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        success: true,
        message: 'MediScan Backend API is running',
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0',
        environment: process.env.NODE_ENV || 'development'
    });
});

// API documentation endpoint
app.get('/api/v1', (req, res) => {
    res.json({
        success: true,
        message: 'MediScan API v1.0',
        documentation: 'https://api.mediscan.com/docs',
        endpoints: {
            authentication: {
                register: 'POST /api/v1/auth/register',
                login: 'POST /api/v1/auth/login',
                refresh: 'POST /api/v1/auth/refresh',
                logout: 'POST /api/v1/auth/logout',
                profile: 'GET /api/v1/auth/profile'
            },
            files: {
                upload: 'POST /api/v1/files',
                status: 'GET /api/v1/files/:fileId/status',
                result: 'GET /api/v1/files/:fileId/result'
            },
            internal: {
                health: 'GET /api/v1/internal/health',
                aiCallback: 'POST /api/v1/internal/ai/callback'
            }
        }
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'API endpoint not found',
        code: 'ENDPOINT_NOT_FOUND',
        requestedUrl: req.originalUrl,
        method: req.method
    });
});

// Global error handler
app.use((error, req, res, next) => {
    logger.error('Global error handler:', {
        error: error.message,
        stack: error.stack,
        url: req.originalUrl,
        method: req.method,
        ip: req.ip,
        userAgent: req.get('User-Agent')
    });
    
    // Mongoose validation error
    if (error.name === 'ValidationError') {
        const errors = Object.values(error.errors).map(err => ({
            field: err.path,
            message: err.message
        }));
        
        return res.status(400).json({
            success: false,
            message: 'Validation error',
            code: 'VALIDATION_ERROR',
            details: errors
        });
    }
    
    // Mongoose duplicate key error
    if (error.code === 11000) {
        const field = Object.keys(error.keyValue)[0];
        return res.status(409).json({
            success: false,
            message: `${field} already exists`,
            code: 'DUPLICATE_ERROR',
            field
        });
    }
    
    // JWT errors
    if (error.name === 'JsonWebTokenError') {
        return res.status(401).json({
            success: false,
            message: 'Invalid token',
            code: 'INVALID_TOKEN'
        });
    }
    
    if (error.name === 'TokenExpiredError') {
        return res.status(401).json({
            success: false,
            message: 'Token expired',
            code: 'TOKEN_EXPIRED'
        });
    }
    
    // Multer errors (file upload)
    if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({
            success: false,
            message: 'File too large',
            code: 'FILE_TOO_LARGE',
            maxSize: process.env.MAX_FILE_SIZE || '10MB'
        });
    }
    
    if (error.code === 'LIMIT_UNEXPECTED_FILE') {
        return res.status(400).json({
            success: false,
            message: 'Unexpected file field',
            code: 'UNEXPECTED_FILE'
        });
    }
    
    // CORS error
    if (error.message && error.message.includes('CORS')) {
        return res.status(403).json({
            success: false,
            message: 'CORS policy violation',
            code: 'CORS_ERROR'
        });
    }
    
    // Default server error
    const statusCode = error.statusCode || error.status || 500;
    const message = process.env.NODE_ENV === 'production' 
        ? 'Internal server error' 
        : error.message;
    
    res.status(statusCode).json({
        success: false,
        message,
        code: 'INTERNAL_ERROR',
        ...(process.env.NODE_ENV === 'development' && {
            stack: error.stack,
            details: error
        })
    });
});

// Database connection
connectDB();

// Redis connection (optional)
connectRedis().catch(error => {
    logger.warn('Redis connection failed, continuing without Redis:', error.message);
});

// Start server
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
    logger.info(`MediScan Backend Server running on port ${PORT}`, {
        environment: process.env.NODE_ENV || 'development',
        port: PORT,
        pid: process.pid
    });
});

// Graceful shutdown
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

function gracefulShutdown() {
    logger.info('Received shutdown signal, closing server...');
    
    server.close(() => {
        logger.info('HTTP server closed');
        
        // Close database connection
        require('mongoose').connection.close().then(() => {
            logger.info('Database connection closed');
        }).catch(err => {
            logger.error('Error closing database connection:', err);
        });
        
        // Close Redis connection
        const { closeRedis } = require('./config/redis');
        closeRedis().then(() => {
            logger.info('Redis connection closed');
            process.exit(0);
        }).catch(() => {
            process.exit(0);
        });
    });
    
    // Force close after 10 seconds
    setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
    }, 10000);
}

module.exports = app;