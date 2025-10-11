const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Database connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/ridesync', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

mongoose.connection.on('connected', () => {
  console.log('Connected to MongoDB');
});

mongoose.connection.on('error', (err) => {
  console.error('MongoDB connection error:', err);
});

// Routes
app.use('/api/auth', require('./routes/auth'));

// Health check
app.get('/api/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    message: 'RideSync Backend is running',
    timestamp: new Date().toISOString()
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    success: false, 
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err.message : {}
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
});

app.post('/api/auth/send-otp', (req, res) => {
  const { email, phoneNumber, fullName, userType } = req.body;
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  
  console.log(`📧 OTP for ${email || phoneNumber}: ${otp}`);
  console.log(`👤 Name: ${fullName}, Type: ${userType}`);
  
  res.json({
    success: true,
    message: 'OTP sent successfully',
    otp: otp, // Sending back for testing
    userId: 'user_' + Date.now()
  });
});

app.post('/api/auth/verify-otp', (req, res) => {
  const { otp, userId, userType } = req.body;
  
  console.log(`✅ OTP verified: ${otp} for user: ${userId}`);
  
  res.json({
    success: true,
    message: 'OTP verified successfully',
    token: 'token_' + Date.now(),
    user: {
      id: userId,
      fullName: 'Verified User',
      email: 'user@example.com',
      userType: userType || 'rider',
      isVerified: true
    }
  });
});