const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const authRoutes = require('./routes/authRoutes');
const burialRoutes = require('./routes/burialRoutes');

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend files
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/burials', burialRoutes);

// SPA Fallback Route
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  } else {
    res.status(404).json({ success: false, message: 'API endpoint not found' });
  }
});

const PORT = process.env.PORT || 5000;

// Cached DB connection (important for Vercel serverless — reuse across invocations)
let dbConnected = false;

const connectDatabase = async () => {
  if (dbConnected) return; // Reuse existing connection on Vercel warm invocations
  const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/burial_inventory_db';
  const isCloud = mongoUri.includes('mongodb+srv://');

  try {
    const maskedUri = mongoUri.replace(/\/\/[^:]+:[^@]+@/, '//***:***@');
    console.log(`Connecting to MongoDB at: ${maskedUri}...`);

    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: isCloud ? 10000 : 4000
    });
    dbConnected = true;
    console.log(`✅ Connected to MongoDB ${isCloud ? 'Atlas Cloud Database' : 'Database'} successfully.`);
  } catch (err) {
    console.warn(`⚠️ MongoDB connection failed: ${err.message}`);
    console.log('🔄 Initializing in-memory MongoDB server fallback...');

    try {
      const { MongoMemoryServer } = require('mongodb-memory-server');
      const mongoServer = await MongoMemoryServer.create();
      const memoryUri = mongoServer.getUri();

      await mongoose.connect(memoryUri);
      dbConnected = true;
      console.log(`✅ Connected to MongoMemoryServer fallback at: ${memoryUri}`);
    } catch (memErr) {
      console.error('❌ Failed to connect to MongoDB Memory Server:', memErr);
    }
  }
};

// For Vercel serverless: connect DB before each request, then hand off to Express
const handler = async (req, res) => {
  await connectDatabase();
  return app(req, res);
};

// Export for Vercel serverless runtime
module.exports = handler;

// Run locally only (not on Vercel)
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  connectDatabase().then(() => {
    app.listen(PORT, () => {
      console.log(`🚀 Burial Inventory & Tracking Server running at http://localhost:${PORT}`);
    });
  });
}
