import jwt from "jsonwebtoken";

export function signToken(user) {
  return jwt.sign({ sub: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: "30d" });
}

export function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing bearer token" });
  }

  try {
    const payload = jwt.verify(header.slice(7), process.env.JWT_SECRET);
    req.user = { id: payload.sub, email: payload.email };
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

/** Attaches req.user if a valid token is present, but never blocks the request. */
export function optionalAuth(req, _res, next) {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    try {
      const payload = jwt.verify(header.slice(7), process.env.JWT_SECRET);
      req.user = { id: payload.sub, email: payload.email };
    } catch {
      // ignore — treated as anonymous
    }
  }
  next();
}
