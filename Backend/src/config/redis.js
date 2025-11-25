const redis = require('redis');
const { logger } = require('../utils/logger');

let redisClient = null;

const connectRedis = async () => {
    try {
        redisClient = redis.createClient({
            url: process.env.REDIS_URL || 'redis://localhost:6379',
            retry_strategy: (options) => {
                if (options.error && options.error.code === 'ECONNREFUSED') {
                    logger.error('Redis server connection refused');
                    return new Error('Redis server connection refused');
                }
                if (options.total_retry_time > 1000 * 60 * 60) {
                    logger.error('Redis retry time exhausted');
                    return new Error('Redis retry time exhausted');
                }
                if (options.attempt > 10) {
                    logger.error('Redis connection max retries reached');
                    return undefined;
                }
                return Math.min(options.attempt * 100, parseInt(process.env.REDIS_RETRY_DELAY) || 3000);
            }
        });

        redisClient.on('error', (err) => {
            logger.error('Redis Client Error:', err);
        });

        redisClient.on('connect', () => {
            logger.info('Redis client connected');
        });

        redisClient.on('ready', () => {
            logger.info('Redis client ready');
        });

        await redisClient.connect();
        return redisClient;
        
    } catch (error) {
        logger.error('Redis connection failed:', error);
        // Don't exit process, allow app to run without Redis
        return null;
    }
};

const getRedisClient = () => {
    return redisClient;
};

const closeRedis = async () => {
    if (redisClient) {
        await redisClient.quit();
        logger.info('Redis connection closed');
    }
};

module.exports = {
    connectRedis,
    getRedisClient,
    closeRedis
};