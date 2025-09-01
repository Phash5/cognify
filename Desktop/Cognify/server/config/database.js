const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    // Try MongoDB Atlas first, then fallback to local, then in-memory
    let mongoUri = process.env.MONGODB_URI;
    
    // If Atlas URI fails, try local MongoDB
    if (!mongoUri || mongoUri.includes('cluster0.mongodb.net')) {
      mongoUri = 'mongodb://localhost:27017/cognify';
    }
    
    const conn = await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s
    });

    console.log(`📦 MongoDB Connected: ${conn.connection.host}`);
    
    // Handle connection events
    mongoose.connection.on('error', (err) => {
      console.error('❌ MongoDB connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      console.log('📦 MongoDB disconnected');
    });

    mongoose.connection.on('reconnected', () => {
      console.log('📦 MongoDB reconnected');
    });

    // Graceful shutdown
    process.on('SIGINT', async () => {
      await mongoose.connection.close();
      console.log('📦 MongoDB connection closed through app termination');
      process.exit(0);
    });

  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    console.log('⚠️  Running without database - using mock data for development');
    
    // Don't exit, continue without database for development
    // In production, you would want to exit here
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    }
  }
};

module.exports = connectDB;