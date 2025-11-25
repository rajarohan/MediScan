const mongoose = require('mongoose');

const fileSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    filename: {
        type: String,
        required: true
    },
    originalName: {
        type: String,
        required: true
    },
    mimeType: {
        type: String,
        required: true
    },
    size: {
        type: Number,
        required: true
    },
    checksum: {
        type: String,
        required: true,
        unique: true // Prevent duplicate uploads
    },
    storageLocation: {
        type: String,
        required: true
    },
    storageType: {
        type: String,
        enum: ['local', 's3', 'gcs'],
        required: true
    },
    metadata: {
        patientName: String,
        reportType: String,
        reportDate: Date,
        notes: String,
        uploadedFrom: {
            ip: String,
            userAgent: String,
            location: {
                city: String,
                country: String
            }
        }
    },
    status: {
        type: String,
        enum: ['uploaded', 'processing', 'completed', 'failed', 'deleted'],
        default: 'uploaded',
        index: true
    },
    processingJob: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ProcessingJob'
    },
    // Extracted text data from frontend
    extractedText: {
        type: String,
        default: null
    },
    textExtractionData: {
        extractedAt: Date,
        extractionModel: String,
        textLength: Number,
        extractionMethod: {
            type: String,
            enum: ['frontend', 'backend', 'ocr'],
            default: 'frontend'
        }
    },
    tags: [String],
    isEncrypted: {
        type: Boolean,
        default: false
    },
    encryptionKeyId: String,
    accessLog: [{
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        action: {
            type: String,
            enum: ['view', 'download', 'share', 'delete']
        },
        timestamp: {
            type: Date,
            default: Date.now
        },
        ip: String,
        userAgent: String
    }],
    sharingSettings: {
        isShared: {
            type: Boolean,
            default: false
        },
        sharedWith: [{
            userId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User'
            },
            permissions: [{
                type: String,
                enum: ['view', 'download', 'comment']
            }],
            sharedAt: {
                type: Date,
                default: Date.now
            },
            expiresAt: Date
        }],
        shareToken: String,
        shareExpires: Date
    },
    retention: {
        policy: {
            type: String,
            enum: ['default', 'extended', 'permanent'],
            default: 'default'
        },
        deleteAfter: Date,
        isProtected: {
            type: Boolean,
            default: false
        }
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Indexes for efficient queries
fileSchema.index({ userId: 1, createdAt: -1 });
fileSchema.index({ status: 1 });
fileSchema.index({ checksum: 1 });
fileSchema.index({ 'retention.deleteAfter': 1 });
fileSchema.index({ 'metadata.reportType': 1 });
fileSchema.index({ 'metadata.reportDate': -1 });

// Virtual for file URL (if needed)
fileSchema.virtual('url').get(function() {
    if (this.storageType === 's3') {
        return `https://${process.env.S3_BUCKET_NAME}.s3.amazonaws.com/${this.storageLocation}`;
    }
    return `/uploads/${this.storageLocation}`;
});

// Virtual for file size in human readable format
fileSchema.virtual('sizeFormatted').get(function() {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (this.size === 0) return '0 Bytes';
    const i = Math.floor(Math.log(this.size) / Math.log(1024));
    return Math.round(this.size / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
});

// Method to log file access
fileSchema.methods.logAccess = function(userId, action, metadata = {}) {
    this.accessLog.push({
        userId,
        action,
        ip: metadata.ip,
        userAgent: metadata.userAgent,
        timestamp: new Date()
    });
    
    // Keep only last 100 access logs per file
    if (this.accessLog.length > 100) {
        this.accessLog = this.accessLog.slice(-100);
    }
    
    return this.save();
};

// Method to check if user has access to file
fileSchema.methods.hasAccess = function(userId, permission = 'view') {
    // Owner always has access
    if (this.userId.toString() === userId.toString()) {
        return true;
    }
    
    // Check if file is shared with user
    if (this.sharingSettings.isShared) {
        const sharedEntry = this.sharingSettings.sharedWith.find(
            entry => entry.userId.toString() === userId.toString()
        );
        
        if (sharedEntry) {
            // Check if sharing hasn't expired
            if (sharedEntry.expiresAt && sharedEntry.expiresAt < new Date()) {
                return false;
            }
            
            // Check if user has required permission
            return sharedEntry.permissions.includes(permission);
        }
    }
    
    return false;
};

// Method to set retention policy
fileSchema.methods.setRetentionPolicy = function(policy, customDate = null) {
    this.retention.policy = policy;
    
    const retentionPeriods = {
        'default': parseInt(process.env.FILE_RETENTION_DEFAULT) || 365 * 24 * 60 * 60 * 1000, // 1 year
        'extended': parseInt(process.env.FILE_RETENTION_EXTENDED) || 7 * 365 * 24 * 60 * 60 * 1000, // 7 years
        'permanent': null
    };
    
    if (policy === 'permanent') {
        this.retention.deleteAfter = null;
    } else if (customDate) {
        this.retention.deleteAfter = customDate;
    } else {
        const period = retentionPeriods[policy];
        this.retention.deleteAfter = new Date(Date.now() + period);
    }
    
    return this.save();
};

// Pre-remove middleware to cleanup associated data
fileSchema.pre('remove', async function(next) {
    try {
        // Remove associated processing job
        if (this.processingJob) {
            await mongoose.model('ProcessingJob').findByIdAndDelete(this.processingJob);
        }
        
        // Log deletion in audit trail
        const AuditLog = mongoose.model('AuditLog');
        await AuditLog.create({
            userId: this.userId,
            action: 'file_deleted',
            resource: 'File',
            resourceId: this._id,
            details: {
                filename: this.originalName,
                size: this.size,
                storageLocation: this.storageLocation
            }
        });
        
        next();
    } catch (error) {
        next(error);
    }
});

module.exports = mongoose.model('File', fileSchema);