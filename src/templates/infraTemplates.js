const { camelCase, pascalCase } = require("../utils/stringUtils");

module.exports = {
  errorMiddleware: () => `
const logger = require('../utils/logger');
module.exports = (err, req, res, next) => {
    logger.error(err.stack);
    res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' });
};
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
  packageJson: (tables) =>
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

  swaggerSpec: (tables, schema) => {
    const toOpenApiSchema = (column) => {
      const dbType = String(column.type || "").toLowerCase();

      if (dbType.includes("tinyint(1)") || dbType.includes("bool")) {
        return { type: "boolean", example: true };
      }

      if (dbType.includes("int")) {
        return { type: "integer", example: 1 };
      }

      if (
        dbType.includes("decimal") ||
        dbType.includes("float") ||
        dbType.includes("double")
      ) {
        return { type: "number", example: 10.5 };
      }

      if (
        dbType.includes("date") ||
        dbType.includes("time") ||
        dbType.includes("year")
      ) {
        return {
          type: "string",
          format: "date-time",
          example: "2026-01-01T00:00:00.000Z",
        };
      }

      if (dbType.includes("json")) {
        return {
          type: "object",
          additionalProperties: true,
          example: { key: "value" },
        };
      }

      return { type: "string", example: "texto" };
    };

    const buildRequestBodySchema = (table) => {
      const columns = (schema[table] && schema[table].columns) || [];
      const pk = columns.find((c) => c.key === "PRI")?.name || "id";
      const nonPkColumns = columns.filter((c) => c.name !== pk);
      const properties = nonPkColumns.reduce((acc, col) => {
        acc[col.name] = toOpenApiSchema(col);
        return acc;
      }, {});

      return {
        type: "object",
        properties,
        required: nonPkColumns
          .filter((c) => c.nullable === "NO" && c.default === null)
          .map((c) => c.name),
      };
    };

    const buildEntitySchema = (table) => {
      const columns = (schema[table] && schema[table].columns) || [];
      const properties = columns.reduce((acc, col) => {
        acc[col.name] = toOpenApiSchema(col);
        return acc;
      }, {});

      return {
        type: "object",
        properties,
      };
    };

    const componentsSchemas = tables.reduce((acc, table) => {
      const className = pascalCase(table);
      acc[className] = buildEntitySchema(table);
      acc[`${className}Input`] = buildRequestBodySchema(table);
      return acc;
    }, {});

    const paths = {};

    tables.forEach((table) => {
      const className = pascalCase(table);
      const columns = (schema[table] && schema[table].columns) || [];
      const pk = columns.find((c) => c.key === "PRI")?.name || "id";
      const nonPkColumns = columns.filter((c) => c.name !== pk);

      paths[`/api/${table}`] = {
        get: {
          tags: [className],
          summary: `Lista registros de ${className}`,
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: "query",
              name: "page",
              schema: { type: "integer", minimum: 1, default: 1 },
            },
            {
              in: "query",
              name: "limit",
              schema: { type: "integer", minimum: 1, default: 10 },
            },
          ],
          responses: {
            200: {
              description: "Lista paginada de registros",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      data: {
                        type: "array",
                        items: { $ref: `#/components/schemas/${className}` },
                      },
                      meta: {
                        type: "object",
                        properties: {
                          totalItems: { type: "integer" },
                          totalPages: { type: "integer" },
                          currentPage: { type: "integer" },
                          itemsPerPage: { type: "integer" },
                        },
                      },
                      links: {
                        type: "object",
                        additionalProperties: { type: "string" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        post: {
          tags: [className],
          summary: `Cria um registro de ${className}`,
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: `#/components/schemas/${className}Input` },
              },
            },
          },
          responses: {
            201: {
              description: "Registro criado",
              content: {
                "application/json": {
                  schema: { $ref: `#/components/schemas/${className}` },
                },
              },
            },
          },
        },
      };

      paths[`/api/${table}/bulk`] = {
        post: {
          tags: [className],
          summary: `Cria registros em lote de ${className}`,
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: `#/components/schemas/${className}Input` },
                },
              },
            },
          },
          responses: {
            201: {
              description: "Registros criados",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      affectedRows: { type: "integer" },
                    },
                  },
                },
              },
            },
          },
        },
      };

      paths[`/api/${table}/{id}`] = {
        get: {
          tags: [className],
          summary: `Busca ${className} por ID`,
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: "path",
              name: "id",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            200: {
              description: "Registro encontrado",
              content: {
                "application/json": {
                  schema: { $ref: `#/components/schemas/${className}` },
                },
              },
            },
          },
        },
        put: {
          tags: [className],
          summary: `Atualiza ${className} por ID`,
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: "path",
              name: "id",
              required: true,
              schema: { type: "string" },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: `#/components/schemas/${className}Input` },
              },
            },
          },
          responses: {
            200: {
              description: "Registro atualizado",
              content: {
                "application/json": {
                  schema: { $ref: `#/components/schemas/${className}` },
                },
              },
            },
          },
        },
        delete: {
          tags: [className],
          summary: `Remove ${className} por ID`,
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: "path",
              name: "id",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            204: { description: "Removido com sucesso" },
          },
        },
      };

      nonPkColumns.forEach((col) => {
        paths[`/api/${table}/search/${col.name}/{value}`] = {
          get: {
            tags: [className],
            summary: `Busca ${className} por ${col.name}`,
            security: [{ bearerAuth: [] }],
            parameters: [
              {
                in: "path",
                name: "value",
                required: true,
                schema: toOpenApiSchema(col),
              },
            ],
            responses: {
              200: {
                description: "Registro encontrado",
                content: {
                  "application/json": {
                    schema: { $ref: `#/components/schemas/${className}` },
                  },
                },
              },
            },
          },
        };
      });
    });

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
  const swaggerUi = require('swagger-ui-express');
  const swaggerSpec = require('./docs/swagger/swaggerSpec');
  const errorMiddleware = require('./middlewares/errorMiddleware');
  ${tables.map((t) => `const ${camelCase(t)}Route = require('./routes/${camelCase(t)}Route');`).join("\n")}

  const app = express();
  app.use(express.json());

  app.get('/api-docs.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
  });

  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  app.use('/docs', express.static(path.join(__dirname, 'docs/html')));

  ${tables.map((t) => `app.use('/api/${t}', ${camelCase(t)}Route);`).join("\n")}

  app.use(errorMiddleware);
  module.exports = app;
  `,
  indexDocumentation: (tables) => {
    const tableLinks = tables
      .map((t) => {
        const className = t.charAt(0).toUpperCase() + t.slice(1); // Simples PascalCase
        const fileName = `${camelCase(t)}Html.html`;
        return `
                <div class="col-md-4 mb-4">
                    <div class="card h-100 shadow-sm table-card">
                        <div class="card-body text-center">
                            <div class="icon-box mb-3">
                                <span class="fs-1">📂</span>
                            </div>
                            <h5 class="card-title">${className}</h5>
                            <p class="card-text text-muted small">Gerenciamento de endpoints para a tabela <code>${t}</code>.</p>
                            <a href="./${fileName}" class="btn btn-outline-primary stretched-link">Ver Documentação</a>
                        </div>
                    </div>
                </div>`;
      })
      .join("");

    return `
