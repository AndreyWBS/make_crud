const { pascalCase } = require("../../../utils/stringUtils");
const { toOpenApiSchema } = require("./schemaMapper");

function buildCollectionPaths(table, className) {
  return {
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
}

function buildBulkPath(table, className) {
  return {
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
}

function buildResourcePaths(table, className) {
  const idParam = {
    in: "path",
    name: "id",
    required: true,
    schema: { type: "string" },
  };

  return {
    get: {
      tags: [className],
      summary: `Busca ${className} por ID`,
      security: [{ bearerAuth: [] }],
      parameters: [idParam],
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
      parameters: [idParam],
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
      parameters: [idParam],
      responses: {
        204: { description: "Removido com sucesso" },
      },
    },
  };
}

function buildSearchByFieldPaths(table, className, nonPkColumns) {
  return nonPkColumns.reduce((acc, col) => {
    acc[`/api/${table}/search/${col.name}/{value}`] = {
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
    return acc;
  }, {});
}

function buildPaths(tables, schema) {
  const paths = {};

  tables.forEach((table) => {
    const className = pascalCase(table);
    const columns = (schema[table] && schema[table].columns) || [];
    const pk = columns.find((c) => c.key === "PRI")?.name || "id";
    const nonPkColumns = columns.filter((c) => c.name !== pk);

    paths[`/api/${table}`] = buildCollectionPaths(table, className);
    paths[`/api/${table}/bulk`] = buildBulkPath(table, className);
    paths[`/api/${table}/{id}`] = buildResourcePaths(table, className);

    Object.assign(
      paths,
      buildSearchByFieldPaths(table, className, nonPkColumns),
    );
  });

  return paths;
}

module.exports = { buildPaths };
