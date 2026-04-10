const { camelCase } = require("../../utils/stringUtils");
const { buildComponentsSchemas } = require("./swagger/schemaMapper");
const { buildPaths } = require("./swagger/pathBuilder");

module.exports = {
  swaggerSpec: (tables, schema) => {
    const componentsSchemas = buildComponentsSchemas(tables, schema);
    const paths = buildPaths(tables, schema);

    const swaggerSpec = {
      openapi: "3.0.3",
      info: {
        title: "Generated CRUD API",
        version: "1.0.0",
        description: "Documentacao gerada automaticamente pelo generator.",
      },
      servers: [
        { url: "http://localhost:3000", description: "Servidor local" },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT",
          },
        },
        schemas: componentsSchemas,
      },
      paths,
    };

    return `
  module.exports = ${JSON.stringify(swaggerSpec, null, 4)};
  `;
  },

  app: (tables) => `
  const express = require('express');
  const path = require('path');
  const helmet = require('helmet');
  const cors = require('cors');
  const rateLimit = require('express-rate-limit');
  const slowDown = require('express-slow-down');
  const swaggerUi = require('swagger-ui-express');
  const swaggerSpec = require('./docs/swagger/swaggerSpec');
  const env = require('./config/env');
  const authMiddleware = require('./middlewares/authMiddleware');
  const authorize = require('./middlewares/authorizeMiddleware');
  const errorMiddleware = require('./middlewares/errorMiddleware');
  const requestContextMiddleware = require('./middlewares/requestContextMiddleware');
  const requestLoggerMiddleware = require('./middlewares/requestLoggerMiddleware');
  ${tables.map((t) => `const ${camelCase(t)}Route = require('./routes/${camelCase(t)}Route');`).join("\n")}

  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(requestContextMiddleware);
  app.use(requestLoggerMiddleware);

  app.use(helmet({
    contentSecurityPolicy: false,
    hsts: env.NODE_ENV === 'production' ? { maxAge: 15552000, includeSubDomains: true, preload: true } : false,
    referrerPolicy: { policy: 'no-referrer' },
  }));

  app.use(cors({
    origin: (origin, callback) => {
      if (!origin || env.CORS_ALLOWED_ORIGINS.length === 0) return callback(null, true);
      if (env.CORS_ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
      return callback(new Error('CORS origin denied'));
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Correlation-Id'],
    exposedHeaders: ['X-Correlation-Id'],
    credentials: true,
    maxAge: 600,
  }));

  app.use(express.json({ limit: env.API_JSON_LIMIT }));

  app.use((req, res, next) => {
    const queryCount = Object.keys(req.query || {}).length;
    if (queryCount > env.API_MAX_QUERY_PARAMS) {
      return res.status(400).json({
        status: 400,
        error: 'Bad Request',
        message: 'Too many query parameters.',
        correlationId: req.id,
      });
    }

    if ((req.originalUrl || '').length > env.API_MAX_URL_LENGTH) {
      return res.status(414).json({
        status: 414,
        error: 'URI Too Long',
        message: 'Request URL is too long.',
        correlationId: req.id,
      });
    }

    return next();
  });

  const globalRateLimit = rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    max: env.RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    message: { status: 429, error: 'Too Many Requests', message: 'Rate limit exceeded.' },
  });

  const sensitiveRateLimit = rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    max: env.RATE_LIMIT_SENSITIVE_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    message: { status: 429, error: 'Too Many Requests', message: 'Sensitive route rate limit exceeded.' },
  });

  const globalSlowDown = slowDown({
    windowMs: env.SLOW_DOWN_WINDOW_MS,
    delayAfter: env.SLOW_DOWN_DELAY_AFTER,
    delayMs: () => env.SLOW_DOWN_DELAY_MS,
  });

  app.use('/api', globalRateLimit);
  app.use('/api', globalSlowDown);

  const SENSITIVE_ROUTE_PATTERN = new RegExp('^/api/[^/]+/search/');
  app.use((req, res, next) => {
    const isSensitiveRoute = SENSITIVE_ROUTE_PATTERN.test(req.path) || req.path === '/token' || req.path === '/login';
    if (isSensitiveRoute) {
      return sensitiveRateLimit(req, res, next);
    }
    return next();
  });

  function extractClientIp(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.trim()) {
      return forwarded.split(',')[0].trim();
    }
    return req.ip;
  }

  function guardSwaggerAccess(req, res, next) {
    if (env.SWAGGER_ALLOWED_IPS.length > 0) {
      const clientIp = extractClientIp(req);
      if (!env.SWAGGER_ALLOWED_IPS.includes(clientIp)) {
        return res.status(403).json({
          status: 403,
          error: 'Forbidden',
          message: 'Swagger access denied.',
          correlationId: req.id,
        });
      }
    }

    return next();
  }

  if (env.SWAGGER_ENABLED) {
    const swaggerGuards = [guardSwaggerAccess];
    if (env.SWAGGER_REQUIRE_ADMIN) {
      swaggerGuards.push(authMiddleware, authorize({ anyRole: ['admin'] }));
    }

    app.get('/api-docs.json', ...swaggerGuards, (req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.send(swaggerSpec);
    });

    app.use('/api-docs', ...swaggerGuards, swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
      customSiteTitle: 'Internal API Docs',
    }));
  }

  app.use('/docs', express.static(path.join(__dirname, 'docs/html')));

  ${tables.map((t) => `app.use('/api/${t}', ${camelCase(t)}Route);`).join("\n")}

  app.use(errorMiddleware);
  module.exports = app;
  `,
};