<!DOCTYPE html>
<html lang="pt-br">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Índice da API - Documentação</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <style>
        body { background-color: #f4f7f6; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
        .hero { background: linear-gradient(135deg, #0d6efd 0%, #003d99 100%); color: white; padding: 60px 0; margin-bottom: 40px; }
        .table-card { transition: transform 0.2s, shadow 0.2s; border: none; }
        .table-card:hover { transform: translateY(-5px); box-shadow: 0 10px 20px rgba(0,0,0,0.1) !important; }
        .icon-box { background-color: #e7f1ff; width: 80px; height: 80px; line-height: 80px; border-radius: 50%; margin: 0 auto; }
        footer { margin-top: 50px; color: #6c757d; }
    </style>
</head>
<body>

    <header class="hero text-center">
        <div class="container">
            <h1 class="display-4 fw-bold">Portal da API</h1>
            <p class="lead">Índice centralizado de documentação técnica dos recursos</p>
        </div>
    </header>

    <main class="container">
        <div class="row mb-4">
            <div class="col-12">
                <h3 class="border-bottom pb-2 mb-4">Entidades Disponíveis</h3>
            </div>
        </div>
        
        <div class="row">
            ${tableLinks}
        </div>
    </main>

    <footer class="container text-center py-4">
        <hr>
        <p>Gerado em ${new Date().getFullYear()}</p>
    </footer>

    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
</body>
</html>
`;
  },
  envfile: () => `PORT=3000
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=
DB_NAME=my_database
DB_PORT=3306
JWT_SECRET=your_jwt_secret
`,
};
