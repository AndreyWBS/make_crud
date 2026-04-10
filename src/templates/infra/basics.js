module.exports = {
  appError: () => `
class AppError extends Error {
    constructor(statusCode, message, details = null) {
        super(message);
        this.statusCode = statusCode;
        this.details = details;
        this.isOperational = true;
        Error.captureStackTrace(this, this.constructor);
    }
}

module.exports = AppError;
`,

  errorMiddleware: () => `
const logger = require('../utils/logger');
const AppError = require('../utils/AppError');

const isProduction = process.env.NODE_ENV === 'production';

const MYSQL_ERROR_MAP = {
    ER_DUP_ENTRY:          { status: 409, message: 'Conflict: duplicate entry.' },
    ER_NO_REFERENCED_ROW_2:{ status: 422, message: 'Unprocessable Entity: foreign key constraint failed.' },
    ER_ROW_IS_REFERENCED_2:{ status: 409, message: 'Conflict: record is referenced by other records.' },
    ER_BAD_FIELD_ERROR:    { status: 400, message: 'Bad Request: unknown column.' },
    ER_PARSE_ERROR:        { status: 400, message: 'Bad Request: query parse error.' },
    ER_DATA_TOO_LONG:      { status: 422, message: 'Unprocessable Entity: value too long for column.' },
    ER_TRUNCATED_WRONG_VALUE: { status: 422, message: 'Unprocessable Entity: incorrect value for column.' },
};

module.exports = (err, req, res, next) => {
  logger.error('request.error', {
    correlationId: req.id,
    method: req.method,
    path: req.originalUrl,
    statusCode: err.statusCode || 500,
    errorName: err.name || 'Error',
    errorMessage: err.message,
    stack: isProduction ? undefined : err.stack,
  });

    // Operational errors (AppError)
    if (err instanceof AppError) {
      const exposeDetails = !isProduction && err.details;
        return res.status(err.statusCode).json({
            status: err.statusCode,
            error: httpStatusText(err.statusCode),
            message: err.message,
        correlationId: req.id,
        ...(exposeDetails && { details: err.details }),
        });
    }

    // MySQL errors
    if (err.code && MYSQL_ERROR_MAP[err.code]) {
        const mapped = MYSQL_ERROR_MAP[err.code];
        return res.status(mapped.status).json({
            status: mapped.status,
            error: httpStatusText(mapped.status),
            message: mapped.message,
          correlationId: req.id,
        });
    }

    // JWT errors
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
        return res.status(401).json({
            status: 401,
            error: 'Unauthorized',
          message: 'Unauthorized',
          correlationId: req.id,
        });
    }

    // SyntaxError in JSON body parsing
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
        return res.status(400).json({
            status: 400,
            error: 'Bad Request',
            message: 'Invalid JSON in request body.',
          correlationId: req.id,
        });
    }

    // Fallback: unexpected internal error
    return res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'An unexpected error occurred. Please try again later.',
      correlationId: req.id,
    });
};

function httpStatusText(code) {
    const map = {
        400: 'Bad Request',
        401: 'Unauthorized',
        403: 'Forbidden',
        404: 'Not Found',
        405: 'Method Not Allowed',
        409: 'Conflict',
        410: 'Gone',
        422: 'Unprocessable Entity',
        429: 'Too Many Requests',
        500: 'Internal Server Error',
        501: 'Not Implemented',
        503: 'Service Unavailable',
    };
    return map[code] || 'Error';
}
`,

  logger: () => `
  const SENSITIVE_KEY_REGEX = /(password|secret|token|authorization|cookie|api[_-]?key|refresh[_-]?token)/i;

  function redact(value, parentKey = '') {
    if (Array.isArray(value)) {
      return value.map((item) => redact(item, parentKey));
    }

    if (value && typeof value === 'object') {
      const output = {};
      for (const [key, innerValue] of Object.entries(value)) {
        output[key] = SENSITIVE_KEY_REGEX.test(key)
          ? '[REDACTED]'
          : redact(innerValue, key);
      }
      return output;
    }

    if (typeof value === 'string' && SENSITIVE_KEY_REGEX.test(parentKey)) {
      return '[REDACTED]';
    }

    return value;
  }

  function log(level, event, meta = {}) {
    const payload = {
      timestamp: new Date().toISOString(),
      level,
      event,
      ...redact(meta)
    };
    const line = JSON.stringify(payload);
    if (level === 'error') {
      console.error(line);
      return;
    }
    console.log(line);
  }

module.exports = {
    info: (event, meta) => log('info', event, meta),
    warn: (event, meta) => log('warn', event, meta),
    error: (event, meta) => log('error', event, meta)
};
`,

  requestContextMiddleware: () => `
const { randomUUID } = require('crypto');

module.exports = (req, res, next) => {
  const inboundId = req.headers['x-correlation-id'] || req.headers['x-request-id'];
  req.id = typeof inboundId === 'string' && inboundId.trim() ? inboundId.trim() : randomUUID();
  res.setHeader('x-correlation-id', req.id);
  next();
};
`,

  requestLoggerMiddleware: () => `
const logger = require('../utils/logger');

function statusLevel(code) {
  if (code >= 500) return 'error';
  if (code >= 400) return 'warn';
  return 'info';
}

module.exports = (req, res, next) => {
  const startedAt = Date.now();

  res.on('finish', () => {
    const durationMs = Date.now() - startedAt;
    const level = statusLevel(res.statusCode);
    logger[level]('http.request', {
      correlationId: req.id,
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs,
      userId: req.userId || null,
      ip: req.ip,
    });
  });

  next();
};
`,

  pagination: () => `
const AppError = require('./AppError');

const MAX_LIMIT = Number(process.env.API_MAX_LIMIT) || 100;

function normalizePagination(page, limit) {
  const parsedPage = Number.parseInt(page, 10);
  const parsedLimit = Number.parseInt(limit, 10);

  if (!Number.isInteger(parsedPage) || parsedPage < 1) {
    throw new AppError(400, 'Invalid page. It must be an integer >= 1.');
  }
  if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > MAX_LIMIT) {
    throw new AppError(400, 'Invalid limit. It must be an integer between 1 and ' + MAX_LIMIT + '.');
  }

  return { page: parsedPage, limit: parsedLimit };
}

function parseIncludeTotal(value) {
  if (value === undefined || value === null || value === '') return true;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;
  }
  throw new AppError(400, 'Invalid includeTotal. Use true or false.');
}

module.exports = {
  MAX_LIMIT,
  normalizePagination,
  parseIncludeTotal
};
`,

  server: () => `
const app = require('./app');
const env = require('./config/env');
const logger = require('./utils/logger');
app.listen(env.PORT, () => logger.info('server.started', { port: env.PORT }));
`,

  packageJson: () =>
    JSON.stringify(
      {
        name: "generated-api",
        version: "1.0.0",
        main: "src/server.js",
        scripts: {
          start: "node src/server.js",
          dev: "nodemon src/server.js",
        },
        dependencies: {
          express: "^4.18.2",
          cors: "^2.8.5",
          helmet: "^8.0.0",
          mysql2: "^3.6.1",
          dotenv: "^16.3.1",
          "express-rate-limit": "^7.4.1",
          "express-slow-down": "^2.0.3",
          jsonwebtoken: "^9.0.2",
          "swagger-ui-express": "^5.0.1",
        },
        devDependencies: {
          nodemon: "^3.1.4",
        },
      },
      null,
      4,
    ),

  database: () => `
const mysql = require('mysql2/promise');
const env = require('./env');

const pool = mysql.createPool({
    host: env.DB_HOST,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    port: env.DB_PORT,
    waitForConnections: true,
  connectionLimit: Number(process.env.DB_CONNECTION_LIMIT) || 10,
  queueLimit: Number(process.env.DB_QUEUE_LIMIT) || 0,
  connectTimeout: Number(process.env.DB_CONNECT_TIMEOUT_MS) || 10000,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0
});

module.exports = pool;
`,

  env: () => `
require('dotenv').config();

  function parseNumber(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function parseBoolean(value, fallback = false) {
    if (value === undefined || value === null || value === '') return fallback;
    if (typeof value === 'boolean') return value;
    const normalized = String(value).toLowerCase().trim();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
    return fallback;
  }

  function parseList(value, fallback = []) {
    if (!value) return fallback;
    return String(value)
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function parseJwtKeyMap(value) {
    const pairs = parseList(value);
    if (pairs.length === 0) return {};

    return pairs.reduce((acc, pair) => {
      const [kid, ...secretParts] = pair.split(':');
      const secret = secretParts.join(':').trim();
      const normalizedKid = (kid || '').trim();

      if (!normalizedKid || !secret) {
        throw new Error('Invalid JWT_KEYS entry. Use kid:secret format.');
      }

      acc[normalizedKid] = secret;
      return acc;
    }, {});
  }

  function assertStrongSecret(secret, context) {
    if (!secret) {
      throw new Error(context + ' is required.');
    }

    if (process.env.NODE_ENV === 'production' && secret.length < 32) {
      throw new Error(context + ' must contain at least 32 characters in production.');
    }
  }

  const NODE_ENV = process.env.NODE_ENV || 'development';
  const AUTH_DISABLED = parseBoolean(process.env.AUTH_DISABLED, false);

  if (NODE_ENV === 'production' && AUTH_DISABLED) {
    throw new Error('AUTH_DISABLED cannot be true in production.');
  }

  const JWT_KEYS = parseJwtKeyMap(process.env.JWT_KEYS);
  const JWT_ACTIVE_KID = process.env.JWT_ACTIVE_KID || '';

  if (!AUTH_DISABLED) {
    if (Object.keys(JWT_KEYS).length > 0) {
      if (!JWT_ACTIVE_KID) {
        throw new Error('JWT_ACTIVE_KID is required when JWT_KEYS is configured.');
      }

      if (!JWT_KEYS[JWT_ACTIVE_KID]) {
        throw new Error('JWT_ACTIVE_KID must match one of the configured JWT_KEYS.');
      }

      Object.values(JWT_KEYS).forEach((secret, index) => {
        assertStrongSecret(secret, 'JWT_KEYS[' + index + ']');
      });
    } else {
      assertStrongSecret(process.env.JWT_SECRET, 'JWT_SECRET');
    }
  }

  const CORS_ALLOWED_ORIGINS = parseList(process.env.CORS_ALLOWED_ORIGINS);

module.exports = {
    NODE_ENV,
    PORT: process.env.PORT || 3000,
    DB_HOST: process.env.DB_HOST,
    DB_USER: process.env.DB_USER,
    DB_PASSWORD: process.env.DB_PASSWORD,
    DB_NAME: process.env.DB_NAME,
    DB_PORT: parseNumber(process.env.DB_PORT, 3306),
    JWT_SECRET: process.env.JWT_SECRET,
    JWT_KEYS,
    JWT_ACTIVE_KID,
    JWT_ISSUER: process.env.JWT_ISSUER || 'generated-api',
    JWT_AUDIENCE: process.env.JWT_AUDIENCE || 'generated-api-clients',
    JWT_ALGORITHMS: parseList(process.env.JWT_ALGORITHMS, ['HS256']),
    JWT_ACCESS_MAX_AGE: process.env.JWT_ACCESS_MAX_AGE || '15m',
    DB_QUERY_TIMEOUT_MS: parseNumber(process.env.DB_QUERY_TIMEOUT_MS, 10000),
    API_MAX_LIMIT: parseNumber(process.env.API_MAX_LIMIT, 100),
    API_JSON_LIMIT: process.env.API_JSON_LIMIT || '256kb',
    API_MAX_QUERY_PARAMS: parseNumber(process.env.API_MAX_QUERY_PARAMS, 20),
    API_MAX_URL_LENGTH: parseNumber(process.env.API_MAX_URL_LENGTH, 2048),
    RATE_LIMIT_WINDOW_MS: parseNumber(process.env.RATE_LIMIT_WINDOW_MS, 60 * 1000),
    RATE_LIMIT_MAX: parseNumber(process.env.RATE_LIMIT_MAX, 120),
    RATE_LIMIT_SENSITIVE_MAX: parseNumber(process.env.RATE_LIMIT_SENSITIVE_MAX, 40),
    SLOW_DOWN_WINDOW_MS: parseNumber(process.env.SLOW_DOWN_WINDOW_MS, 60 * 1000),
    SLOW_DOWN_DELAY_AFTER: parseNumber(process.env.SLOW_DOWN_DELAY_AFTER, 40),
    SLOW_DOWN_DELAY_MS: parseNumber(process.env.SLOW_DOWN_DELAY_MS, 200),
    CORS_ALLOWED_ORIGINS,
    AUTH_DISABLED,
    SWAGGER_ENABLED: parseBoolean(process.env.SWAGGER_ENABLED, NODE_ENV !== 'production'),
    SWAGGER_REQUIRE_ADMIN: parseBoolean(process.env.SWAGGER_REQUIRE_ADMIN, true),
    SWAGGER_ALLOWED_IPS: parseList(process.env.SWAGGER_ALLOWED_IPS)
};
`,

  authMiddleware: () => `
const jwt = require('jsonwebtoken');
const env = require('../config/env');
  const AppError = require('../utils/AppError');

  function unauthorized(next) {
    return next(new AppError(401, 'Unauthorized'));
  }

  function extractToken(authHeader) {
    if (!authHeader) return null;

    const parts = authHeader.split(' ');
    if (parts.length !== 2) return null;

    const [scheme, token] = parts;
    if (!/^Bearer$/i.test(scheme)) return null;
    return token;
  }

  function resolveSecret(token) {
    if (Object.keys(env.JWT_KEYS).length === 0) {
      return env.JWT_SECRET;
    }

    const decoded = jwt.decode(token, { complete: true });
    const kid = decoded && decoded.header ? decoded.header.kid : null;

    if (!kid || !env.JWT_KEYS[kid]) {
      throw new AppError(401, 'Unauthorized');
    }

    return env.JWT_KEYS[kid];
  }

  function assertRequiredClaims(decoded) {
    const requiredClaims = ['iss', 'aud', 'sub', 'exp', 'iat'];
    const missing = requiredClaims.filter((claim) => decoded[claim] === undefined || decoded[claim] === null || decoded[claim] === '');

    if (missing.length > 0) {
      throw new AppError(401, 'Unauthorized');
    }
  }

module.exports = (req, res, next) => {
    if (env.AUTH_DISABLED) {
        req.auth = { sub: 'dev', roles: ['admin'], scope: 'admin' };
        req.userId = 'dev';
        return next();
    }

    const token = extractToken(req.headers.authorization);
    if (!token) return unauthorized(next);

    let secret;
    try {
      secret = resolveSecret(token);
    } catch (error) {
      return unauthorized(next);
    }

    jwt.verify(
      token,
      secret,
      {
        algorithms: env.JWT_ALGORITHMS,
        issuer: env.JWT_ISSUER,
        audience: env.JWT_AUDIENCE,
        maxAge: env.JWT_ACCESS_MAX_AGE,
      },
      (err, decoded) => {
        if (err) return unauthorized(next);

        try {
          assertRequiredClaims(decoded);
        } catch (claimError) {
          return unauthorized(next);
        }

        req.auth = decoded;
        req.userId = decoded.sub || decoded.id;
        return next();
      }
    );
};
`,

  authorizeMiddleware: () => `
  const AppError = require('../utils/AppError');
  const env = require('../config/env');

  function normalizeArray(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value.map((item) => String(item));
    if (typeof value === 'string') {
      return value
        .split(' ')
        .map((item) => item.trim())
        .filter(Boolean);
    }
    return [];
  }

  module.exports = ({ anyRole = [], anyScope = [] } = {}) => {
    const requiredRoles = new Set(anyRole.map((role) => String(role)));
    const requiredScopes = new Set(anyScope.map((scope) => String(scope)));

    return (req, res, next) => {
      if (env.AUTH_DISABLED) return next();

      const auth = req.auth || {};
      const userRoles = new Set(normalizeArray(auth.roles || auth.role));
      const userScopes = new Set(normalizeArray(auth.scope || auth.scopes));

      const roleAllowed =
        requiredRoles.size === 0 ||
        Array.from(requiredRoles).some((role) => userRoles.has(role));

      const scopeAllowed =
        requiredScopes.size === 0 ||
        Array.from(requiredScopes).some((scope) => userScopes.has(scope));

      if (!roleAllowed || !scopeAllowed) {
        return next(new AppError(403, 'Forbidden'));
      }

      return next();
    };
  };
  `,

  gitignoreFile: () => `node_modules/
.env
dist/
*.log
npm-debug.log*
`,

  envfile: () => `PORT=${process.env.PORT || 3000}
NODE_ENV=development



DB_HOST=${process.env.DB_HOST || "localhost"}
DB_USER=${process.env.DB_USER || "root"}
DB_PASSWORD=${process.env.DB_PASSWORD || ""}
DB_NAME=${process.env.DB_NAME || "my_database"}
DB_PORT=${process.env.DB_PORT || 3306}

# Disable auth for all routes (non-production only; blocked in production)
AUTH_DISABLED=false

JWT_SECRET=replace_with_minimum_32_characters_secret
JWT_ISSUER=generated-api
JWT_AUDIENCE=generated-api-clients
JWT_ALGORITHMS=HS256
JWT_ACCESS_MAX_AGE=15m

# Optional key rotation format: kid:secret,kid2:secret2
JWT_KEYS=
JWT_ACTIVE_KID=

DB_CONNECTION_LIMIT=10
DB_QUEUE_LIMIT=0
DB_CONNECT_TIMEOUT_MS=10000
DB_QUERY_TIMEOUT_MS=10000
API_MAX_LIMIT=100
API_JSON_LIMIT=256kb
API_MAX_QUERY_PARAMS=20
API_MAX_URL_LENGTH=2048

RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=120
RATE_LIMIT_SENSITIVE_MAX=40
SLOW_DOWN_WINDOW_MS=60000
SLOW_DOWN_DELAY_AFTER=40
SLOW_DOWN_DELAY_MS=200

# CORS allowlist (comma separated)
CORS_ALLOWED_ORIGINS=http://localhost:3000

# Swagger defaults are secure for production
SWAGGER_ENABLED=true
SWAGGER_REQUIRE_ADMIN=true
SWAGGER_ALLOWED_IPS=
`,
};
