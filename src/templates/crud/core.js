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

  repository: (tableName, schema, fullSchema = null) => {
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
    const schemaMap =
      fullSchema && typeof fullSchema === 'object' ? fullSchema : { [tableName]: schema };
    const tableMetadata = Object.entries(schemaMap).reduce((acc, [currentTable, currentSchema]) => {
      const columns = (currentSchema?.columns || []).map((col) => col.name);
      const currentPk =
        currentSchema?.columns?.find((col) => col.key === 'PRI')?.name ||
        (columns.includes('id') ? 'id' : columns[0] || 'id');

      acc[currentTable] = {
        primaryKey: currentPk,
        columns,
      };
      return acc;
    }, {});

    const relationGraph = Object.keys(schemaMap).reduce((acc, currentTable) => {
      acc[currentTable] = { outgoing: [], incoming: [] };
      return acc;
    }, {});

    for (const [sourceTable, sourceSchema] of Object.entries(schemaMap)) {
      const foreignKeys = sourceSchema?.foreignKeys || [];
      for (const fk of foreignKeys) {
        if (!relationGraph[sourceTable]) {
          relationGraph[sourceTable] = { outgoing: [], incoming: [] };
        }
        if (!relationGraph[fk.referencedTable]) {
          relationGraph[fk.referencedTable] = { outgoing: [], incoming: [] };
        }

        relationGraph[sourceTable].outgoing.push({
          sourceTable,
          sourceColumn: fk.column,
          targetTable: fk.referencedTable,
          targetColumn: fk.referencedColumn,
        });

        relationGraph[fk.referencedTable].incoming.push({
          sourceTable,
          sourceColumn: fk.column,
          targetTable: fk.referencedTable,
          targetColumn: fk.referencedColumn,
        });
      }
    }

    const tableMetadataLiteral = JSON.stringify(tableMetadata);
    const relationGraphLiteral = JSON.stringify(relationGraph);

    return `
/**
 * @fileoverview Repositório de acesso a dados para ${tableName}.
 * @description Executa queries parametrizadas com timeout e logs estruturados.
 */

const { getPoolForTable } = require('../config/database');
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
const ROOT_TABLE = ${JSON.stringify(tableName)};
const dbPool = getPoolForTable(ROOT_TABLE);
const TABLE_METADATA = ${tableMetadataLiteral};
const RELATION_GRAPH = ${relationGraphLiteral};
const TABLE_SQL_MAP = Object.keys(TABLE_METADATA).reduce((acc, table) => {
    acc[table] = '\`' + table + '\`';
    return acc;
}, {});
const TABLE_SELECT_SQL_MAP = Object.entries(TABLE_METADATA).reduce((acc, [table, metadata]) => {
    acc[table] = (metadata.columns || []).map((column) => '\`' + column + '\`').join(', ');
    return acc;
}, {});
const TABLE_COLUMN_SQL_MAP = Object.entries(TABLE_METADATA).reduce((acc, [table, metadata]) => {
    acc[table] = (metadata.columns || []).reduce((innerAcc, column) => {
        innerAcc[column] = '\`' + column + '\`';
        return innerAcc;
    }, {});
    return acc;
}, {});

/**
 * Executa query SQL com timeout e telemetria.
 * @param {string} sql SQL parametrizado.
 * @param {any[]} [params=[]] Lista de parâmetros.
 * @param {string} [context='query'] Nome lógico da operação.
 * @returns {Promise<any[]>}
 * @throws {Error} Propaga erro de execução do driver.
 */
async function runQuery(sql, params = [], context = 'query', tableName = ROOT_TABLE) {
    const start = Date.now();
    const activePool = getPoolForTable(tableName);
    try {
        return await activePool.query({ sql, timeout: QUERY_TIMEOUT_MS }, params);
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
 * Gera chave estável para serializar relacionamentos sem colisão.
 * @param {string} baseKey Prefixo por tabela.
 * @param {number} index Índice da relação no array.
 * @param {string} discriminator Coluna de referência.
 * @returns {string}
 */
function buildRelationKey(baseKey, index, discriminator) {
    if (index === 0) {
        return baseKey;
    }
    return baseKey + '_' + discriminator + '_' + String(index);
}

/**
 * Busca um único registro em tabela arbitrária por coluna.
 * @param {string} table Nome da tabela.
 * @param {string} column Nome da coluna.
 * @param {string|number} value Valor de filtro.
 * @returns {Promise<any|undefined>}
 */
async function findSingleByColumn(table, column, value) {
    const tableSql = TABLE_SQL_MAP[table];
    const columnSql = TABLE_COLUMN_SQL_MAP[table] && TABLE_COLUMN_SQL_MAP[table][column];
    const selectSql = TABLE_SELECT_SQL_MAP[table];
    if (!tableSql || !columnSql || !selectSql) {
        return undefined;
    }

    const query = 'SELECT ' + selectSql + ' FROM ' + tableSql + ' WHERE ' + columnSql + ' = ? LIMIT 1';
    const [rows] = await runQuery(query, [value], table + '.findSingleByColumn', table);
    return rows[0];
}

/**
 * Busca múltiplos registros em tabela arbitrária por coluna.
 * @param {string} table Nome da tabela.
 * @param {string} column Nome da coluna.
 * @param {string|number} value Valor de filtro.
 * @returns {Promise<any[]>}
 */
async function findManyByColumn(table, column, value) {
    const tableSql = TABLE_SQL_MAP[table];
    const columnSql = TABLE_COLUMN_SQL_MAP[table] && TABLE_COLUMN_SQL_MAP[table][column];
    const selectSql = TABLE_SELECT_SQL_MAP[table];
    if (!tableSql || !columnSql || !selectSql) {
        return [];
    }

    const query = 'SELECT ' + selectSql + ' FROM ' + tableSql + ' WHERE ' + columnSql + ' = ?';
    const [rows] = await runQuery(query, [value], table + '.findManyByColumn', table);
    return rows;
}

/**
 * Monta grafo de relacionamentos recursivo para um registro.
 * @param {string} table Tabela da entidade atual.
 * @param {Record<string, any>} row Linha base.
 * @param {number} depth Profundidade restante.
 * @param {Set<string>} visited Nós já percorridos.
 * @returns {Promise<Record<string, any>>}
 */
async function buildNestedRelations(table, row, depth, visited) {
    if (!row || depth <= 0) {
        return row;
    }

    const metadata = TABLE_METADATA[table] || {};
    const primaryKey = metadata.primaryKey;
    const identity = primaryKey && row[primaryKey] !== undefined && row[primaryKey] !== null
        ? table + ':' + String(row[primaryKey])
        : null;

    if (identity && visited.has(identity)) {
        return row;
    }

    const nextVisited = new Set(visited);
    if (identity) {
        nextVisited.add(identity);
    }

    const relationDef = RELATION_GRAPH[table] || { outgoing: [], incoming: [] };
    const belongsTo = {};
    const hasMany = {};

    for (let i = 0; i < relationDef.outgoing.length; i++) {
        const relation = relationDef.outgoing[i];
        const foreignValue = row[relation.sourceColumn];
        if (foreignValue === undefined || foreignValue === null) {
            continue;
        }

        const relatedRow = await findSingleByColumn(
            relation.targetTable,
            relation.targetColumn,
            foreignValue,
        );
        if (!relatedRow) {
            continue;
        }

        const key = buildRelationKey(relation.targetTable, i, relation.sourceColumn);
        belongsTo[key] = await buildNestedRelations(relation.targetTable, relatedRow, depth - 1, nextVisited);
    }

    for (let i = 0; i < relationDef.incoming.length; i++) {
        const relation = relationDef.incoming[i];
        const localValue = row[relation.targetColumn];
        if (localValue === undefined || localValue === null) {
            continue;
        }

        const relatedRows = await findManyByColumn(
            relation.sourceTable,
            relation.sourceColumn,
            localValue,
        );
        if (relatedRows.length === 0) {
            continue;
        }

        const key = buildRelationKey(relation.sourceTable, i, relation.sourceColumn);
        hasMany[key] = await Promise.all(
            relatedRows.map((relatedRow) =>
                buildNestedRelations(relation.sourceTable, relatedRow, depth - 1, nextVisited),
            ),
        );
    }

    const relationships = {};
    if (Object.keys(belongsTo).length > 0) {
        relationships.belongsTo = belongsTo;
    }
    if (Object.keys(hasMany).length > 0) {
        relationships.hasMany = hasMany;
    }

    if (Object.keys(relationships).length === 0) {
        return row;
    }

    return { ...row, relationships };
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
     * Busca registro por id com relacionamentos encadeados.
     * @param {string|number} id Valor da PK.
     * @param {number|string} [depth=1] Profundidade máxima de encadeamento.
     * @returns {Promise<any|undefined>}
     */
    async findByIdWithRelations(id, depth = 1) {
        const root = await this.findById(id);
        if (!root) {
            return undefined;
        }

        const parsedDepth = Number.parseInt(depth, 10);
        const safeDepth = Number.isFinite(parsedDepth) ? Math.min(Math.max(parsedDepth, 0), 5) : 1;
        if (safeDepth === 0) {
            return root;
        }

        return buildNestedRelations(ROOT_TABLE, root, safeDepth, new Set());
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
     * Lista registros retornando apenas as colunas selecionadas.
     * @param {string[]} columns Colunas permitidas para projeção.
     * @returns {Promise<any[]>}
     */
    async findSelectedColumns(columns) {
        const safeColumns = (columns || []).filter((column) => COLUMN_SQL_MAP[column]);
        if (safeColumns.length === 0) {
            return [];
        }

        const selectSql = safeColumns.map((column) => COLUMN_SQL_MAP[column]).join(', ');
        const query = 'SELECT ' + selectSql + ' FROM ${tableName}';
        const [rows] = await runQuery(query, [], '${tableName}.findSelectedColumns');
        return rows;
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
        const connection = await dbPool.getConnection();
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

    /**
     * Atualiza múltiplos registros em transação.
     * @param {Array<Record<string, any>>} dataArray Lista de itens contendo pk e campos.
     * @returns {Promise<{affectedRows:number}>}
     */
    async updateBulk(dataArray) {
        if (!Array.isArray(dataArray) || dataArray.length === 0) return { affectedRows: 0 };
        const connection = await dbPool.getConnection();
        try {
            await connection.beginTransaction();
            let totalAffected = 0;
            for (const item of dataArray) {
                const id = item[${JSON.stringify(pk)}];
                const safeData = filterByAllowedColumns(item, UPDATABLE_COLUMNS);
                if (id === undefined || id === null || Object.keys(safeData).length === 0) continue;
                const [result] = await connection.query({ sql: 'UPDATE ${tableName} SET ? WHERE ${pk} = ?', timeout: QUERY_TIMEOUT_MS }, [safeData, id]);
                totalAffected += result.affectedRows;
            }
            await connection.commit();
            return { affectedRows: totalAffected };
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    /**
     * Remove múltiplos registros por array de ids em transação.
     * @param {Array<string|number>} ids Lista de chaves primárias.
     * @returns {Promise<{affectedRows:number}>}
     */
    async deleteBulk(ids) {
        if (!Array.isArray(ids) || ids.length === 0) return { affectedRows: 0 };
        const placeholders = ids.map(() => '?').join(', ');
        const connection = await dbPool.getConnection();
        try {
            await connection.beginTransaction();
            const [result] = await connection.query({ sql: 'DELETE FROM ${tableName} WHERE ${pk} IN (' + placeholders + ')', timeout: QUERY_TIMEOUT_MS }, ids);
            await connection.commit();
            return { affectedRows: result.affectedRows };
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
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
    return `
/**
 * @fileoverview Camada de serviço para ${tableName}.
 * @description Especialização da BaseCrudService para ${tableName}.
 */

const ${repoName} = require('../repositories/${repoName}');
const BaseCrudService = require('../core/BaseCrudService');

/**
 * @class ${className}Service
 * @classdesc Serviço de aplicação para operações de ${tableName}.
 */
class ${className}Service extends BaseCrudService {
    constructor() {
        super({
            repository: ${repoName},
            entityName: '${className}',
            primaryKey: ${JSON.stringify(pk)},
            allowedColumns: ${columnsLiteral},
            stringColumns: ${stringColumnsLiteral},
        });
    }
}

module.exports = new ${className}Service();
`;
  },

  controller: (tableName, schema, fullSchema = null, tableConfig = null) => {
    const className = pascalCase(tableName);
    const serviceName = `${camelCase(tableName)}Service`;
    const customRoutes = Array.isArray(tableConfig?.customRoutes) ? tableConfig.customRoutes : [];
    const normalizedCustomRoutes = customRoutes
      .map((route, index) => {
        if (!route || String(route.method || 'get').toLowerCase() !== 'get') return null;

        const columns = Array.isArray(route.columns)
          ? route.columns.filter((column) => typeof column === 'string' && column.trim())
          : [];
        if (columns.length === 0) return null;

        const rawPath = typeof route.path === 'string' ? route.path.trim() : '';
        const path = rawPath
          ? rawPath.startsWith('/')
            ? rawPath
            : `/${rawPath}`
          : `/custom-${index + 1}`;
        const methodSeed = route.name || route.path || `custom_${index + 1}`;
        const methodName = `get${pascalCase(methodSeed)}Projection`;

        return {
          methodName,
          path,
          columns,
        };
      })
      .filter(Boolean);
    const customControllerMethods = normalizedCustomRoutes
      .map(
        (route) => `
        /**
         * GET ${route.path}
         * Retorna projeção de colunas configurada no api.config.json.
         * @param {import('express').Request} req
         * @param {import('express').Response} res
         * @param {import('express').NextFunction} next
         * @returns {Promise<void>}
         */
        async ${route.methodName}(req, res, next) {
                try {
                        const data = await this.service.getSelectedColumns(${JSON.stringify(route.columns)});
                        res.json(data);
                } catch (error) {
                        next(error);
                }
        }`,
      )
      .join('\n');
    const customMethodBindings = normalizedCustomRoutes
      .map((route) => `        this.${route.methodName} = this.${route.methodName}.bind(this);`)
      .join('\n');

    return `
/**
 * @fileoverview Controller HTTP de ${tableName}.
 * @description Especialização da BaseCrudController para ${tableName}.
 */

const ${serviceName} = require('../services/${serviceName}');
const BaseCrudController = require('../core/BaseCrudController');

/**
 * @class ${className}Controller
 * @classdesc Controller REST para recursos ${tableName}.
 */
class ${className}Controller extends BaseCrudController {
    constructor() {
        super({ service: ${serviceName} });
${customMethodBindings}
    }
${customControllerMethods}
}

module.exports = new ${className}Controller();
`;
  },

  routes: (tableName, schema, fullSchema = null, tableConfig = null) => {
    const controllerName = `${camelCase(tableName)}Controller`;
    const validatorName = `${camelCase(tableName)}Validator`;
    const routeConfig = tableConfig?.routes || null;
    const on = (key) => !routeConfig || routeConfig[key] !== false;
    const customRoutes = Array.isArray(tableConfig?.customRoutes) ? tableConfig.customRoutes : [];
    const normalizedCustomRoutes = customRoutes
      .map((route, index) => {
        if (!route || String(route.method || 'get').toLowerCase() !== 'get') return null;
        const columns = Array.isArray(route.columns)
          ? route.columns.filter((column) => typeof column === 'string' && column.trim())
          : [];
        if (columns.length === 0) return null;

        const rawPath = typeof route.path === 'string' ? route.path.trim() : '';
        const path = rawPath
          ? rawPath.startsWith('/')
            ? rawPath
            : `/${rawPath}`
          : `/custom-${index + 1}`;
        const methodSeed = route.name || route.path || `custom_${index + 1}`;
        const methodName = `get${pascalCase(methodSeed)}Projection`;

        return { path, methodName };
      })
      .filter(Boolean);
    const customRouteLines = normalizedCustomRoutes
      .map(
        (route) =>
          `router.get('${route.path}', authMiddleware, canRead, ${controllerName}.${route.methodName});`,
      )
      .join('\n');

    const routeLines = [
      on('getAll') && `router.get('/', authMiddleware, canRead, ${controllerName}.getAll);`,
      on('search') &&
        `router.get('/search/:column/:value', authMiddleware, canRead, ${controllerName}.findByColumn);`,
      on('getByIdWithRelations') &&
        `router.get('/:id/relations', authMiddleware, canRead, ${controllerName}.getByIdWithRelations);`,
      on('getById') && `router.get('/:id', authMiddleware, canRead, ${controllerName}.getById);`,
      '',
      on('create') &&
        `router.post('/', authMiddleware, canWrite, (req, res, next) => ${validatorName}.validate(req, res, next), ${controllerName}.create);`,
      on('createBulk') &&
        `router.post('/bulk', authMiddleware, canWrite, (req, res, next) => ${validatorName}.validateBulk(req, res, next), ${controllerName}.createBulk);`,
      on('updateBulk') &&
        `router.put('/bulk', authMiddleware, canWrite, (req, res, next) => ${validatorName}.validateBulkUpdate(req, res, next), ${controllerName}.updateBulk);`,
      on('update') &&
        `router.put('/:id', authMiddleware, canWrite, (req, res, next) => ${validatorName}.validate(req, res, next), ${controllerName}.update);`,
      on('deleteBulk') &&
        `router.delete('/bulk', authMiddleware, canDelete, ${controllerName}.deleteBulk);`,
      on('delete') && `router.delete('/:id', authMiddleware, canDelete, ${controllerName}.delete);`,
    ]
      .filter(Boolean)
      .join('\n');

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

${routeLines}
${customRouteLines ? `\n${customRouteLines}` : ''}

module.exports = router;
`;
  },
};
