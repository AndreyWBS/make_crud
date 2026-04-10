const { pascalCase } = require("../../../utils/stringUtils");

function toOpenApiSchema(column) {
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
}

function buildEntitySchema(table, schema) {
  const columns = (schema[table] && schema[table].columns) || [];
  const properties = columns.reduce((acc, col) => {
    acc[col.name] = toOpenApiSchema(col);
    return acc;
  }, {});

  return { type: "object", properties };
}

function buildRequestBodySchema(table, schema) {
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
}

function buildComponentsSchemas(tables, schema) {
  return tables.reduce((acc, table) => {
    const className = pascalCase(table);
    acc[className] = buildEntitySchema(table, schema);
    acc[`${className}Input`] = buildRequestBodySchema(table, schema);
    return acc;
  }, {});
}

module.exports = {
  toOpenApiSchema,
  buildEntitySchema,
  buildRequestBodySchema,
  buildComponentsSchemas,
};
