import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

// In-memory mock database for users. In production, use a secure DB like PostgreSQL.
// Storing passwords only as hashes.
const usersDB = []; 

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_fallback_key_do_not_use_in_prod';
const TOKEN_EXPIRY = '1h'; // Short-lived tokens for better security

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

    res.status(201).json({ 
      message: 'User created successfully',
      token,
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

    res.status(200).json({
      message: 'Login successful',
      token
    });
  } catch (error) {
    console.error('Login Error:', error);
    res.status(500).json({ error: 'Failed to authenticate' });
  }
};
