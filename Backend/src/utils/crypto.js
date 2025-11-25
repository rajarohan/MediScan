const crypto = require('crypto');

/**
 * Generate HMAC signature for inter-service communication
 */
const generateHMACSignature = (payload, secret) => {
    return crypto
        .createHmac('sha256', secret)
        .update(JSON.stringify(payload))
        .digest('hex');
};

/**
 * Verify HMAC signature
 */
const verifyHMACSignature = (payload, signature, secret) => {
    const expectedSignature = generateHMACSignature(payload, secret);
    return crypto.timingSafeEqual(
        Buffer.from(signature, 'hex'),
        Buffer.from(expectedSignature, 'hex')
    );
};

/**
 * Generate secure random token
 */
const generateSecureToken = (length = 32) => {
    return crypto.randomBytes(length).toString('hex');
};

/**
 * Hash sensitive data
 */
const hashData = (data, salt = null) => {
    if (!salt) {
        salt = crypto.randomBytes(16).toString('hex');
    }
    const hash = crypto.pbkdf2Sync(data, salt, 10000, 64, 'sha512').toString('hex');
    return { hash, salt };
};

/**
 * Verify hashed data
 */
const verifyHash = (data, hash, salt) => {
    const { hash: dataHash } = hashData(data, salt);
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(dataHash, 'hex'));
};

/**
 * Encrypt sensitive data
 */
const encryptData = (text, key = null) => {
    if (!key) {
        key = process.env.ENCRYPTION_KEY || crypto.randomBytes(32);
    }
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipher('aes-256-cbc', key);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return {
        encrypted,
        iv: iv.toString('hex'),
        key: key.toString('hex')
    };
};

/**
 * Decrypt sensitive data
 */
const decryptData = (encrypted, key, iv) => {
    const decipher = crypto.createDecipher('aes-256-cbc', Buffer.from(key, 'hex'));
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
};

/**
 * Generate file checksum
 */
const generateFileChecksum = (filePath) => {
    const hash = crypto.createHash('sha256');
    const fs = require('fs');
    const data = fs.readFileSync(filePath);
    hash.update(data);
    return hash.digest('hex');
};

module.exports = {
    generateHMACSignature,
    verifyHMACSignature,
    generateSecureToken,
    hashData,
    verifyHash,
    encryptData,
    decryptData,
    generateFileChecksum
};