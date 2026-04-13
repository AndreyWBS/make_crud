const { pascalCase } = require('../../utils/stringUtils');

module.exports = {
  validator: (tableName, schema) => {
    const className = pascalCase(tableName);
    const pk = schema.columns.find((c) => c.key === 'PRI')?.name || 'id';

    const validationLogic = schema.columns
      .filter((col) => col.extra !== 'auto_increment')
      .map((col) => {
        const checks = [];
        const fieldAccess = `data[${JSON.stringify(col.name)}]`;

        if (!col.nullable && col.default === null) {
          checks.push(
            `if (${fieldAccess} === undefined || ${fieldAccess} === null) errors.push('${col.name} is required');`,
          );
        }

        if (
          col.type.includes('int') ||
          col.type.includes('decimal') ||
          col.type.includes('float')
        ) {
          checks.push(
            `if (${fieldAccess} !== undefined && ${fieldAccess} !== null && typeof ${fieldAccess} !== 'number') errors.push('${col.name} must be a number');`,
          );
        } else if (col.type.includes('varchar') || col.type.includes('text')) {
          checks.push(
            `if (${fieldAccess} !== undefined && ${fieldAccess} !== null && typeof ${fieldAccess} !== 'string') errors.push('${col.name} must be a string');`,
          );
        }

        return checks.join('\n        ');
      })
      .join('\n        ');

    return `
  /**
   * @fileoverview Validador de payload para ${tableName}.
   * @description Realiza validação estrutural de tipos e campos obrigatórios.
   */

  /**
   * @class ${className}Validator
   * @classdesc Middleware de validação para operações single e bulk.
   */
class ${className}Validator {
    /**
     * Valida payload unitário.
     * @param {Record<string, any>} data Corpo da requisição.
     * @returns {string[]} Lista de erros encontrados.
     */
    validatePayload(data) {
      const errors = [];

      ${validationLogic}

      return errors;
    }

    /**
     * Middleware de validação para payload unitário.
     * @param {import('express').Request} req
     * @param {import('express').Response} res
     * @param {import('express').NextFunction} next
     * @returns {void}
     */
    validate(req, res, next) {
        const data = req.body;
      const errors = this.validatePayload(data);

        if (errors.length > 0) {
            return res.status(400).json({ errors });
        }

        next();
    }

    /**
     * Middleware de validação para payload em lote.
     * @param {import('express').Request} req
     * @param {import('express').Response} res
     * @param {import('express').NextFunction} next
     * @returns {void}
     */
    validateBulk(req, res, next) {
        const dataArray = req.body;
        if (!Array.isArray(dataArray)) {
            return res.status(400).json({ error: 'Body must be an array for bulk insert' });
        }

        const allErrors = [];
        dataArray.forEach((data, index) => {
          const errors = this.validatePayload(data);
            if (errors.length > 0) {
                allErrors.push({ index, errors });
            }
        });

        if (allErrors.length > 0) {
            return res.status(400).json({ errors: allErrors });
        }

        next();
    }

    /**
     * Middleware de validação para atualização em lote.
     * Cada item deve conter a PK e ao menos um campo de atualização.
     * @param {import('express').Request} req
     * @param {import('express').Response} res
     * @param {import('express').NextFunction} next
     * @returns {void}
     */
    validateBulkUpdate(req, res, next) {
        const dataArray = req.body;
        if (!Array.isArray(dataArray)) {
            return res.status(400).json({ error: 'Body must be an array for bulk update' });
        }

        const allErrors = [];
        dataArray.forEach((data, index) => {
            if (!data || typeof data !== 'object' || Array.isArray(data)) {
                allErrors.push({ index, errors: ['Item must be an object'] });
                return;
            }
            if (data['${pk}'] === undefined || data['${pk}'] === null) {
                allErrors.push({ index, errors: ['${pk} is required for bulk update'] });
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
