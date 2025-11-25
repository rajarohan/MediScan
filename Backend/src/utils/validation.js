const Joi = require('joi');

/**
 * User registration validation schema
 */
const registerSchema = Joi.object({
    name: Joi.string()
        .min(2)
        .max(50)
        .pattern(/^[a-zA-Z\s]+$/)
        .required()
        .messages({
            'string.pattern.base': 'Name can only contain letters and spaces',
            'string.min': 'Name must be at least 2 characters long',
            'string.max': 'Name cannot exceed 50 characters'
        }),
    email: Joi.string()
        .email()
        .required()
        .messages({
            'string.email': 'Please provide a valid email address'
        }),
    password: Joi.string()
        .min(8)
        .max(128)
        .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
        .required()
        .messages({
            'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
            'string.min': 'Password must be at least 8 characters long'
        })
});

/**
 * User login validation schema
 */
const loginSchema = Joi.object({
    email: Joi.string()
        .email()
        .required(),
    password: Joi.string()
        .required()
});

/**
 * Refresh token validation schema
 */
const refreshTokenSchema = Joi.object({
    refreshToken: Joi.string()
        .required()
        .messages({
            'any.required': 'Refresh token is required'
        })
});

/**
 * File upload validation schema
 */
const fileUploadSchema = Joi.object({
    consent: Joi.boolean()
        .valid(true)
        .required()
        .messages({
            'any.only': 'Consent must be explicitly granted for PHI processing'
        }),
    metadata: Joi.object({
        // Medical/patient fields
        patientName: Joi.string().max(100).allow(''),
        reportType: Joi.string().max(50).allow(''),
        reportDate: Joi.date().allow(null),
        notes: Joi.string().max(500).allow(''),
        // File technical metadata
        originalName: Joi.string().max(255).allow(''),
        size: Joi.number().positive().allow(null),
        mimeType: Joi.string().max(100).allow(''),
        uploadedAt: Joi.date().allow(null)
    }).optional()
});

/**
 * File validation
 */
const validateFile = (file) => {
    const allowedTypes = (process.env.ALLOWED_FILE_TYPES || 'pdf,jpg,jpeg,png,tiff,bmp').split(',');
    const maxSize = parseInt(process.env.MAX_FILE_SIZE) || 10485760; // 10MB default
    
    const errors = [];
    
    if (!file) {
        errors.push('File is required');
        return { isValid: false, errors };
    }
    
    // Check file size
    if (file.size > maxSize) {
        errors.push(`File size cannot exceed ${Math.round(maxSize / 1048576)}MB`);
    }
    
    // Check file type
    const fileExtension = file.originalname.split('.').pop().toLowerCase();
    if (!allowedTypes.includes(fileExtension)) {
        errors.push(`File type .${fileExtension} is not allowed. Allowed types: ${allowedTypes.join(', ')}`);
    }
    
    // Check MIME type - be more flexible for mobile uploads
    const allowedMimeTypes = {
        'pdf': ['application/pdf'],
        'jpg': ['image/jpeg', 'image/jpg'],
        'jpeg': ['image/jpeg', 'image/jpg'],
        'png': ['image/png'],
        'tiff': ['image/tiff', 'image/tif'],
        'bmp': ['image/bmp']
    };
    
    // More flexible validation for mobile apps that may report different MIME types
    if (allowedMimeTypes[fileExtension]) {
        const acceptedMimeTypes = allowedMimeTypes[fileExtension];
        const isImageType = file.mimetype.startsWith('image/');
        const isPdfType = file.mimetype === 'application/pdf';
        
        // Allow any image MIME type for image files, and correct PDF type for PDFs
        if (fileExtension === 'pdf' && !isPdfType) {
            errors.push('PDF file type does not match file content');
        } else if (['jpg', 'jpeg', 'png', 'tiff', 'bmp'].includes(fileExtension) && !isImageType) {
            errors.push('Image file type does not match file content');
        }
    }
    
    return {
        isValid: errors.length === 0,
        errors
    };
};

/**
 * Sanitize user input
 */
const sanitizeInput = (input) => {
    if (typeof input === 'string') {
        return input
            .trim()
            .replace(/[<>\"'&]/g, (match) => {
                const entityMap = {
                    '<': '&lt;',
                    '>': '&gt;',
                    '"': '&quot;',
                    "'": '&#39;',
                    '&': '&amp;'
                };
                return entityMap[match];
            });
    }
    return input;
};

/**
 * Validate pagination parameters
 */
const paginationSchema = Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    sortBy: Joi.string().valid('createdAt', 'updatedAt', 'name').default('createdAt'),
    sortOrder: Joi.string().valid('asc', 'desc').default('desc')
});

module.exports = {
    registerSchema,
    loginSchema,
    refreshTokenSchema,
    fileUploadSchema,
    paginationSchema,
    validateFile,
    sanitizeInput
};