const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();

// Middleware
app.use(express.json());
app.use(cors());

// MongoDB Connection
console.log('🔗 Attempting to connect to MongoDB...');

mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/Project_DB', {
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

// Create Nodemailer Transporter - FIXED TYPO HERE
const createTransporter = () => {
    return nodemailer.createTransport({
        service: process.env.EMAIL_SERVICE || 'gmail',
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASSWORD,
        },
    });
};

// Test email configuration
const testEmailConfig = async () => {
    try {
        const transporter = createTransporter();
        await transporter.verify();
        console.log('✅ Email configuration is correct');
        return true;
    } catch (error) {
        console.log('❌ Email configuration error:', error.message);
        console.log('💡 Please check your .env file and Gmail App Password');
        return false;
    }
};

// Call this on server start
testEmailConfig();

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

const JWT_SECRET = process.env.JWT_SECRET || 'ridesync-secret-key-2025';

// Generate OTP
function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// Send OTP Email
async function sendOTPEmail(email, otp, userType) {
    try {
        const transporter = createTransporter();
        
        const subject = userType === 'driver' 
            ? 'RideSync Pro - Driver Account Verification' 
            : 'RideSync Pro - Account Verification';
            
        const htmlContent = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; color: white;">
                    <h1 style="margin: 0; font-size: 28px;">RideSync Pro</h1>
                    <p style="margin: 10px 0 0 0; opacity: 0.9;">${userType === 'driver' ? 'Driver Account Verification' : 'Account Verification'}</p>
                </div>
                
                <div style="padding: 30px; background: #f8f9fa;">
                    <h2 style="color: #333; margin-bottom: 20px;">Verify Your Email Address</h2>
                    <p style="color: #666; line-height: 1.6;">
                        Thank you for signing up for RideSync Pro! 
                        Use the verification code below to complete your registration:
                    </p>
                    
                    <div style="background: white; padding: 25px; border-radius: 10px; text-align: center; margin: 25px 0; border: 2px solid #e9ecef;">
                        <div style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #667eea; margin: 15px 0;">
                            ${otp}
                        </div>
                        <p style="color: #666; font-size: 14px; margin: 10px 0 0 0;">
                            This code will expire in 10 minutes
                        </p>
                    </div>
                    
                    <p style="color: #666; font-size: 14px; line-height: 1.6;">
                        If you didn't create an account with RideSync Pro, please ignore this email.
                    </p>
                </div>
                
                <div style="background: #343a40; padding: 20px; text-align: center; color: white;">
                    <p style="margin: 0; font-size: 14px;">
                        &copy; 2025 RideSync Pro. All rights reserved.
                    </p>
                    <p style="margin: 5px 0 0 0; font-size: 12px; opacity: 0.8;">
                        Professional Ride-Sharing Platform
                    </p>
                </div>
            </div>
        `;

        const mailOptions = {
            from: `"RideSync Pro" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: subject,
            html: htmlContent
        };

        const info = await transporter.sendMail(mailOptions);
        console.log(`✅ OTP email sent to: ${email}`);
        console.log(`📧 Message ID: ${info.messageId}`);
        return true;
    } catch (error) {
        console.error('❌ Error sending email:', error);
        return false;
    }
}

// Health Check
app.get('/api/health', (req, res) => {
    res.json({ 
        success: true,
        message: 'RideSync Backend is running!',
        timestamp: new Date().toISOString(),
        database: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected',
        email: process.env.EMAIL_USER ? 'Configured' : 'Not Configured'
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

        // Send OTP via Email
        const emailSent = await sendOTPEmail(email, otp, userType);

        if (!emailSent) {
            return res.status(500).json({
                success: false,
                message: 'Failed to send OTP email. Please try again.'
            });
        }

        res.json({
            success: true,
            message: 'OTP sent successfully to your email'
            // Remove the otp field in production - only for testing
            // otp: otp 
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
    console.log(`📧 Email service: ${process.env.EMAIL_USER ? 'Configured' : 'Not Configured'}`);
});