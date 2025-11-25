const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: false, // Allow null for events like registration failures
        index: true
    },
    action: {
        type: String,
        required: true,
        enum: [
            // Authentication actions
            'login', 'logout', 'login_failed', 'password_reset', 'account_locked', 'registration_failed', 'token_refreshed', 'token_refresh_failed',
            // Profile actions
            'profile_viewed', 'profile_updated',
            // File listing actions
            'files_listed',
            // File actions
            'file_upload', 'file_view', 'file_download', 'file_delete', 'file_share', 'file_accessed',
            // Processing actions
            'processing_started', 'processing_completed', 'processing_failed',
            // Admin actions
            'user_created', 'user_updated', 'user_deleted', 'role_changed',
            // System actions
            'system_backup', 'system_restore', 'config_changed',
            // Data actions
            'data_export', 'data_import', 'data_purge',
            // Privacy actions
            'consent_given', 'consent_withdrawn', 'data_anonymized'
        ],
        index: true
    },
    resource: {
        type: String,
        required: true,
        enum: ['User', 'File', 'ProcessingJob', 'System', 'Report', 'Audit']
    },
    resourceId: {
        type: mongoose.Schema.Types.ObjectId,
        index: true
    },
    ipAddress: {
        type: String,
        required: true
    },
    userAgent: String,
    location: {
        country: String,
        region: String,
        city: String,
        coordinates: {
            lat: Number,
            lng: Number
        }
    },
    sessionId: String,
    requestId: String,
    method: {
        type: String,
        enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']
    },
    endpoint: String,
    statusCode: Number,
    responseTime: Number, // in milliseconds
    details: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    riskLevel: {
        type: String,
        enum: ['low', 'medium', 'high', 'critical'],
        default: 'low',
        index: true
    },
    dataClassification: {
        type: String,
        enum: ['public', 'internal', 'confidential', 'restricted'],
        default: 'internal'
    },
    complianceFlags: [{
        type: {
            type: String,
            enum: ['hipaa', 'gdpr', 'ccpa', 'sox', 'pci']
        },
        triggered: {
            type: Boolean,
            default: false
        },
        details: String
    }],
    phiAccessed: {
        type: Boolean,
        default: false,
        index: true
    },
    phiTypes: [{
        type: String,
        enum: [
            'name', 'address', 'date_of_birth', 'phone', 'email', 'ssn',
            'medical_record_number', 'account_number', 'certificate_number',
            'health_plan_number', 'device_identifier', 'biometric_identifier',
            'photo', 'medical_data', 'diagnosis', 'treatment', 'medication'
        ]
    }],
    success: {
        type: Boolean,
        required: true,
        index: true
    },
    errorCode: String,
    errorMessage: String,
    correlationId: String, // For tracking related events
    parentAuditId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AuditLog'
    },
    tags: [String], // For custom categorization
    retentionPolicy: {
        deleteAfter: Date,
        isProtected: {
            type: Boolean,
            default: false
        }
    }
}, {
    timestamps: { createdAt: true, updatedAt: false }, // Audit logs should never be updated
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Indexes for efficient querying and compliance reporting
auditLogSchema.index({ createdAt: -1 }); // Most recent first
auditLogSchema.index({ userId: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ riskLevel: 1, createdAt: -1 });
auditLogSchema.index({ phiAccessed: 1, createdAt: -1 });
auditLogSchema.index({ success: 1, createdAt: -1 });
auditLogSchema.index({ 'complianceFlags.type': 1, createdAt: -1 });
auditLogSchema.index({ correlationId: 1 });
auditLogSchema.index({ 'retentionPolicy.deleteAfter': 1 });

// TTL index for automatic cleanup (7 years for HIPAA compliance)
auditLogSchema.index(
    { 'retentionPolicy.deleteAfter': 1 }, 
    { expireAfterSeconds: 0 }
);

// Virtual for formatted timestamp
auditLogSchema.virtual('formattedTimestamp').get(function() {
    return this.createdAt.toISOString();
});

// Virtual for event severity based on risk level and success
auditLogSchema.virtual('severity').get(function() {
    if (!this.success && this.riskLevel === 'critical') return 'emergency';
    if (!this.success && this.riskLevel === 'high') return 'alert';
    if (!this.success && this.riskLevel === 'medium') return 'warning';
    if (!this.success) return 'error';
    if (this.riskLevel === 'high' || this.riskLevel === 'critical') return 'notice';
    return 'info';
});

// Static method to log audit event
auditLogSchema.statics.logEvent = async function(data) {
    try {
        // Set default retention policy (7 years for medical records)
        if (!data.retentionPolicy) {
            data.retentionPolicy = {
                deleteAfter: new Date(Date.now() + (parseInt(process.env.AUDIT_LOG_RETENTION) || 7 * 365 * 24 * 60 * 60 * 1000)), // 7 years default
                isProtected: data.phiAccessed || data.riskLevel === 'critical'
            };
        }
        
        // Determine risk level based on action and context
        if (!data.riskLevel) {
            data.riskLevel = this.calculateRiskLevel(data);
        }
        
        // Check for PHI access patterns
        if (!data.phiAccessed) {
            data.phiAccessed = this.detectPHIAccess(data);
        }
        
        const auditEntry = new this(data);
        await auditEntry.save();
        
        // Trigger alerts for high-risk events
        if (data.riskLevel === 'critical' || data.riskLevel === 'high') {
            await this.triggerSecurityAlert(auditEntry);
        }
        
        return auditEntry;
    } catch (error) {
        // Audit logging should not break application flow
        console.error('Failed to create audit log:', error);
        return null;
    }
};

// Calculate risk level based on action and context
auditLogSchema.statics.calculateRiskLevel = function(data) {
    const highRiskActions = [
        'login_failed', 'account_locked', 'file_delete', 'user_deleted', 
        'role_changed', 'data_purge', 'consent_withdrawn'
    ];
    
    const mediumRiskActions = [
        'password_reset', 'file_share', 'processing_failed', 'data_export'
    ];
    
    if (highRiskActions.includes(data.action)) return 'high';
    if (mediumRiskActions.includes(data.action)) return 'medium';
    if (!data.success) return 'medium';
    if (data.phiAccessed) return 'medium';
    
    return 'low';
};

// Detect PHI access based on action and resource
auditLogSchema.statics.detectPHIAccess = function(data) {
    const phiActions = [
        'file_view', 'file_download', 'processing_completed', 
        'data_export', 'file_share'
    ];
    
    return phiActions.includes(data.action) && 
           ['File', 'ProcessingJob', 'Report'].includes(data.resource);
};

// Trigger security alerts for high-risk events
auditLogSchema.statics.triggerSecurityAlert = async function(auditEntry) {
    // This would integrate with alerting system (email, Slack, PagerDuty, etc.)
    console.warn('Security Alert:', {
        userId: auditEntry.userId,
        action: auditEntry.action,
        riskLevel: auditEntry.riskLevel,
        timestamp: auditEntry.createdAt,
        details: auditEntry.details
    });
    
    // Could implement additional logic here:
    // - Send notifications to security team
    // - Temporarily lock accounts for suspicious activity
    // - Trigger automated incident response
};

// Static method for compliance reporting
auditLogSchema.statics.generateComplianceReport = async function(startDate, endDate, complianceType) {
    const pipeline = [
        {
            $match: {
                createdAt: { $gte: startDate, $lte: endDate },
                'complianceFlags.type': complianceType
            }
        },
        {
            $group: {
                _id: '$action',
                count: { $sum: 1 },
                successCount: {
                    $sum: { $cond: ['$success', 1, 0] }
                },
                phiAccessCount: {
                    $sum: { $cond: ['$phiAccessed', 1, 0] }
                },
                users: { $addToSet: '$userId' }
            }
        },
        {
            $project: {
                action: '$_id',
                totalEvents: '$count',
                successfulEvents: '$successCount',
                failedEvents: { $subtract: ['$count', '$successCount'] },
                phiAccessEvents: '$phiAccessCount',
                uniqueUsers: { $size: '$users' },
                successRate: {
                    $multiply: [
                        { $divide: ['$successCount', '$count'] },
                        100
                    ]
                }
            }
        },
        { $sort: { totalEvents: -1 } }
    ];
    
    return this.aggregate(pipeline);
};

// Prevent modifications to audit logs
auditLogSchema.pre('save', async function() {
    if (!this.isNew) {
        throw new Error('Audit logs cannot be modified');
    }
});

auditLogSchema.pre('findOneAndUpdate', async function() {
    throw new Error('Audit logs cannot be modified');
});

auditLogSchema.pre('updateOne', function(next) {
    next(new Error('Audit logs cannot be modified'));
});

auditLogSchema.pre('updateMany', function(next) {
    next(new Error('Audit logs cannot be modified'));
});

module.exports = mongoose.model('AuditLog', auditLogSchema);