const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const crypto = require('crypto');

const app = express();

// Middleware
app.use(express.json());
app.use(cors());

// MongoDB Connection
console.log('🔗 Attempting to connect to MongoDB...');

mongoose.connect('mongodb://127.0.0.1:27017/Project_DB', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 5000,
})
.then(() => {
    console.log('✅ SUCCESS: Connected to MongoDB');
    console.log('📁 Database: Project_DB');
})
.catch((err) => {
    console.log('❌ MongoDB connection failed:', err.message);
});

// User Schema (for both Riders and Drivers)
const userSchema = new mongoose.Schema({
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    phoneNumber: { type: String, required: true },
    password: { type: String, required: true },
    userType: { type: String, enum: ['rider', 'driver'], required: true },
    isVerified: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

// Driver Schema (additional driver-specific data)
const driverSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    licenseNumber: { type: String, required: true, unique: true },
    vehicleType: { type: String, required: true },
    vehicleYear: { type: Number, required: true },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    backgroundCheck: { type: String, enum: ['pending', 'passed', 'failed'], default: 'pending' },
    applicationDate: { type: Date, default: Date.now }
});

// OTP Schema for verification
const otpSchema = new mongoose.Schema({
    email: { type: String, required: true },
    otp: { type: String, required: true },
    userType: { type: String, required: true },
    userData: { type: Object, required: true },
    expiresAt: { type: Date, required: true },
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Driver = mongoose.model('Driver', driverSchema);
const OTP = mongoose.model('OTP', otpSchema);

const JWT_SECRET = 'ridesync-secret-key-2025';

// Generate OTP
function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// Health Check
app.get('/api/health', (req, res) => {
    res.json({ 
        success: true,
        message: 'RideSync Backend is running!',
        timestamp: new Date().toISOString(),
        database: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected'
    });
});

// Send OTP Endpoint
app.post('/api/auth/send-otp', async (req, res) => {
    try {
        console.log('📨 OTP Request:', req.body);
        
        const { email, phoneNumber, userType, userData } = req.body;

        // Check if user already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ 
                success: false,
                message: 'User already exists with this email' 
            });
        }

        // Generate OTP
        const otp = generateOTP();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        // Store OTP in database
        await OTP.findOneAndDelete({ email }); // Remove existing OTP
        await OTP.create({
            email,
            otp,
            userType,
            userData,
            expiresAt
        });

        console.log(`📧 OTP for ${email}: ${otp}`); // In production, send via email/SMS

        res.json({
            success: true,
            message: 'OTP sent successfully',
            otp: otp // Remove this in production - only for testing
        });

    } catch (error) {
        console.error('❌ OTP send error:', error);
        res.status(500).json({ 
            success: false,
            message: 'Server error: ' + error.message 
        });
    }
});

// Verify OTP and Create Account
app.post('/api/auth/verify-otp', async (req, res) => {
    try {
        console.log('🔍 OTP Verification:', req.body);
        
        const { email, otp, userType } = req.body;

        // Find OTP record
        const otpRecord = await OTP.findOne({ email, otp });
        
        if (!otpRecord) {
            return res.status(400).json({ 
                success: false,
                message: 'Invalid OTP' 
            });
        }

        // Check if OTP is expired
        if (otpRecord.expiresAt < new Date()) {
            await OTP.findOneAndDelete({ email });
            return res.status(400).json({ 
                success: false,
                message: 'OTP has expired' 
            });
        }

        const userData = otpRecord.userData;

        // Hash password
        const hashedPassword = await bcrypt.hash(userData.password, 12);

        // Create user
        const user = new User({
            firstName: userData.firstName,
            lastName: userData.lastName,
            email: userData.email,
            phoneNumber: userData.phoneNumber,
            password: hashedPassword,
            userType: userData.userType,
            isVerified: true
        });

        await user.save();
        console.log('✅ User created:', user.email);

        // If driver, create driver profile
        if (userType === 'driver' && userData.driverProfile) {
            const driver = new Driver({
                userId: user._id,
                licenseNumber: userData.driverProfile.licenseNumber,
                vehicleType: userData.driverProfile.vehicleType,
                vehicleYear: userData.driverProfile.vehicleYear
            });
            await driver.save();
            console.log('✅ Driver profile created for:', user.email);
        }

        // Clean up OTP record
        await OTP.findOneAndDelete({ email });

        // Generate token
        const token = jwt.sign(
            { userId: user._id, email: user.email, userType: user.userType },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({
            success: true,
            message: 'Account created successfully',
            token,
            user: {
                id: user._id,
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                phoneNumber: user.phoneNumber,
                userType: user.userType
            }
        });

    } catch (error) {
        console.error('❌ OTP verification error:', error);
        res.status(500).json({ 
            success: false,
            message: 'Server error: ' + error.message 
        });
    }
});

// Login Endpoint
app.post('/api/auth/login', async (req, res) => {
    try {
        console.log('📥 Login request received:', req.body);
        
        const { email, password, userType } = req.body;

        // Find user
        const user = await User.findOne({ email, userType });
        if (!user) {
            return res.status(400).json({ 
                success: false,
                message: 'Invalid email or user type' 
            });
        }

        // Check password
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(400).json({ 
                success: false,
                message: 'Invalid password' 
            });
        }

        // Generate token
        const token = jwt.sign(
            { userId: user._id, email: user.email, userType: user.userType },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        // Get driver profile if applicable
        let driverProfile = null;
        if (userType === 'driver') {
            driverProfile = await Driver.findOne({ userId: user._id });
        }

        console.log('✅ Login successful for:', user.email);
        
        res.json({
            success: true,
            token,
            user: {
                id: user._id,
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                phoneNumber: user.phoneNumber,
                userType: user.userType,
                driverProfile
            }
        });

    } catch (error) {
        console.error('❌ Login error:', error);
        res.status(500).json({ 
            success: false,
            message: 'Server error during login: ' + error.message 
        });
    }
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`🔗 Health check: http://localhost:${PORT}/api/health`);
});