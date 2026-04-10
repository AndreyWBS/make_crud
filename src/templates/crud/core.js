const { pascalCase, camelCase } = require("../../utils/stringUtils");

module.exports = {
  model: (tableName, schema) => {
    const className = pascalCase(tableName);
    const fields = schema.columns
      .map(
        (col) =>
          `        this[${JSON.stringify(col.name)}] = data[${JSON.stringify(col.name)}];`,
      )
      .join("\n");

    return `
class ${className} {
    constructor(data) {
${fields}
    }
}

module.exports = ${className};
`;
  },

  repository: (tableName, schema) => {
    const className = pascalCase(tableName);
    const pk = schema.columns.find((c) => c.key === "PRI")?.name || "id";

    const findByMethods = schema.columns
      .filter((col) => col.name !== pk)
      .map((col) => {
        const methodName = `findBy${pascalCase(col.name)}`;
        return `    async ${methodName}(value) {
        const [rows] = await pool.query('SELECT * FROM ${tableName} WHERE ${col.name} = ?', [value]);
        return rows[0];
    }`;
      })
      .join("\n\n");

    return `
const pool = require('../config/database');

class ${className}Repository {
    async findAll(filters = {}, page = 1, limit = 10) {
        let query = 'SELECT * FROM ${tableName}';
        let countQuery = 'SELECT COUNT(*) as total FROM ${tableName}';
        const params = [];
        const keys = Object.keys(filters);

        if (keys.length > 0) {
            const whereClauses = keys.map(key => \`\${key} = ?\`);
            const wherePart = ' WHERE ' + whereClauses.join(' AND ');
            query += wherePart;
            countQuery += wherePart;
            params.push(...Object.values(filters));
        }

        const offset = (page - 1) * limit;
        query += ' LIMIT ? OFFSET ?';
        const queryParams = [...params, parseInt(limit), parseInt(offset)];

        const [rows] = await pool.query(query, queryParams);
        const [[{ total }]] = await pool.query(countQuery, params);

        return { data: rows, total };
    }

    async findById(id) {
        const [rows] = await pool.query('SELECT * FROM ${tableName} WHERE ${pk} = ?', [id]);
        return rows[0];
    }

${findByMethods}

    async create(data) {
        const [result] = await pool.query('INSERT INTO ${tableName} SET ?', [data]);
        return { [${JSON.stringify(pk)}]: result.insertId, ...data };
    }

    async createBulk(dataArray) {
        if (!Array.isArray(dataArray) || dataArray.length === 0) return [];
        const keys = Object.keys(dataArray[0]);
        const values = dataArray.map(obj => keys.map(key => obj[key]));
        const query = 'INSERT INTO ${tableName} (' + keys.join(', ') + ') VALUES ?';
        const [result] = await pool.query(query, [values]);
        return { affectedRows: result.affectedRows };
    }

    async update(id, data) {
        await pool.query('UPDATE ${tableName} SET ? WHERE ${pk} = ?', [data, id]);
        return { [${JSON.stringify(pk)}]: id, ...data };
    }

    async delete(id) {
        await pool.query('DELETE FROM ${tableName} WHERE ${pk} = ?', [id]);
        return { success: true };
    }
}

module.exports = new ${className}Repository();
`;
  },

  service: (tableName, schema) => {
    const className = pascalCase(tableName);
    const repoName = `${camelCase(tableName)}Repository`;
    const pk = schema.columns.find((c) => c.key === "PRI")?.name || "id";

    const findByMethods = schema.columns
      .filter((col) => col.name !== pk)
      .map((col) => {
        const methodName = `findBy${pascalCase(col.name)}`;
        return `    async ${methodName}(value) {
        const item = await ${repoName}.${methodName}(value);
        if (!item) throw new Error('${className} with ${col.name} ' + value + ' not found');
        return item;
    }`;
      })
      .join("\n\n");

    return `
const ${repoName} = require('../repositories/${repoName}');

class ${className}Service {
    async getAll(filters, page, limit) {
        const { data, total } = await ${repoName}.findAll(filters, page, limit);
        const totalPages = Math.ceil(total / limit);

        return {
            data,
            meta: {
                totalItems: total,
                totalPages,
                currentPage: parseInt(page),
                itemsPerPage: parseInt(limit)
            }
        };
    }

    async getById(id) {
        const item = await ${repoName}.findById(id);
        if (!item) throw new Error('${className} not found');
        return item;
    }

${findByMethods}

    async create(data) {
        return await ${repoName}.create(data);
    }

    async createBulk(dataArray) {
        return await ${repoName}.createBulk(dataArray);
    }

    async update(id, data) {
        await this.getById(id);
        return await ${repoName}.update(id, data);
    }

    async delete(id) {
        await this.getById(id);
        return await ${repoName}.delete(id);
    }
}

module.exports = new ${className}Service();
`;
  },

  controller: (tableName, schema) => {
    const className = pascalCase(tableName);
    const serviceName = `${camelCase(tableName)}Service`;
    const pk = schema.columns.find((c) => c.key === "PRI")?.name || "id";

    const findByEndpoints = schema.columns
      .filter((col) => col.name !== pk)
      .map((col) => {
        const methodName = `findBy${pascalCase(col.name)}`;
        return `    async ${methodName}(req, res, next) {
        try {
            const item = await ${serviceName}.${methodName}(req.params.value);
            res.json(item);
        } catch (error) {
            next(error);
        }
    }`;
      })
      .join("\n\n");

    return `
const ${serviceName} = require('../services/${serviceName}');

class ${className}Controller {
    async getAll(req, res, next) {
        try {
            const { page = 1, limit = 10, ...filters } = req.query;
            const result = await ${serviceName}.getAll(filters, page, limit);

            const baseUrl = \`\${req.protocol}://\${req.get('host')}\${req.baseUrl}\`;
            const queryParams = new URLSearchParams(filters);

            result.links = {
                self: \`\${baseUrl}?page=\${page}&limit=\${limit}&\${queryParams}\`,
                first: \`\${baseUrl}?page=1&limit=\${limit}&\${queryParams}\`,
                last: \`\${baseUrl}?page=\${result.meta.totalPages}&limit=\${limit}&\${queryParams}\`
            };

            if (page > 1) {
                result.links.prev = \`\${baseUrl}?page=\${parseInt(page) - 1}&limit=\${limit}&\${queryParams}\`;
            }
            if (page < result.meta.totalPages) {
                result.links.next = \`\${baseUrl}?page=\${parseInt(page) + 1}&limit=\${limit}&\${queryParams}\`;
            }

            res.json(result);
        } catch (error) {
            next(error);
        }
    }

    async getById(req, res, next) {
        try {
            const item = await ${serviceName}.getById(req.params.id);
            res.json(item);
        } catch (error) {
            next(error);
        }
    }

${findByEndpoints}

    async create(req, res, next) {
        try {
            const item = await ${serviceName}.create(req.body);
            res.status(201).json(item);
        } catch (error) {
            next(error);
        }
    }

    async createBulk(req, res, next) {
        try {
            const result = await ${serviceName}.createBulk(req.body);
            res.status(201).json(result);
        } catch (error) {
            next(error);
        }
    }

    async update(req, res, next) {
        try {
            const item = await ${serviceName}.update(req.params.id, req.body);
            res.json(item);
        } catch (error) {
            next(error);
        }
    }

    async delete(req, res, next) {
        try {
            await ${serviceName}.delete(req.params.id);
            res.status(204).end();
        } catch (error) {
            next(error);
        }
    }
}

module.exports = new ${className}Controller();
`;
  },

  routes: (tableName, schema) => {
    const controllerName = `${camelCase(tableName)}Controller`;
    const validatorName = `${camelCase(tableName)}Validator`;
    const pk = schema.columns.find((c) => c.key === "PRI")?.name || "id";

    const findByRoutes = schema.columns
      .filter((col) => col.name !== pk)
      .map((col) => {
        const methodName = `findBy${pascalCase(col.name)}`;
        return `router.get('/search/${col.name}/:value', authMiddleware, ${controllerName}.${methodName});`;
      })
      .join("\n");

    return `
const express = require('express');
const router = express.Router();
const ${controllerName} = require('../controllers/${controllerName}');
const authMiddleware = require('../middlewares/authMiddleware');
const ${validatorName} = require('../middlewares/validators/${validatorName}');

router.get('/', authMiddleware, ${controllerName}.getAll);
router.get('/:id', authMiddleware, ${controllerName}.getById);

// Search by column routes
${findByRoutes}

router.post('/', authMiddleware, ${validatorName}.validate, ${controllerName}.create);
router.post('/bulk', authMiddleware, ${validatorName}.validateBulk, ${controllerName}.createBulk);
router.put('/:id', authMiddleware, ${validatorName}.validate, ${controllerName}.update);
router.delete('/:id', authMiddleware, ${controllerName}.delete);

module.exports = router;
`;
  },
};
