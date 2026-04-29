// src/middleware/auth.js
const jwt = require('jsonwebtoken');

/**
 * Middleware: verifikasi JWT token dari header Authorization
 */
function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token autentikasi diperlukan' });
  }

  const token = header.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // { id, nik, name, role, jabatan, cabang }
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token tidak valid atau sudah kedaluwarsa' });
  }
}

/**
 * Middleware: cek role user
 * Usage: authorize('Approval', 'Admin')
 */
function authorize(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user?.role)) {
      return res.status(403).json({ error: 'Anda tidak memiliki izin untuk aksi ini' });
    }
    next();
  };
}

module.exports = { authenticate, authorize };
