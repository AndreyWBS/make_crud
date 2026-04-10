const { pascalCase, camelCase } = require('../../utils/stringUtils');

module.exports = {
  model: (tableName, schema) => {
    const className = pascalCase(tableName);
    const fields = schema.columns
      .map(
        (col) => `        this[${JSON.stringify(col.name)}] = data[${JSON.stringify(col.name)}];`,
      )
      .join('\n');

    return `
/**
 * @fileoverview Model de domínio para a tabela ${tableName}.
 * @description Estrutura de dados simples para transporte entre camadas.
 */

/**
 * @class ${className}
 * @classdesc Representa um registro da tabela ${tableName}.
 */
class ${className} {
    /**
     * @param {Record<string, any>} data Dados do registro.
     */
    constructor(data) {
${fields}
    }
}

module.exports = ${className};
`;
  },

  repository: (tableName, schema) => {
    const className = pascalCase(tableName);
    const pk = schema.columns.find((c) => c.key === 'PRI')?.name || 'id';
    const allColumns = schema.columns.map((col) => col.name);
    const allColumnsLiteral = JSON.stringify(allColumns);
    const columnListSql = allColumns.map((col) => `\`${col}\``).join(', ');
    const filterableColumns = JSON.stringify(allColumns);
    const insertableColumns = JSON.stringify(
      schema.columns.filter((col) => col.extra !== 'auto_increment').map((col) => col.name),
    );
    const updatableColumns = JSON.stringify(
      schema.columns
        .filter((col) => col.name !== pk && col.extra !== 'auto_increment')
        .map((col) => col.name),
    );
    const columnUnionType = schema.columns.length
      ? schema.columns.map((col) => `'${col.name}'`).join(' | ')
      : 'string';

    return `
/**
 * @fileoverview Repositório de acesso a dados para ${tableName}.
 * @description Executa queries parametrizadas com timeout e logs estruturados.
 */

const pool = require('../config/database');
const logger = require('../utils/logger');

const QUERY_TIMEOUT_MS = Number(process.env.DB_QUERY_TIMEOUT_MS) || 10000;
const ALL_COLUMNS = ${allColumnsLiteral};
const COLUMN_SQL_MAP = ALL_COLUMNS.reduce((acc, column) => {
    acc[column] = '\`' + column + '\`';
    return acc;
}, {});
const SELECT_COLUMNS_SQL = '${columnListSql}';
const FILTERABLE_COLUMNS = new Set(${filterableColumns});
const INSERTABLE_COLUMNS = new Set(${insertableColumns});
const UPDATABLE_COLUMNS = new Set(${updatableColumns});

/**
 * Executa query SQL com timeout e telemetria.
 * @param {string} sql SQL parametrizado.
 * @param {any[]} [params=[]] Lista de parâmetros.
 * @param {string} [context='query'] Nome lógico da operação.
 * @returns {Promise<any[]>}
 * @throws {Error} Propaga erro de execução do driver.
 */
async function runQuery(sql, params = [], context = 'query') {
    const start = Date.now();
    try {
        return await pool.query({ sql, timeout: QUERY_TIMEOUT_MS }, params);
    } catch (error) {
        logger.error('[db] ' + context + ' failed in ' + (Date.now() - start) + 'ms: ' + error.message);
        throw error;
    } finally {
        logger.info('[db] ' + context + ' took ' + (Date.now() - start) + 'ms');
    }
}

/**
 * Filtra objeto de entrada por um conjunto permitido de colunas.
 * @param {Record<string, any>} data Payload de entrada.
 * @param {Set<string>} allowedSet Conjunto de chaves permitidas.
 * @returns {Record<string, any>}
 */
function filterByAllowedColumns(data, allowedSet) {
    const safeData = {};
    for (const [key, value] of Object.entries(data || {})) {
        if (allowedSet.has(key)) {
            safeData[key] = value;
        }
    }
    return safeData;
}

/**
 * Garante formato uniforme em inserções em lote.
 * @param {Array<Record<string, any>>} dataArray Lista de itens.
 * @returns {string[]} Chaves normalizadas da primeira linha.
 * @throws {Error} Se algum item não for objeto ou se os formatos divergirem.
 */
function normalizeBulkShape(dataArray) {
    const firstKeys = Object.keys(dataArray[0]).sort();
    for (let i = 0; i < dataArray.length; i++) {
        const item = dataArray[i];
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
            throw new Error('Each bulk item must be an object');
        }

        const currentKeys = Object.keys(item).sort();
        if (currentKeys.length !== firstKeys.length || currentKeys.some((key, idx) => key !== firstKeys[idx])) {
            throw new Error('All bulk items must have the same shape');
        }
    }
    return firstKeys;
}

/**
 * @class ${className}Repository
 * @classdesc Camada de persistência para ${tableName}.
 */
class ${className}Repository {
    /**
     * Lista registros com filtro opcional e paginação.
     * @param {Record<string, any>} [filters={}] Filtros por coluna permitida.
     * @param {number} [page=1] Página atual.
     * @param {number} [limit=10] Tamanho da página.
     * @param {boolean} [includeTotal=true] Se deve calcular total.
     * @returns {Promise<{data: any[], total: number|null}>}
     */
    async findAll(filters = {}, page = 1, limit = 10, includeTotal = true) {
        let query = 'SELECT ' + SELECT_COLUMNS_SQL + ' FROM ${tableName}';
        let countQuery = 'SELECT COUNT(*) as total FROM ${tableName}';
        const params = [];
        const keys = Object.keys(filters).filter((key) => FILTERABLE_COLUMNS.has(key));

        if (keys.length > 0) {
            const whereClauses = keys.map((key) => COLUMN_SQL_MAP[key] + ' = ?');
            const wherePart = ' WHERE ' + whereClauses.join(' AND ');
            query += wherePart;
            countQuery += wherePart;
            params.push(...keys.map((key) => filters[key]));
        }

        const offset = (page - 1) * limit;
        query += ' LIMIT ? OFFSET ?';
        const queryParams = [...params, parseInt(limit), parseInt(offset)];

        const [rows] = await runQuery(query, queryParams, '${tableName}.findAll');

        let total = null;
        if (includeTotal) {
            const [[{ total: totalCount }]] = await runQuery(countQuery, params, '${tableName}.findAll.count');
            total = totalCount;
        }

        return { data: rows, total };
    }

    /**
     * Busca um registro por chave primária.
     * @param {string|number} id Valor da PK.
     * @returns {Promise<any|undefined>}
     */
    async findById(id) {
        const [rows] = await runQuery('SELECT ' + SELECT_COLUMNS_SQL + ' FROM ${tableName} WHERE ${pk} = ?', [id], '${tableName}.findById');
        return rows[0];
    }

    /**
     * Busca paginada por coluna dinâmica permitida.
        * @param {${columnUnionType}} columnName Nome da coluna.
     * @param {string|number} value Valor pesquisado.
     * @param {boolean} [isStringColumn=false] Define uso de LIKE.
     * @param {number} [page=1] Página atual.
     * @param {number} [limit=10] Tamanho da página.
     * @param {boolean} [includeTotal=true] Se deve calcular total.
     * @returns {Promise<{data: any[], total: number|null}>}
     */
    async findByColumnPaginated(columnName, value, isStringColumn = false, page = 1, limit = 10, includeTotal = true) {
        const safeColumnName = COLUMN_SQL_MAP[columnName];
        const operator = isStringColumn ? 'LIKE' : '=';
        const searchValue = isStringColumn ? \`%\${value}%\` : value;
        const offset = (page - 1) * limit;

        const query = 'SELECT ' + SELECT_COLUMNS_SQL + ' FROM ${tableName} WHERE ' + safeColumnName + ' ' + operator + ' ? LIMIT ? OFFSET ?';
        const queryParams = [searchValue, parseInt(limit), parseInt(offset)];
        const [rows] = await runQuery(query, queryParams, '${tableName}.findByColumnPaginated');
        
        let total = null;
        if (includeTotal) {
            const countQuery = 'SELECT COUNT(*) as total FROM ${tableName} WHERE ' + safeColumnName + ' ' + operator + ' ?';
            const [[{ total: totalCount }]] = await runQuery(countQuery, [searchValue], '${tableName}.findByColumnPaginated.count');
            total = totalCount;
        }

        return { data: rows, total };
    }

    /**
     * Cria um novo registro.
     * @param {Record<string, any>} data Payload de criação.
     * @returns {Promise<Record<string, any>>}
     */
    async create(data) {
        const safeData = filterByAllowedColumns(data, INSERTABLE_COLUMNS);
        const [result] = await runQuery('INSERT INTO ${tableName} SET ?', [safeData], '${tableName}.create');
        return { [${JSON.stringify(pk)}]: result.insertId, ...safeData };
    }

    /**
     * Cria múltiplos registros em transação.
     * @param {Array<Record<string, any>>} dataArray Lista de registros.
     * @returns {Promise<{affectedRows:number}>}
     */
    async createBulk(dataArray) {
        if (!Array.isArray(dataArray) || dataArray.length === 0) return { affectedRows: 0 };

        const keys = normalizeBulkShape(dataArray).filter((key) => INSERTABLE_COLUMNS.has(key));
        if (keys.length === 0) {
            return { affectedRows: 0 };
        }

        const values = dataArray.map(obj => keys.map(key => obj[key]));
        const query = 'INSERT INTO ${tableName} (' + keys.join(', ') + ') VALUES ?';
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();
            const [result] = await connection.query({ sql: query, timeout: QUERY_TIMEOUT_MS }, [values]);
            await connection.commit();
            return { affectedRows: result.affectedRows };
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    /**
     * Atualiza um registro por id.
     * @param {string|number} id Chave primária.
     * @param {Record<string, any>} data Campos de atualização.
     * @returns {Promise<Record<string, any>>}
     */
    async update(id, data) {
        const safeData = filterByAllowedColumns(data, UPDATABLE_COLUMNS);
        await runQuery('UPDATE ${tableName} SET ? WHERE ${pk} = ?', [safeData, id], '${tableName}.update');
        return { [${JSON.stringify(pk)}]: id, ...safeData };
    }

    /**
     * Remove um registro por id.
     * @param {string|number} id Chave primária.
     * @returns {Promise<{success:boolean}>}
     */
    async delete(id) {
        await runQuery('DELETE FROM ${tableName} WHERE ${pk} = ?', [id], '${tableName}.delete');
        return { success: true };
    }
}

module.exports = new ${className}Repository();
`;
  },

  service: (tableName, schema) => {
    const className = pascalCase(tableName);
    const repoName = `${camelCase(tableName)}Repository`;
    const pk = schema.columns.find((c) => c.key === 'PRI')?.name || 'id';
    const columnsLiteral = JSON.stringify(schema.columns.map((col) => col.name));
    const stringColumnsLiteral = JSON.stringify(
      schema.columns
        .filter((col) =>
          /^(varchar|char|text|longtext|mediumtext|tinytext|string)/.test(
            String(col.type).toLowerCase(),
          ),
        )
        .map((col) => col.name),
    );
    const columnUnionType = schema.columns.length
      ? schema.columns.map((col) => `'${col.name}'`).join(' | ')
      : 'string';

    return `
/**
 * @fileoverview Camada de serviço para ${tableName}.
 * @description Aplica regras de negócio, validações e paginação.
 */

const ${repoName} = require('../repositories/${repoName}');
const AppError = require('../utils/AppError');
const { normalizePagination, parseIncludeTotal, MAX_LIMIT } = require('../utils/pagination');

const DEFAULT_LIMIT = 10;
const ALLOWED_COLUMNS = new Set(${columnsLiteral});
const STRING_COLUMNS = new Set(${stringColumnsLiteral});

/**
 * Valida se os filtros usam apenas colunas permitidas.
 * @param {Record<string, any>} filters Filtros recebidos.
 * @throws {AppError} 400 quando houver coluna inválida.
 */
function assertAllowedFilterColumns(filters) {
    const invalidColumns = Object.keys(filters).filter((column) => !ALLOWED_COLUMNS.has(column));
    if (invalidColumns.length > 0) {
        throw new AppError(400, 'Invalid filter columns: ' + invalidColumns.join(', '));
    }
}

/**
 * Valida consistência de shape em payload bulk.
 * @param {Array<Record<string, any>>} dataArray Lista de itens.
 * @throws {AppError} 400 quando houver formato inválido.
 */
function assertUniformBulkShape(dataArray) {
    const firstKeys = Object.keys(dataArray[0]).sort();
    for (let i = 0; i < dataArray.length; i++) {
        const item = dataArray[i];
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
            throw new AppError(400, 'Each bulk item must be an object');
        }

        const currentKeys = Object.keys(item).sort();
        if (currentKeys.length !== firstKeys.length || currentKeys.some((key, idx) => key !== firstKeys[idx])) {
            throw new AppError(400, 'All bulk items must have the same shape');
        }
    }
}

/**
 * @class ${className}Service
 * @classdesc Serviço de aplicação para operações de ${tableName}.
 */
class ${className}Service {
    /**
     * Consulta paginada com filtros permitidos.
     * @param {Record<string, any>} filters Filtros de consulta.
     * @param {number|string} [page=1] Página.
     * @param {number|string} [limit=10] Limite por página.
     * @param {boolean|string} [includeTotal=true] Inclui total.
     * @returns {Promise<{data:any[], meta:Record<string,any>}>}
     */
    async getAll(filters, page = 1, limit = DEFAULT_LIMIT, includeTotal = true) {
        const normalized = normalizePagination(page, limit);
        const shouldIncludeTotal = parseIncludeTotal(includeTotal);
        assertAllowedFilterColumns(filters || {});

        const { data, total } = await ${repoName}.findAll(filters, normalized.page, normalized.limit, shouldIncludeTotal);
        const totalPages = shouldIncludeTotal ? Math.ceil(total / normalized.limit) : null;

        return {
            data,
            meta: {
                totalItems: total,
                totalPages,
                includeTotal: shouldIncludeTotal,
                currentPage: normalized.page,
                itemsPerPage: normalized.limit
            }
        };
    }

    /**
     * Obtém registro por id.
     * @param {string|number} id Identificador.
     * @returns {Promise<any>}
     * @throws {AppError} 404 quando não encontrado.
     */
    async getById(id) {
        const item = await ${repoName}.findById(id);
        if (!item) throw new AppError(404, '${className} not found');
        return item;
    }

    /**
     * Cria registro.
     * @param {Record<string, any>} data Payload.
     * @returns {Promise<any>}
     */
    async create(data) {
        return await ${repoName}.create(data);
    }

    /**
     * Cria registros em lote.
     * @param {Array<Record<string, any>>} dataArray Itens de criação.
     * @returns {Promise<{affectedRows:number}>}
     */
    async createBulk(dataArray) {
        if (!Array.isArray(dataArray) || dataArray.length === 0) {
            throw new AppError(400, 'Body must be a non-empty array for bulk insert');
        }
        assertUniformBulkShape(dataArray);
        return await ${repoName}.createBulk(dataArray);
    }

    /**
     * Atualiza registro por id.
     * @param {string|number} id Identificador.
     * @param {Record<string, any>} data Payload.
     * @returns {Promise<any>}
     */
    async update(id, data) {
        await this.getById(id);
        return await ${repoName}.update(id, data);
    }

    /**
     * Remove registro por id.
     * @param {string|number} id Identificador.
     * @returns {Promise<{success:boolean}>}
     */
    async delete(id) {
        await this.getById(id);
        return await ${repoName}.delete(id);
    }

    /**
     * Busca por coluna dinâmica com paginação.
        * @param {${columnUnionType}} columnName Nome da coluna.
     * @param {string|number} value Valor de busca.
     * @param {number|string} [page=1] Página.
     * @param {number|string} [limit=10] Limite.
     * @param {boolean|string} [includeTotal=true] Inclui total.
     * @returns {Promise<{data:any[], meta:Record<string,any>}>}
     */
    async findByColumnPaginated(columnName, value, page = 1, limit = DEFAULT_LIMIT, includeTotal = true) {
        if (!ALLOWED_COLUMNS.has(columnName)) {
            throw new AppError(400, 'Invalid column for search: ' + columnName);
        }

        const normalized = normalizePagination(page, limit);
        const shouldIncludeTotal = parseIncludeTotal(includeTotal);
        const isStringColumn = STRING_COLUMNS.has(columnName);

        const { data, total } = await ${repoName}.findByColumnPaginated(columnName, value, isStringColumn, normalized.page, normalized.limit, shouldIncludeTotal);
        const totalPages = shouldIncludeTotal ? Math.ceil(total / normalized.limit) : null;

        return {
            data,
            meta: {
                totalItems: total,
                totalPages,
                includeTotal: shouldIncludeTotal,
                currentPage: normalized.page,
                itemsPerPage: normalized.limit
            }
        };
    }
}

module.exports = new ${className}Service();
`;
  },

  controller: (tableName, schema) => {
    const className = pascalCase(tableName);
    const serviceName = `${camelCase(tableName)}Service`;
    const columnUnionType = schema.columns.length
      ? schema.columns.map((col) => `'${col.name}'`).join(' | ')
      : 'string';
    const searchableColumnsDoc = schema.columns
      .map((col) => `     * - \`${col.name}\`: ${col.type}`)
      .join('\n');

    return `
/**
 * @fileoverview Controller HTTP de ${tableName}.
 * @description Traduz requisição/response HTTP para a camada de serviço.
 */

const ${serviceName} = require('../services/${serviceName}');

/**
 * @class ${className}Controller
 * @classdesc Controller REST para recursos ${tableName}.
 */
class ${className}Controller {
    /**
     * GET / - lista com paginação e links HATEOAS.
     * @param {import('express').Request} req
     * @param {import('express').Response} res
     * @param {import('express').NextFunction} next
     * @returns {Promise<void>}
     */
    async getAll(req, res, next) {
        try {
            const { page = 1, limit = 10, includeTotal = 'true', ...filters } = req.query;
            const result = await ${serviceName}.getAll(filters, page, limit, includeTotal);

            const baseUrl = \`\${req.protocol}://\${req.get('host')}\${req.baseUrl}\`;
            const queryParams = new URLSearchParams({ ...filters, includeTotal: result.meta.includeTotal });

            result.links = {
                self: \`\${baseUrl}?page=\${result.meta.currentPage}&limit=\${result.meta.itemsPerPage}&\${queryParams}\`
            };

            if (result.meta.includeTotal) {
                result.links.first = \`\${baseUrl}?page=1&limit=\${result.meta.itemsPerPage}&\${queryParams}\`;
                result.links.last = \`\${baseUrl}?page=\${result.meta.totalPages}&limit=\${result.meta.itemsPerPage}&\${queryParams}\`;

                if (result.meta.currentPage > 1) {
                    result.links.prev = \`\${baseUrl}?page=\${result.meta.currentPage - 1}&limit=\${result.meta.itemsPerPage}&\${queryParams}\`;
                }
                if (result.meta.currentPage < result.meta.totalPages) {
                    result.links.next = \`\${baseUrl}?page=\${result.meta.currentPage + 1}&limit=\${result.meta.itemsPerPage}&\${queryParams}\`;
                }
            } else {
                if (result.meta.currentPage > 1) {
                    result.links.prev = \`\${baseUrl}?page=\${result.meta.currentPage - 1}&limit=\${result.meta.itemsPerPage}&\${queryParams}\`;
                }
                if (result.data.length === result.meta.itemsPerPage) {
                    result.links.next = \`\${baseUrl}?page=\${result.meta.currentPage + 1}&limit=\${result.meta.itemsPerPage}&\${queryParams}\`;
                }
            }

            res.json(result);
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /:id
     * @param {import('express').Request} req
     * @param {import('express').Response} res
     * @param {import('express').NextFunction} next
     * @returns {Promise<void>}
     */
    async getById(req, res, next) {
        try {
            const item = await ${serviceName}.getById(req.params.id);
            res.json(item);
        } catch (error) {
            next(error);
        }
    }

    /**
     * POST /
     * @param {import('express').Request} req
     * @param {import('express').Response} res
     * @param {import('express').NextFunction} next
     * @returns {Promise<void>}
     */
    async create(req, res, next) {
        try {
            const item = await ${serviceName}.create(req.body);
            res.status(201).json(item);
        } catch (error) {
            next(error);
        }
    }

    /**
     * POST /bulk
     * @param {import('express').Request} req
     * @param {import('express').Response} res
     * @param {import('express').NextFunction} next
     * @returns {Promise<void>}
     */
    async createBulk(req, res, next) {
        try {
            const result = await ${serviceName}.createBulk(req.body);
            res.status(201).json(result);
        } catch (error) {
            next(error);
        }
    }

    /**
     * PUT /:id
     * @param {import('express').Request} req
     * @param {import('express').Response} res
     * @param {import('express').NextFunction} next
     * @returns {Promise<void>}
     */
    async update(req, res, next) {
        try {
            const item = await ${serviceName}.update(req.params.id, req.body);
            res.json(item);
        } catch (error) {
            next(error);
        }
    }

    /**
     * DELETE /:id
     * @param {import('express').Request} req
     * @param {import('express').Response} res
     * @param {import('express').NextFunction} next
     * @returns {Promise<void>}
     */
    async delete(req, res, next) {
        try {
            await ${serviceName}.delete(req.params.id);
            res.status(204).end();
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /search/:column/:value
        *
        * Colunas suportadas para pesquisa nesta entidade:
    ${searchableColumnsDoc}
        *
        * @param {import('express').Request<{ column: ${columnUnionType}, value: string }>} req
     * @param {import('express').Response} res
     * @param {import('express').NextFunction} next
     * @returns {Promise<void>}
     */
    async findByColumn(req, res, next) {
        try {
            const { column, value } = req.params;
            const { page = 1, limit = 10, includeTotal = 'true' } = req.query;
            const result = await ${serviceName}.findByColumnPaginated(column, value, page, limit, includeTotal);

            const baseUrl = \`\${req.protocol}://\${req.get('host')}\${req.baseUrl}/search/\${column}/\${value}\`;
            const queryParams = new URLSearchParams({ includeTotal: result.meta.includeTotal });
            
            result.links = {
                self: \`\${baseUrl}?page=\${result.meta.currentPage}&limit=\${result.meta.itemsPerPage}&\${queryParams}\`
            };

            if (result.meta.includeTotal) {
                result.links.first = \`\${baseUrl}?page=1&limit=\${result.meta.itemsPerPage}&\${queryParams}\`;
                result.links.last = \`\${baseUrl}?page=\${result.meta.totalPages}&limit=\${result.meta.itemsPerPage}&\${queryParams}\`;

                if (result.meta.currentPage > 1) {
                    result.links.prev = \`\${baseUrl}?page=\${result.meta.currentPage - 1}&limit=\${result.meta.itemsPerPage}&\${queryParams}\`;
                }
                if (result.meta.currentPage < result.meta.totalPages) {
                    result.links.next = \`\${baseUrl}?page=\${result.meta.currentPage + 1}&limit=\${result.meta.itemsPerPage}&\${queryParams}\`;
                }
            } else {
                if (result.meta.currentPage > 1) {
                    result.links.prev = \`\${baseUrl}?page=\${result.meta.currentPage - 1}&limit=\${result.meta.itemsPerPage}&\${queryParams}\`;
                }
                if (result.data.length === result.meta.itemsPerPage) {
                    result.links.next = \`\${baseUrl}?page=\${result.meta.currentPage + 1}&limit=\${result.meta.itemsPerPage}&\${queryParams}\`;
                }
            }

            res.json(result);
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
    const pk = schema.columns.find((c) => c.key === 'PRI')?.name || 'id';

    return `
/**
 * @fileoverview Rotas REST de ${tableName}.
 * @description Define middlewares de autenticação, autorização e validação por ação.
 */

const express = require('express');
const router = express.Router();
const ${controllerName} = require('../controllers/${controllerName}');
const authMiddleware = require('../middlewares/authMiddleware');
const authorize = require('../middlewares/authorizeMiddleware');
const ${validatorName} = require('../middlewares/validators/${validatorName}');

/**
 * Política de autorização por recurso.
 * @constant {string}
 */
const RESOURCE = '${tableName}';
const canRead = authorize({
    anyRole: ['admin', 'operator', 'read_only'],
    anyScope: [RESOURCE + ':read'],
});
const canWrite = authorize({
    anyRole: ['admin', 'operator'],
    anyScope: [RESOURCE + ':write'],
});
const canDelete = authorize({
    anyRole: ['admin'],
    anyScope: [RESOURCE + ':delete'],
});

router.get('/', authMiddleware, canRead, ${controllerName}.getAll);
router.get('/search/:column/:value', authMiddleware, canRead, ${controllerName}.findByColumn);
router.get('/:id', authMiddleware, canRead, ${controllerName}.getById);

router.post('/', authMiddleware, canWrite, ${validatorName}.validate, ${controllerName}.create);
router.post('/bulk', authMiddleware, canWrite, ${validatorName}.validateBulk, ${controllerName}.createBulk);
router.put('/:id', authMiddleware, canWrite, ${validatorName}.validate, ${controllerName}.update);
router.delete('/:id', authMiddleware, canDelete, ${controllerName}.delete);

module.exports = router;
`;
  },
};
