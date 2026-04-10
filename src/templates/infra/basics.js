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
    logger.error(err.stack || err.message);

    // Operational errors (AppError)
    if (err instanceof AppError) {
        return res.status(err.statusCode).json({
            status: err.statusCode,
            error: httpStatusText(err.statusCode),
            message: err.message,
            ...(err.details && { details: err.details }),
        });
    }

    // MySQL errors
    if (err.code && MYSQL_ERROR_MAP[err.code]) {
        const mapped = MYSQL_ERROR_MAP[err.code];
        return res.status(mapped.status).json({
            status: mapped.status,
            error: httpStatusText(mapped.status),
            message: mapped.message,
        });
    }

    // JWT errors
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
        return res.status(401).json({
            status: 401,
            error: 'Unauthorized',
            message: err.name === 'TokenExpiredError' ? 'Token expired.' : 'Invalid token.',
        });
    }

    // SyntaxError in JSON body parsing
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
        return res.status(400).json({
            status: 400,
            error: 'Bad Request',
            message: 'Invalid JSON in request body.',
        });
    }

    // Fallback: unexpected internal error
    return res.status(500).json({
        status: 500,
        error: 'Internal Server Error',
        message: 'An unexpected error occurred. Please try again later.',
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
module.exports = {
    info: (msg) => console.log(\`[INFO] \${new Date().toISOString()}: \${msg}\`),
    error: (msg) => console.error(\`[ERROR] \${new Date().toISOString()}: \${msg}\`)
};
`,

  server: () => `
const app = require('./app');
const env = require('./config/env');
const logger = require('./utils/logger');
app.listen(env.PORT, () => logger.info(\`Server running on port \${env.PORT}\`));
`,

  packageJson: () =>
    JSON.stringify(
      {
        name: "generated-api",
        version: "1.0.0",
        main: "src/server.js",
        scripts: { start: "node src/server.js" },
        dependencies: {
          express: "^4.18.2",
          mysql2: "^3.6.1",
          dotenv: "^16.3.1",
          jsonwebtoken: "^9.0.2",
          "swagger-ui-express": "^5.0.1",
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
    connectionLimit: 10,
    queueLimit: 0
});

module.exports = pool;
`,

  env: () => `
require('dotenv').config();

module.exports = {
    PORT: process.env.PORT || 3000,
    DB_HOST: process.env.DB_HOST,
    DB_USER: process.env.DB_USER,
    DB_PASSWORD: process.env.DB_PASSWORD,
    DB_NAME: process.env.DB_NAME,
    DB_PORT: Number(process.env.DB_PORT) || 3306,
    JWT_SECRET: process.env.JWT_SECRET || 'secret'
};
`,

  authMiddleware: () => `
const jwt = require('jsonwebtoken');
const env = require('../config/env');

module.exports = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'No token provided' });

    const parts = authHeader.split(' ');
    if (parts.length !== 2) return res.status(401).json({ error: 'Token error' });

    const [scheme, token] = parts;
    if (!/^Bearer$/i.test(scheme)) return res.status(401).json({ error: 'Token malformatted' });

    jwt.verify(token, env.JWT_SECRET, (err, decoded) => {
        if (err) return res.status(401).json({ error: 'Token invalid' });
        req.userId = decoded.id;
        return next();
    });
};
`,

  envfile: () => `PORT=3000
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=
DB_NAME=my_database
DB_PORT=3306
JWT_SECRET=your_jwt_secret
`,
};
