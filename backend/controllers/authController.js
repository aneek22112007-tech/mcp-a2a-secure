import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';

// In-memory mock database for users. In production, use a secure DB like PostgreSQL.
// Storing passwords only as hashes.
const usersDB = []; 

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_fallback_key_do_not_use_in_prod';
const TOKEN_EXPIRY = '1h'; // Short-lived tokens for better security

// TODO: Replace YOUR_GOOGLE_CLIENT_ID with the value from Google Cloud Console.
// Keep this in an environment variable in production (e.g. process.env.GOOGLE_CLIENT_ID).
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || 'YOUR_GOOGLE_CLIENT_ID';
const googleAuthClient = new OAuth2Client(GOOGLE_CLIENT_ID);

export const register = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const existingUser = usersDB.find((u) => u.email === email);
    if (existingUser) {
      return res.status(409).json({ error: 'User already exists' });
    }

    // Secure password hashing with salt rounds = 10
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    const newUser = {
      id: `usr_${Date.now()}`,
      email,
      passwordHash,
      // Supporting least-privilege by assigning default restrictive roles/scopes
      scopes: ['read:agent_status'],
      apiKey: `ak_live_${Math.random().toString(36).substring(2, 15)}`
    };

    usersDB.push(newUser);

    // Generate JWT upon successful registration
    const token = jwt.sign(
      { userId: newUser.id, scopes: newUser.scopes },
      JWT_SECRET,
      { expiresIn: TOKEN_EXPIRY }
    );

    res.cookie('token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', maxAge: 3600000 });
    res.status(201).json({ 
      message: 'User created successfully',
      apiKey: newUser.apiKey // Provide API key for programmatic access
    });
  } catch (error) {
    console.error('Registration Error:', error);
    res.status(500).json({ error: 'Failed to register user' });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = usersDB.find((u) => u.email === email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Verify hashed password
    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate secure session token
    const token = jwt.sign(
      { userId: user.id, scopes: user.scopes },
      JWT_SECRET,
      { expiresIn: TOKEN_EXPIRY }
    );

    res.cookie('token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', maxAge: 3600000 });
    res.status(200).json({
      message: 'Login successful'
    });
  } catch (error) {
    console.error('Login Error:', error);
    res.status(500).json({ error: 'Failed to authenticate' });
  }
};

/**
 * Google OAuth Login
 *
 * Accepts a Google ID token (credential) from the frontend, verifies it
 * server-side using google-auth-library, and issues a local JWT session.
 *
 * Security notes:
 *  - verifyIdToken checks the token signature, expiry, and audience (client ID),
 *    preventing token substitution attacks.
 *  - Google SSO users are stored without a passwordHash (password field omitted),
 *    so they cannot authenticate via the regular /login endpoint.
 *  - The issued JWT carries the same { userId, scopes } payload as standard login,
 *    making it compatible with all existing Bearer-token middleware and per-client
 *    API key checks without any downstream changes.
 */
export const googleLogin = async (req, res) => {
  try {
    const { credential } = req.body;

    if (!credential) {
      return res.status(400).json({ error: 'Google credential token is required' });
    }

    // Cryptographically verify the ID token with Google's public keys.
    // This also confirms the token was issued for OUR client ID (audience check).
    let ticket;
    try {
      ticket = await googleAuthClient.verifyIdToken({
        idToken: credential,
        audience: GOOGLE_CLIENT_ID,
      });
    } catch (verifyError) {
      console.error('Google token verification failed:', verifyError.message);
      return res.status(401).json({ error: 'Invalid Google token' });
    }

    const payload = ticket.getPayload();
    const { sub: googleId, email, name, picture } = payload;

    if (!email) {
      return res.status(400).json({ error: 'Google account must have an email address' });
    }

    // Upsert: find existing user by email or create a new one.
    // Google SSO users have no passwordHash — they can only auth via this endpoint.
    let user = usersDB.find((u) => u.email === email);

    if (!user) {
      user = {
        id: `usr_google_${googleId}`,
        email,
        name: name || email.split('@')[0],
        picture: picture || null,
        provider: 'google',
        // No passwordHash — SSO-only account (least-privilege by design)
        scopes: ['read:agent_status'],
        apiKey: `ak_live_${Math.random().toString(36).substring(2, 15)}`,
      };
      usersDB.push(user);
      console.log(`New Google user registered: ${email}`);
    }

    // Issue the same JWT shape as the standard login for full middleware compatibility.
    const token = jwt.sign(
      { userId: user.id, scopes: user.scopes },
      JWT_SECRET,
      { expiresIn: TOKEN_EXPIRY }
    );

    res.cookie('token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', maxAge: 3600000 });
    res.status(200).json({
      message: 'Google login successful',
      // Expose the API key so programmatic agents can use per-client scoped access.
      apiKey: user.apiKey,
    });
  } catch (error) {
    console.error('Google Login Error:', error);
    res.status(500).json({ error: 'Failed to authenticate with Google' });
  }
};
