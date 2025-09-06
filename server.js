const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
});

// Input Field Schema
const inputFieldSchema = new mongoose.Schema({
    title: { type: String, required: true },
    placeholder: String,
    type: { type: String, enum: ['text', 'email', 'phone', 'textarea', 'radio', 'checkbox', 'select', 'other'], default: 'text' },
    required: { type: Boolean, default: false },
    options: [String] // For radio, checkbox, and select types
});

// App Schema
const appSchema = new mongoose.Schema({
    name: { type: String, required: true },
    category: String,
    shortDescription: String,
    longDescription: String,
    icon: String,
    images: [String],
    buttonText: { type: String, default: 'GET' },
    buttonLink: String,
    hasLoadingSteps: { type: Boolean, default: false },
    loadingSteps: [String],
    stepInterval: { type: Number, default: 2000 },
    allowInput: { type: Boolean, default: false },
    inputFields: [inputFieldSchema],
    inputButtonText: { type: String, default: 'Submit' },
    rating: { type: Number, default: 0 },
    totalRatings: { type: Number, default: 0 },
    ratingBreakdown: {
        five: { type: Number, default: 0 },
        four: { type: Number, default: 0 },
        three: { type: Number, default: 0 },
        two: { type: Number, default: 0 },
        one: { type: Number, default: 0 }
    },
    customFields: [{
        label: String,
        value: String,
        icon: String
    }],
    users: { type: String, default: '0' },
    order: { type: Number, default: 0 },
    isTrending: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

// Review Schema
const reviewSchema = new mongoose.Schema({
    appId: { type: mongoose.Schema.Types.ObjectId, ref: 'App', required: true },
    name: { type: String, required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    text: String,
    approved: { type: Boolean, default: false },
    userId: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});

const App = mongoose.model('App', appSchema);
const Review = mongoose.model('Review', reviewSchema);

// Routes
// Serve frontend
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/admin.html'));
});

// Auth check
app.post('/api/auth', (req, res) => {
    const { password } = req.body;
    if (password === process.env.PASSWORD) {
        res.json({ success: true });
    } else {
        res.status(401).json({ success: false, message: 'Invalid password' });
    }
});

// Get all apps
app.get('/api/apps', async (req, res) => {
    try {
        const apps = await App.find().sort({ order: 1 });
        res.json(apps);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get trending apps
app.get('/api/apps/trending', async (req, res) => {
    try {
        const apps = await App.find({ isTrending: true }).sort({ order: 1 });
        res.json(apps);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get single app
app.get('/api/apps/:id', async (req, res) => {
    try {
        const app = await App.findById(req.params.id);
        if (!app) {
            return res.status(404).json({ error: 'App not found' });
        }
        res.json(app);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Add app
app.post('/api/apps', async (req, res) => {
    try {
        const app = new App(req.body);
        await app.save();
        res.status(201).json(app);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update app
app.put('/api/apps/:id', async (req, res) => {
    try {
        const app = await App.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!app) {
            return res.status(404).json({ error: 'App not found' });
        }
        res.json(app);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete app
app.delete('/api/apps/:id', async (req, res) => {
    try {
        const app = await App.findByIdAndDelete(req.params.id);
        if (!app) {
            return res.status(404).json({ error: 'App not found' });
        }
        res.json({ message: 'App deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update app ratings in bulk
app.post('/api/apps/:id/ratings', async (req, res) => {
    try {
        const { ratings } = req.body;
        const app = await App.findById(req.params.id);
        
        if (!app) {
            return res.status(404).json({ error: 'App not found' });
        }

        app.ratingBreakdown = ratings;
        
        // Calculate total ratings and average
        const total = Object.values(ratings).reduce((sum, count) => sum + count, 0);
        const weightedSum = (ratings.five * 5) + (ratings.four * 4) + (ratings.three * 3) + (ratings.two * 2) + (ratings.one * 1);
        const average = total > 0 ? (weightedSum / total).toFixed(1) : 0;
        
        app.totalRatings = total;
        app.rating = parseFloat(average);
        
        await app.save();
        res.json(app);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get app reviews
app.get('/api/apps/:id/reviews', async (req, res) => {
    try {
        const userId = req.headers['x-user-id'];
        
        const approvedReviews = await Review.find({ 
            appId: req.params.id, 
            approved: true 
        }).sort({ createdAt: -1 });
        
        let userPendingReviews = [];
        
        if (userId) {
            userPendingReviews = await Review.find({
                appId: req.params.id,
                approved: false,
                userId: userId
            }).sort({ createdAt: -1 });
        }
        
        const allReviews = [...userPendingReviews, ...approvedReviews];
        allReviews.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        
        res.json(allReviews);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Add review
app.post('/api/apps/:id/reviews', async (req, res) => {
    try {
        const userId = crypto.randomBytes(16).toString('hex');
        
        const review = new Review({
            appId: req.params.id,
            userId: userId,
            ...req.body
        });
        await review.save();
        
        res.status(201).json({ ...review.toObject(), userId });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get all reviews (admin)
app.get('/api/reviews', async (req, res) => {
    try {
        const reviews = await Review.find().populate('appId', 'name').sort({ createdAt: -1 });
        res.json(reviews);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Approve/reject review
app.put('/api/reviews/:id', async (req, res) => {
    try {
        const review = await Review.findByIdAndUpdate(
            req.params.id, 
            { approved: req.body.approved }, 
            { new: true }
        );
        if (!review) {
            return res.status(404).json({ error: 'Review not found' });
        }
        res.json(review);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete review
app.delete('/api/reviews/:id', async (req, res) => {
    try {
        const review = await Review.findByIdAndDelete(req.params.id);
        if (!review) {
            return res.status(404).json({ error: 'Review not found' });
        }
        res.json({ message: 'Review deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Search apps
app.get('/api/apps/search/:query', async (req, res) => {
    try {
        const query = req.params.query;
        const apps = await App.find({
            $or: [
                { name: { $regex: query, $options: 'i' } },
                { category: { $regex: query, $options: 'i' } },
                { shortDescription: { $regex: query, $options: 'i' } }
            ]
        }).sort({ order: 1 });
        res.json(apps);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});