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
};
