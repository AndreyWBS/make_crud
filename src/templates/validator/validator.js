const { pascalCase } = require("../../utils/stringUtils");

module.exports = {
  validator: (tableName, schema) => {
    const className = pascalCase(tableName);

    const validationLogic = schema.columns
      .filter((col) => col.extra !== "auto_increment")
      .map((col) => {
        const checks = [];
        const fieldAccess = `data[${JSON.stringify(col.name)}]`;

        if (!col.nullable && col.default === null) {
          checks.push(
            `if (${fieldAccess} === undefined || ${fieldAccess} === null) errors.push('${col.name} is required');`,
          );
        }

        if (
          col.type.includes("int") ||
          col.type.includes("decimal") ||
          col.type.includes("float")
        ) {
          checks.push(
            `if (${fieldAccess} !== undefined && ${fieldAccess} !== null && typeof ${fieldAccess} !== 'number') errors.push('${col.name} must be a number');`,
          );
        } else if (col.type.includes("varchar") || col.type.includes("text")) {
          checks.push(
            `if (${fieldAccess} !== undefined && ${fieldAccess} !== null && typeof ${fieldAccess} !== 'string') errors.push('${col.name} must be a string');`,
          );
        }

        return checks.join("\n        ");
      })
      .join("\n        ");

    return `
class ${className}Validator {
    validate(req, res, next) {
        const data = req.body;
        const errors = [];

        ${validationLogic}

        if (errors.length > 0) {
            return res.status(400).json({ errors });
        }

        next();
    }

    validateBulk(req, res, next) {
        const dataArray = req.body;
        if (!Array.isArray(dataArray)) {
            return res.status(400).json({ error: 'Body must be an array for bulk insert' });
        }

        const allErrors = [];
        dataArray.forEach((data, index) => {
            const errors = [];
            ${validationLogic}
            if (errors.length > 0) {
                allErrors.push({ index, errors });
            }
        });

        if (allErrors.length > 0) {
            return res.status(400).json({ errors: allErrors });
        }

        next();
    }
}

module.exports = new ${className}Validator();
`;
  },
};
