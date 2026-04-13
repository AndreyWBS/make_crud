const { camelCase, pascalCase } = require('../../utils/stringUtils');
const { buildComponentsSchemas } = require('./swagger/schemaMapper');
const { buildPaths } = require('./swagger/pathBuilder');

module.exports = {
  swaggerSpec: (tables, schema) => {
    const componentsSchemas = buildComponentsSchemas(tables, schema);
    const paths = buildPaths(tables, schema);

    const baseInfo = {
      title: 'Generated CRUD API',
      version: '1.0.0',
      description: 'Documentacao gerada automaticamente pelo generator.',
    };

    const baseServers = [{ url: 'http://localhost:3000', description: 'Servidor local' }];

    const baseSecuritySchemes = {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    };

    const fullSpec = {
      openapi: '3.0.3',
      info: baseInfo,
      servers: baseServers,
      components: {
        securitySchemes: baseSecuritySchemes,
        schemas: componentsSchemas,
      },
      paths,
    };

    const resourceSpecs = tables.reduce((acc, table) => {
      const className = pascalCase(table);
      const tablePrefix = `/api/${table}`;

      const tablePaths = Object.fromEntries(
        Object.entries(paths).filter(([pathKey]) => pathKey.startsWith(tablePrefix)),
      );

      acc[table] = {
        openapi: '3.0.3',
        info: {
          ...baseInfo,
          title: `${baseInfo.title} - ${className}`,
          description: `Documentacao segmentada do recurso ${className}.`,
        },
        servers: baseServers,
        components: {
          securitySchemes: baseSecuritySchemes,
          schemas: {
            [className]: componentsSchemas[className],
            [`${className}Input`]: componentsSchemas[`${className}Input`],
          },
        },
        paths: tablePaths,
      };

      return acc;
    }, {});

    return `
  /**
   * @fileoverview Especificações OpenAPI geradas automaticamente.
   * @type {{ fullSpec: Record<string, any>, resourceSpecs: Record<string, any>, resources: string[] }}
   */
  module.exports = {
    fullSpec: ${JSON.stringify(fullSpec, null, 4)},
    resourceSpecs: ${JSON.stringify(resourceSpecs, null, 4)},
    resources: ${JSON.stringify(tables, null, 4)}
  };
  `;
  },

  app: (tables, language = 'pt') => {
    const appI18n = (() => {
      const dict = {
        pt: {
          badRequest: 'Requisicao Invalida',
          uriTooLong: 'URI muito longa',
          tooMany: 'Muitas Requisicoes',
          forbidden: 'Proibido',
          notFound: 'Nao Encontrado',
          tooManyQueryParams: 'Muitos parametros de consulta.',
          urlTooLong: 'A URL da requisicao e muito longa.',
          rateLimitExceeded: 'Limite de requisicoes excedido.',
          sensitiveRateLimitExceeded: 'Limite de requisicoes de rota sensivel excedido.',
          swaggerAccessDenied: 'Acesso ao Swagger negado.',
          swaggerNotFound: 'Recurso do Swagger nao encontrado.',
        },
        en: {
          badRequest: 'Bad Request',
          uriTooLong: 'URI Too Long',
          tooMany: 'Too Many Requests',
          forbidden: 'Forbidden',
          notFound: 'Not Found',
          tooManyQueryParams: 'Too many query parameters.',
          urlTooLong: 'Request URL is too long.',
          rateLimitExceeded: 'Rate limit exceeded.',
          sensitiveRateLimitExceeded: 'Sensitive route rate limit exceeded.',
          swaggerAccessDenied: 'Swagger access denied.',
          swaggerNotFound: 'Swagger resource not found.',
        },
      };
      const norm = String(language || '')
        .trim()
        .toLowerCase();
      return norm === 'pt' || norm === 'pt-br' || norm === 'pt_br' ? dict.pt : dict.en;
    })();
    return `
  /**
   * @fileoverview Composição principal da aplicação Express.
   * @description Configura hardening, observabilidade, middlewares e rotas.
   */

  const express = require('express');
  const path = require('path');
  const helmet = require('helmet');
  const cors = require('cors');
  const rateLimit = require('express-rate-limit');
  const slowDown = require('express-slow-down');
  const swaggerUi = require('swagger-ui-express');
  const { fullSpec } = require('./docs/swagger/swaggerSpec');
  const env = require('./config/env');
  const authMiddleware = require('./middlewares/authMiddleware');
  const authorize = require('./middlewares/authorizeMiddleware');
  const errorMiddleware = require('./middlewares/errorMiddleware');
  const requestContextMiddleware = require('./middlewares/requestContextMiddleware');
  const requestLoggerMiddleware = require('./middlewares/requestLoggerMiddleware');
  ${tables.map((t) => `const ${camelCase(t)}Route = require('./routes/${camelCase(t)}Route');`).join('\n')}

  const app = express();

  // Hardening base da aplicação HTTP.
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  // Contexto de rastreio e logging por requisição.
  app.use(requestContextMiddleware);
  app.use(requestLoggerMiddleware);

  // Cabeçalhos de segurança e proteção de navegação.
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

  // Protege contra querystring abusiva e URLs excessivamente longas.
  app.use((req, res, next) => {
    const queryCount = Object.keys(req.query || {}).length;
    if (queryCount > env.API_MAX_QUERY_PARAMS) {
      return res.status(400).json({
        status: 400,
        error: ${JSON.stringify(appI18n.badRequest)},
        message: ${JSON.stringify(appI18n.tooManyQueryParams)},
        correlationId: req.id,
      });
    }

    if ((req.originalUrl || '').length > env.API_MAX_URL_LENGTH) {
      return res.status(414).json({
        status: 414,
        error: ${JSON.stringify(appI18n.uriTooLong)},
        message: ${JSON.stringify(appI18n.urlTooLong)},
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
    message: { status: 429, error: ${JSON.stringify(appI18n.tooMany)}, message: ${JSON.stringify(appI18n.rateLimitExceeded)} },
  });

  const sensitiveRateLimit = rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    max: env.RATE_LIMIT_SENSITIVE_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    message: { status: 429, error: ${JSON.stringify(appI18n.tooMany)}, message: ${JSON.stringify(appI18n.sensitiveRateLimitExceeded)} },
  });

  const globalSlowDown = slowDown({
    windowMs: env.SLOW_DOWN_WINDOW_MS,
    delayAfter: env.SLOW_DOWN_DELAY_AFTER,
    delayMs: () => env.SLOW_DOWN_DELAY_MS,
  });

  // Camada anti-abuso global para todos os endpoints de API.
  app.use('/api', globalRateLimit);
  app.use('/api', globalSlowDown);

  const SENSITIVE_ROUTE_PATTERN = new RegExp('^/api/[^/]+/search/');
  // Endpoints mais sensíveis recebem limite mais agressivo.
  app.use((req, res, next) => {
    const isSensitiveRoute = SENSITIVE_ROUTE_PATTERN.test(req.path) || req.path === '/token' || req.path === '/login';
    if (isSensitiveRoute) {
      return sensitiveRateLimit(req, res, next);
    }
    return next();
  });

  /**
   * Resolve IP do cliente considerando proxy reverso.
   * @param {import('express').Request} req
   * @returns {string}
   */
  function extractClientIp(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.trim()) {
      return forwarded.split(',')[0].trim();
    }
    return req.ip;
  }

  /**
   * Protege acesso ao Swagger por política de IP.
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   * @returns {void|import('express').Response}
   */
  function guardSwaggerAccess(req, res, next) {
    if (env.SWAGGER_ALLOWED_IPS.length > 0) {
      const clientIp = extractClientIp(req);
      if (!env.SWAGGER_ALLOWED_IPS.includes(clientIp)) {
        return res.status(403).json({
          status: 403,
          error: ${JSON.stringify(appI18n.forbidden)},
          message: ${JSON.stringify(appI18n.swaggerAccessDenied)},
          correlationId: req.id,
        });
      }
    }

    return next();
  }

  if (env.SWAGGER_ENABLED) {
    // Swagger pode ser protegido por IP e perfil administrativo.
    const swaggerGuards = [guardSwaggerAccess];
    if (env.SWAGGER_REQUIRE_ADMIN) {
      swaggerGuards.push(authMiddleware, authorize({ anyRole: ['admin'] }));
    }

    app.get('/api-docs.json', ...swaggerGuards, (req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.send(fullSpec);
    });

    app.use('/api-docs', ...swaggerGuards, swaggerUi.serve, swaggerUi.setup(fullSpec));
  }

  app.use('/docs', express.static(path.join(__dirname, 'docs/html')));

  ${tables.map((t) => `app.use('/api/${t}', ${camelCase(t)}Route);`).join('\n')}

  // Tratamento centralizado de erros deve ser o último middleware.
  app.use(errorMiddleware);
  module.exports = app;
  `;
  },
};
