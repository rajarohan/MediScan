const mongoose = require('mongoose');

const processingJobSchema = new mongoose.Schema({
    fileId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'File',
        required: true,
        index: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    jobId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    status: {
        type: String,
        enum: ['queued', 'processing', 'completed', 'failed', 'cancelled'],
        default: 'queued',
        index: true
    },
    priority: {
        type: String,
        enum: ['low', 'normal', 'high', 'urgent'],
        default: 'normal'
    },
    progress: {
        type: Number,
        min: 0,
        max: 100,
        default: 0
    },
    processingSteps: [{
        name: {
            type: String,
            required: true
        },
        status: {
            type: String,
            enum: ['pending', 'processing', 'completed', 'failed', 'skipped'],
            default: 'pending'
        },
        startedAt: Date,
        completedAt: Date,
        duration: Number, // in milliseconds
        details: mongoose.Schema.Types.Mixed,
        error: String
    }],
    aiServiceMetadata: {
        serviceVersion: String,
        modelVersion: String,
        processingNode: String,
        requestId: String,
        callbackUrl: String
    },
    results: {
        ocrText: {
            type: String,
            select: false // Don't include by default due to size
        },
        extractedEntities: {
            vitals: [{
                name: String,
                value: String,
                unit: String,
                normalRange: {
                    min: Number,
                    max: Number,
                    unit: String
                },
                status: {
                    type: String,
                    enum: ['low', 'normal', 'high', 'critical']
                },
                confidence: {
                    type: Number,
                    min: 0,
                    max: 1
                },
                position: {
                    x: Number,
                    y: Number,
                    width: Number,
                    height: Number
                }
            }],
            medications: [{
                name: String,
                dosage: String,
                frequency: String,
                duration: String,
                confidence: Number,
                position: {
                    x: Number,
                    y: Number,
                    width: Number,
                    height: Number
                }
            }],
            labResults: [{
                test: String,
                value: String,
                unit: String,
                referenceRange: String,
                status: String,
                confidence: Number,
                date: Date,
                position: {
                    x: Number,
                    y: Number,
                    width: Number,
                    height: Number
                }
            }],
            diagnoses: [{
                primary: String,
                secondary: [String],
                icd10: String,
                confidence: Number
            }],
            procedures: [{
                name: String,
                date: Date,
                cpt: String,
                confidence: Number
            }]
        },
        summary: {
            patientInfo: {
                name: String,
                age: Number,
                gender: String,
                mrn: String // Medical Record Number
            },
            keyFindings: [String],
            abnormalValues: [{
                parameter: String,
                value: String,
                severity: String,
                recommendation: String
            }],
            clinicianNotes: String,
            recommendedActions: [String],
            overallRisk: {
                level: {
                    type: String,
                    enum: ['low', 'moderate', 'high', 'critical']
                },
                factors: [String]
            }
        },
        qualityMetrics: {
            ocrConfidence: {
                type: Number,
                min: 0,
                max: 1
            },
            extractionConfidence: {
                type: Number,
                min: 0,
                max: 1
            },
            documentQuality: {
                type: String,
                enum: ['poor', 'fair', 'good', 'excellent']
            },
            processingTime: Number, // in milliseconds
            wordCount: Number,
            pageCount: Number
        },
        flags: [{
            type: {
                type: String,
                enum: ['critical_value', 'missing_data', 'quality_issue', 'security_concern', 'validation_error']
            },
            message: String,
            severity: {
                type: String,
                enum: ['info', 'warning', 'error', 'critical']
            },
            details: mongoose.Schema.Types.Mixed
        }]
    },
    errorDetails: {
        code: String,
        message: String,
        stack: String,
        timestamp: Date,
        retryCount: {
            type: Number,
            default: 0
        },
        maxRetries: {
            type: Number,
            default: 3
        }
    },
    performance: {
        queuedAt: Date,
        startedAt: Date,
        completedAt: Date,
        totalDuration: Number, // in milliseconds
        processingDuration: Number, // excluding queue time
        memoryUsage: Number,
        cpuTime: Number
    },
    compliance: {
        phiDetected: {
            type: Boolean,
            default: false
        },
        phiTypes: [String], // Types of PHI detected
        dataClassification: {
            type: String,
            enum: ['public', 'internal', 'confidential', 'restricted'],
            default: 'restricted'
        },
        auditTrail: [{
            action: String,
            timestamp: Date,
            userId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User'
            },
            details: String
        }]
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Indexes for efficient queries
processingJobSchema.index({ status: 1, createdAt: -1 });
processingJobSchema.index({ userId: 1, createdAt: -1 });
processingJobSchema.index({ fileId: 1 });
processingJobSchema.index({ jobId: 1 });
processingJobSchema.index({ priority: 1, createdAt: 1 });

// Virtual for completion percentage
processingJobSchema.virtual('completionPercentage').get(function() {
    if (this.status === 'completed') return 100;
    if (this.status === 'failed' || this.status === 'cancelled') return 0;
    
    const completedSteps = this.processingSteps.filter(step => step.status === 'completed').length;
    const totalSteps = this.processingSteps.length;
    
    return totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : this.progress;
});

// Virtual for estimated completion time
processingJobSchema.virtual('estimatedCompletion').get(function() {
    if (this.status === 'completed' || this.status === 'failed') return null;
    
    const avgProcessingTime = 120000; // 2 minutes average
    const remainingProgress = 100 - this.progress;
    const estimatedMs = (remainingProgress / 100) * avgProcessingTime;
    
    return new Date(Date.now() + estimatedMs);
});

// Method to update processing step
processingJobSchema.methods.updateStep = function(stepName, status, details = {}) {
    const step = this.processingSteps.find(s => s.name === stepName);
    
    if (step) {
        step.status = status;
        step.details = { ...step.details, ...details };
        
        if (status === 'processing' && !step.startedAt) {
            step.startedAt = new Date();
        }
        
        if (['completed', 'failed', 'skipped'].includes(status)) {
            step.completedAt = new Date();
            if (step.startedAt) {
                step.duration = step.completedAt - step.startedAt;
            }
        }
        
        if (status === 'failed' && details.error) {
            step.error = details.error;
        }
    }
    
    // Update overall progress
    this.updateProgress();
    
    return this.save();
};

// Method to add processing step
processingJobSchema.methods.addStep = function(name, status = 'pending') {
    this.processingSteps.push({
        name,
        status,
        startedAt: status === 'processing' ? new Date() : null
    });
    
    return this.save();
};

// Method to update overall progress
processingJobSchema.methods.updateProgress = function() {
    const steps = this.processingSteps;
    if (steps.length === 0) return;
    
    const stepWeights = {
        'file_validation': 5,
        'ocr_processing': 30,
        'text_extraction': 20,
        'entity_extraction': 25,
        'summarization': 15,
        'quality_check': 5
    };
    
    let totalWeight = 0;
    let completedWeight = 0;
    
    steps.forEach(step => {
        const weight = stepWeights[step.name] || 10;
        totalWeight += weight;
        
        if (step.status === 'completed') {
            completedWeight += weight;
        } else if (step.status === 'processing') {
            completedWeight += weight * 0.5; // 50% for processing steps
        }
    });
    
    this.progress = totalWeight > 0 ? Math.round((completedWeight / totalWeight) * 100) : 0;
};

// Method to mark job as failed
processingJobSchema.methods.markFailed = function(error, shouldRetry = false) {
    this.status = 'failed';
    this.errorDetails = {
        code: error.code || 'PROCESSING_ERROR',
        message: error.message,
        stack: error.stack,
        timestamp: new Date(),
        retryCount: this.errorDetails?.retryCount || 0
    };
    
    if (shouldRetry && this.errorDetails.retryCount < this.errorDetails.maxRetries) {
        this.status = 'queued';
        this.errorDetails.retryCount += 1;
        this.progress = 0;
        
        // Reset processing steps
        this.processingSteps.forEach(step => {
            if (step.status === 'processing' || step.status === 'failed') {
                step.status = 'pending';
                step.startedAt = null;
                step.completedAt = null;
                step.duration = null;
                step.error = null;
            }
        });
    }
    
    return this.save();
};

// Method to mark job as completed
processingJobSchema.methods.markCompleted = function(results) {
    this.status = 'completed';
    this.results = results;
    this.progress = 100;
    this.performance.completedAt = new Date();
    
    if (this.performance.startedAt) {
        this.performance.totalDuration = this.performance.completedAt - this.createdAt;
        this.performance.processingDuration = this.performance.completedAt - this.performance.startedAt;
    }
    
    return this.save();
};

// Static method to get queue statistics
processingJobSchema.statics.getQueueStats = async function() {
    const stats = await this.aggregate([
        {
            $group: {
                _id: '$status',
                count: { $sum: 1 },
                avgDuration: { $avg: '$performance.processingDuration' }
            }
        }
    ]);
    
    const result = {
        queued: 0,
        processing: 0,
        completed: 0,
        failed: 0,
        avgProcessingTime: 0
    };
    
    stats.forEach(stat => {
        result[stat._id] = stat.count;
        if (stat._id === 'completed' && stat.avgDuration) {
            result.avgProcessingTime = Math.round(stat.avgDuration);
        }
    });
    
    return result;
};

module.exports = mongoose.model('ProcessingJob', processingJobSchema);