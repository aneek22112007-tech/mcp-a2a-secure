import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_fallback_key_do_not_use_in_prod';

/**
 * Middleware to verify a JWT in the Authorization header.
 * Enforces session security.
 */
export const requireAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing or invalid token' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    // Attach the user identity to the request
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Unauthorized: Token expired or invalid' });
  }
};

/**
 * Middleware to enforce least-privilege scopes.
 * Ensures the agent/user has the required permissions to access a resource.
 * @param {string[]} requiredScopes - The list of scopes required to pass.
 */
export const requireScope = (requiredScopes) => {
  return (req, res, next) => {
    if (!req.user || !req.user.scopes) {
      return res.status(403).json({ error: 'Forbidden: No scopes assigned' });
    }

    const hasAllRequiredScopes = requiredScopes.every((scope) =>
      req.user.scopes.includes(scope)
    );

    if (!hasAllRequiredScopes) {
      return res.status(403).json({ 
        error: 'Forbidden: Insufficient permissions for this operation' 
      });
    }

    next();
  };
};
