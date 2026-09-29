import express from 'express';
import { register, login, googleLogin } from '../controllers/authController.js';

const router = express.Router();

// Public routes for Authentication
router.post('/register', register);
router.post('/login', login);

// Google OAuth — receives the Google ID token and returns a local JWT session
router.post('/google-login', googleLogin);

export default router;
