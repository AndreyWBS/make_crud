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

  app: (tables) => `
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
  const { fullSpec, resourceSpecs, resources } = require('./docs/swagger/swaggerSpec');
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
          error: 'Forbidden',
          message: 'Swagger access denied.',
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

    const swaggerUrls = resources.map((resource) => ({
      name: resource,
      url: '/api-docs/' + resource + '.json',
    }));

    app.get('/api-docs.json', ...swaggerGuards, (req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.send(fullSpec);
    });

    app.get('/api-docs/resources.json', ...swaggerGuards, (req, res) => {
      const items = resources.map((resource) => ({
        resource,
        json: '/api-docs/' + resource + '.json',
        ui: '/api-docs/ui?urls.primaryName=' + encodeURIComponent(resource),
      }));
      res.json({
        resources: items,
        segmentedUi: '/api-docs/ui',
        fullUi: '/api-docs/full',
        fullJson: '/api-docs.json',
      });
    });

    app.get('/api-docs/:resource.json', ...swaggerGuards, (req, res) => {
      const resource = req.params.resource;
      const spec = resourceSpecs[resource];
      if (!spec) {
        return res.status(404).json({
          status: 404,
          error: 'Not Found',
          message: 'Swagger resource not found.',
          correlationId: req.id,
        });
      }

      res.setHeader('Content-Type', 'application/json');
      return res.send(spec);
    });

    app.get('/api-docs', ...swaggerGuards, (req, res) => {
      const cards = resources
        .map((resource) => {
          const uiLink = '/api-docs/ui?urls.primaryName=' + encodeURIComponent(resource);
          const jsonLink = '/api-docs/' + resource + '.json';
          return (
            '<article class="card">' +
              '<h3>' + resource + '</h3>' +
              '<p>Documentacao segmentada do recurso <strong>' + resource + '</strong>.</p>' +
              '<div class="actions">' +
                '<a class="btn" href="' + uiLink + '">Abrir UI</a>' +
                '<a class="btn btn-light" href="' + jsonLink + '">JSON</a>' +
              '</div>' +
            '</article>'
          );
        })
        .join('');

      return res.send(
        '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
          '<title>Portal da Documentacao da API</title>' +
          '<style>' +
            ':root{--bg:#f4f7fb;--ink:#13203a;--muted:#5a6780;--brand:#165dff;--card:#fff;--line:#dbe3f2;}' +
            '*{box-sizing:border-box}body{margin:0;font-family:Segoe UI,Arial,sans-serif;background:linear-gradient(180deg,#eef3ff 0,#f8faff 100%);color:var(--ink)}' +
            '.hero{padding:36px 20px;border-bottom:1px solid var(--line);background:radial-gradient(circle at 20% 10%,#dbe6ff,transparent 35%),radial-gradient(circle at 80% 0,#e9f0ff,transparent 30%)}' +
            '.wrap{max-width:1100px;margin:0 auto}.hero h1{margin:0 0 8px;font-size:30px}.hero p{margin:0;color:var(--muted)}' +
            '.toolbar{display:flex;gap:10px;flex-wrap:wrap;margin-top:16px}.btn{display:inline-block;padding:10px 14px;border-radius:10px;background:var(--brand);color:#fff;text-decoration:none;font-weight:600}.btn-light{background:#fff;color:var(--ink);border:1px solid var(--line)}' +
            '.content{padding:24px 20px}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px}' +
            '.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px;box-shadow:0 6px 20px rgba(20,40,80,.05)}' +
            '.card h3{margin:0 0 8px;font-size:18px}.card p{margin:0 0 12px;color:var(--muted);font-size:14px}.actions{display:flex;gap:8px;flex-wrap:wrap}' +
          '</style></head><body>' +
          '<header class="hero"><div class="wrap">' +
            '<h1>Portal da Documentacao da API</h1>' +
            '<p>Acesse a documentacao completa ou segmentada por recurso para carregamento mais rapido.</p>' +
            '<div class="toolbar">' +
              '<a class="btn" href="/api-docs/ui">Swagger Segmentado (UI)</a>' +
              '<a class="btn btn-light" href="/api-docs/full">Swagger Completo</a>' +
              '<a class="btn btn-light" href="/api-docs.json">JSON Completo</a>' +
            '</div>' +
          '</div></header>' +
          '<main class="content"><div class="wrap"><section class="grid">' + cards + '</section></div></main>' +
          '</body></html>'
      );
    });

    app.use('/api-docs/ui', ...swaggerGuards, swaggerUi.serve, swaggerUi.setup(fullSpec, {
      customSiteTitle: 'Internal API Docs - Segmented',
      swaggerOptions: {
        urls: swaggerUrls,
        docExpansion: 'none',
      },
    }));

    app.use('/api-docs/full', ...swaggerGuards, swaggerUi.serveFiles(fullSpec), swaggerUi.setup(fullSpec, {
      customSiteTitle: 'Internal API Docs - Full',
    }));

    app.get('/api-docs/:resource', ...swaggerGuards, (req, res) => {
      const resource = req.params.resource;
      const spec = resourceSpecs[resource];
      if (!spec) {
        return res.status(404).json({
          status: 404,
          error: 'Not Found',
          message: 'Swagger resource not found.',
          correlationId: req.id,
        });
      }

      return res.redirect('/api-docs/ui?urls.primaryName=' + encodeURIComponent(resource));
    });
  }

  app.use('/docs', express.static(path.join(__dirname, 'docs/html')));

  ${tables.map((t) => `app.use('/api/${t}', ${camelCase(t)}Route);`).join('\n')}

  // Tratamento centralizado de erros deve ser o último middleware.
  app.use(errorMiddleware);
  module.exports = app;
  `,
};
