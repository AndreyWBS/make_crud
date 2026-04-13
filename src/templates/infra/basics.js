function normalizeLanguage(language = 'pt') {
  const normalized = String(language || '')
    .trim()
    .toLowerCase();

  if (normalized === 'pt' || normalized === 'pt-br' || normalized === 'pt_br') {
    return 'pt';
  }

  return 'en';
}

function getErrorI18n(language = 'pt') {
  const locale = normalizeLanguage(language);

  const dictionary = {
    en: {
      unauthorized: 'Unauthorized',
      forbidden: 'Forbidden',
      invalidJsonBody: 'Invalid JSON in request body.',
      unexpectedError: 'An unexpected error occurred. Please try again later.',
      invalidPage: 'Invalid page. It must be an integer >= 1.',
      invalidLimitPrefix: 'Invalid limit. It must be an integer between 1 and ',
      invalidLimitSuffix: '.',
      invalidIncludeTotal: 'Invalid includeTotal. Use true or false.',
      invalidFilterColumnsPrefix: 'Invalid filter columns: ',
      eachBulkItemObject: 'Each bulk item must be an object',
      bulkItemsSameShape: 'All bulk items must have the same shape',
      notFoundSuffix: ' not found',
      bulkInsertBody: 'Body must be a non-empty array for bulk insert',
      bulkUpdateBody: 'Body must be a non-empty array for bulk update',
      bulkUpdatePrimaryKeySuffix: ' is required in each item for bulk update',
      bulkDeleteBody: 'Body must be a non-empty array of ids for bulk delete',
      columnsConfigBody: 'Columns config must be a non-empty array',
      invalidSelectedColumnsPrefix: 'Invalid selected columns: ',
      invalidSearchColumnPrefix: 'Invalid column for search: ',
      mysqlErrorMap: {
        ER_DUP_ENTRY: { status: 409, message: 'Conflict: duplicate entry.' },
        ER_NO_REFERENCED_ROW_2: {
          status: 422,
          message: 'Unprocessable Entity: foreign key constraint failed.',
        },
        ER_ROW_IS_REFERENCED_2: {
          status: 409,
          message: 'Conflict: record is referenced by other records.',
        },
        ER_BAD_FIELD_ERROR: { status: 400, message: 'Bad Request: unknown column.' },
        ER_PARSE_ERROR: { status: 400, message: 'Bad Request: query parse error.' },
        ER_DATA_TOO_LONG: {
          status: 422,
          message: 'Unprocessable Entity: value too long for column.',
        },
        ER_TRUNCATED_WRONG_VALUE: {
          status: 422,
          message: 'Unprocessable Entity: incorrect value for column.',
        },
      },
      httpStatusText: {
        400: 'Bad Request',
        401: 'Unauthorized',
        403: 'Forbidden',
        404: 'Not Found',
        405: 'Method Not Allowed',
        409: 'Conflict',
        410: 'Gone',
        422: 'Unprocessable Entity',
        429: 'Too Many Requests',
        500: 'Internal Server Error',
        501: 'Not Implemented',
        503: 'Service Unavailable',
      },
    },
    pt: {
      unauthorized: 'Nao autorizado',
      forbidden: 'Proibido',
      invalidJsonBody: 'JSON invalido no corpo da requisicao.',
      unexpectedError: 'Ocorreu um erro inesperado. Tente novamente mais tarde.',
      invalidPage: 'Pagina invalida. Ela deve ser um inteiro >= 1.',
      invalidLimitPrefix: 'Limite invalido. Ele deve ser um inteiro entre 1 e ',
      invalidLimitSuffix: '.',
      invalidIncludeTotal: 'includeTotal invalido. Use true ou false.',
      invalidFilterColumnsPrefix: 'Colunas de filtro invalidas: ',
      eachBulkItemObject: 'Cada item em lote deve ser um objeto',
      bulkItemsSameShape: 'Todos os itens em lote devem ter o mesmo formato',
      notFoundSuffix: ' nao encontrado',
      bulkInsertBody: 'O corpo deve ser um array nao vazio para insercao em lote',
      bulkUpdateBody: 'O corpo deve ser um array nao vazio para atualizacao em lote',
      bulkUpdatePrimaryKeySuffix: ' e obrigatorio em cada item para atualizacao em lote',
      bulkDeleteBody: 'O corpo deve ser um array nao vazio de ids para exclusao em lote',
      columnsConfigBody: 'A configuracao de colunas deve ser um array nao vazio',
      invalidSelectedColumnsPrefix: 'Colunas selecionadas invalidas: ',
      invalidSearchColumnPrefix: 'Coluna invalida para busca: ',
      mysqlErrorMap: {
        ER_DUP_ENTRY: { status: 409, message: 'Conflito: registro duplicado.' },
        ER_NO_REFERENCED_ROW_2: {
          status: 422,
          message: 'Entidade nao processavel: falha na restricao de chave estrangeira.',
        },
        ER_ROW_IS_REFERENCED_2: {
          status: 409,
          message: 'Conflito: registro referenciado por outros registros.',
        },
        ER_BAD_FIELD_ERROR: { status: 400, message: 'Requisicao invalida: coluna desconhecida.' },
        ER_PARSE_ERROR: { status: 400, message: 'Requisicao invalida: erro de parse da query.' },
        ER_DATA_TOO_LONG: {
          status: 422,
          message: 'Entidade nao processavel: valor muito longo para a coluna.',
        },
        ER_TRUNCATED_WRONG_VALUE: {
          status: 422,
          message: 'Entidade nao processavel: valor incorreto para a coluna.',
        },
      },
      httpStatusText: {
        400: 'Requisicao Invalida',
        401: 'Nao Autorizado',
        403: 'Proibido',
        404: 'Nao Encontrado',
        405: 'Metodo Nao Permitido',
        409: 'Conflito',
        410: 'Indisponivel',
        422: 'Entidade Nao Processavel',
        429: 'Muitas Requisicoes',
        500: 'Erro Interno do Servidor',
        501: 'Nao Implementado',
        503: 'Servico Indisponivel',
      },
    },
  };

  return dictionary[locale] || dictionary.en;
}

module.exports = {
  appError: () => `
/**
 * @fileoverview Classe base de erro operacional da aplicação.
 */

/**
 * @class AppError
 * @extends Error
 */
class AppError extends Error {
    /**
     * @param {number} statusCode Status HTTP associado ao erro.
     * @param {string} message Mensagem de erro segura para cliente.
     * @param {Record<string, any>|null} [details=null] Detalhes adicionais em ambiente não produtivo.
     */
    constructor(statusCode, message, details = null) {
        super(message);
        this.statusCode = statusCode;
        this.details = details;
        this.isOperational = true;
        Error.captureStackTrace(this, this.constructor);
    }
}

module.exports = AppError;
`,

  errorMiddleware: (language = 'pt') => {
    const i18n = getErrorI18n(language);
    return `
/**
 * @fileoverview Middleware global de tratamento de erros.
 */

const logger = require('../utils/logger');
const AppError = require('../utils/AppError');

const isProduction = process.env.NODE_ENV === 'production';

const MYSQL_ERROR_MAP = ${JSON.stringify(i18n.mysqlErrorMap, null, 4)};

/**
 * Normaliza respostas de erro em formato seguro.
 * @param {Error} err Erro capturado na cadeia do Express.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 * @returns {import('express').Response}
 */
module.exports = (err, req, res, next) => {
  // Log estruturado da falha para investigação por correlationId.
  logger.error('request.error', {
    correlationId: req.id,
    method: req.method,
    path: req.originalUrl,
    statusCode: err.statusCode || 500,
    errorName: err.name || 'Error',
    errorMessage: err.message,
    stack: isProduction ? undefined : err.stack,
  });

    // Operational errors (AppError)
    if (err instanceof AppError) {
      const exposeDetails = !isProduction && err.details;
        return res.status(err.statusCode).json({
            status: err.statusCode,
            error: httpStatusText(err.statusCode),
            message: err.message,
        correlationId: req.id,
        ...(exposeDetails && { details: err.details }),
        });
    }

    // MySQL errors
    if (err.code && MYSQL_ERROR_MAP[err.code]) {
        const mapped = MYSQL_ERROR_MAP[err.code];
        return res.status(mapped.status).json({
            status: mapped.status,
            error: httpStatusText(mapped.status),
            message: mapped.message,
          correlationId: req.id,
        });
    }

    // JWT errors
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
        return res.status(401).json({
            status: 401,
            error: ${JSON.stringify(i18n.unauthorized)},
          message: ${JSON.stringify(i18n.unauthorized)},
          correlationId: req.id,
        });
    }

    // SyntaxError in JSON body parsing
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
        return res.status(400).json({
            status: 400,
            error: httpStatusText(400),
            message: ${JSON.stringify(i18n.invalidJsonBody)},
          correlationId: req.id,
        });
    }

    // Fallback: unexpected internal error
    return res.status(500).json({
        status: 500,
        error: httpStatusText(500),
        message: ${JSON.stringify(i18n.unexpectedError)},
      correlationId: req.id,
    });
};

/**
 * Converte status code em texto HTTP amigável.
 * @param {number} code Código HTTP.
 * @returns {string}
 */
function httpStatusText(code) {
  const map = ${JSON.stringify(i18n.httpStatusText, null, 4)};
    return map[code] || 'Error';
}
`;
  },

  logger: () => `
/**
 * @fileoverview Logger estruturado com redação automática de dados sensíveis.
 */

  const SENSITIVE_KEY_REGEX = /(password|secret|token|authorization|cookie|api[_-]?key|refresh[_-]?token)/i;

  /**
   * Remove ou mascara campos sensíveis.
   * @param {any} value Valor bruto.
   * @param {string} [parentKey=''] Chave pai para heurística de sigilo.
   * @returns {any}
   */
  function redact(value, parentKey = '') {
    if (Array.isArray(value)) {
      return value.map((item) => redact(item, parentKey));
    }

    if (value && typeof value === 'object') {
      const output = {};
      for (const [key, innerValue] of Object.entries(value)) {
        output[key] = SENSITIVE_KEY_REGEX.test(key)
          ? '[REDACTED]'
          : redact(innerValue, key);
      }
      return output;
    }

    if (typeof value === 'string' && SENSITIVE_KEY_REGEX.test(parentKey)) {
      return '[REDACTED]';
    }

    return value;
  }

  /**
   * Emite linha de log JSON.
   * @param {'info'|'warn'|'error'} level Nível.
   * @param {string} event Nome estável do evento.
   * @param {Record<string, any>} [meta={}] Metadados anexos.
   * @returns {void}
   */
  function log(level, event, meta = {}) {
    // Todos os logs seguem o mesmo envelope JSON para facilitar observabilidade.
    const payload = {
      timestamp: new Date().toISOString(),
      level,
      event,
      ...redact(meta)
    };
    const line = JSON.stringify(payload);
    if (level === 'error') {
      console.error(line);
      return;
    }
    console.log(line);
  }

module.exports = {
    info: (event, meta) => log('info', event, meta),
    warn: (event, meta) => log('warn', event, meta),
    error: (event, meta) => log('error', event, meta)
};
`,

  requestContextMiddleware: () => `
/**
 * @fileoverview Middleware de correlação de requisição.
 */

const { randomUUID } = require('crypto');

/**
 * Define correlationId em req/res para rastreabilidade.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 * @returns {void}
 */
module.exports = (req, res, next) => {
  // Aceita correlationId externo e gera UUID quando ausente.
  const inboundId = req.headers['x-correlation-id'] || req.headers['x-request-id'];
  req.id = typeof inboundId === 'string' && inboundId.trim() ? inboundId.trim() : randomUUID();
  res.setHeader('x-correlation-id', req.id);
  next();
};
`,

  requestLoggerMiddleware: () => `
/**
 * @fileoverview Middleware de logging de requisições HTTP.
 */

const logger = require('../utils/logger');

/**
 * Resolve nível de log com base no status HTTP.
 * @param {number} code Status code de resposta.
 * @returns {'info'|'warn'|'error'}
 */
function statusLevel(code) {
  if (code >= 500) return 'error';
  if (code >= 400) return 'warn';
  return 'info';
}

/**
 * Registra evento http.request ao final da resposta.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 * @returns {void}
 */
module.exports = (req, res, next) => {
  const startedAt = Date.now();

  res.on('finish', () => {
    // Registra requisição ao final para capturar status e latência reais.
    const durationMs = Date.now() - startedAt;
    const level = statusLevel(res.statusCode);
    logger[level]('http.request', {
      correlationId: req.id,
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs,
      userId: req.userId || null,
      ip: req.ip,
    });
  });

  next();
};
`,

  pagination: (language = 'pt') => {
    const i18n = getErrorI18n(language);
    return `
/**
 * @fileoverview Utilitários de paginação e normalização de parâmetros.
 */

const AppError = require('./AppError');

const MAX_LIMIT = Number(process.env.API_MAX_LIMIT) || 100;

/**
 * Normaliza e valida paginação.
 * @param {number|string} page Página solicitada.
 * @param {number|string} limit Limite por página.
 * @returns {{page:number, limit:number}}
 * @throws {AppError} 400 para valores inválidos.
 */
function normalizePagination(page, limit) {
  const parsedPage = Number.parseInt(page, 10);
  const parsedLimit = Number.parseInt(limit, 10);

  if (!Number.isInteger(parsedPage) || parsedPage < 1) {
    throw new AppError(400, ${JSON.stringify(i18n.invalidPage)});
  }
  if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > MAX_LIMIT) {
    throw new AppError(400, ${JSON.stringify(i18n.invalidLimitPrefix)} + MAX_LIMIT + ${JSON.stringify(i18n.invalidLimitSuffix)});
  }

  return { page: parsedPage, limit: parsedLimit };
}

/**
 * Converte includeTotal para boolean.
 * @param {boolean|string|undefined|null} value Valor recebido.
 * @returns {boolean}
 * @throws {AppError} 400 para formatos inválidos.
 */
function parseIncludeTotal(value) {
  if (value === undefined || value === null || value === '') return true;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;
  }
  throw new AppError(400, ${JSON.stringify(i18n.invalidIncludeTotal)});
}

module.exports = {
  MAX_LIMIT,
  normalizePagination,
  parseIncludeTotal
};
`;
  },

  baseCrudService: (language = 'pt') => {
    const i18n = getErrorI18n(language);
    return `
/**
 * @fileoverview Classe base para serviços CRUD.
 */

const AppError = require('../utils/AppError');
const { normalizePagination, parseIncludeTotal } = require('../utils/pagination');

const DEFAULT_LIMIT = 10;

class BaseCrudService {
  constructor({ repository, entityName, primaryKey = 'id', allowedColumns = [], stringColumns = [] }) {
    this.repository = repository;
    this.entityName = entityName;
    this.primaryKey = primaryKey;
    this.allowedColumns = new Set(allowedColumns);
    this.stringColumns = new Set(stringColumns);
  }

  assertAllowedFilterColumns(filters = {}) {
    const invalidColumns = Object.keys(filters).filter((column) => !this.allowedColumns.has(column));
    if (invalidColumns.length > 0) {
      throw new AppError(400, ${JSON.stringify(i18n.invalidFilterColumnsPrefix)} + invalidColumns.join(', '));
    }
  }

  assertUniformBulkShape(dataArray = []) {
    const firstKeys = Object.keys(dataArray[0]).sort();
    for (let i = 0; i < dataArray.length; i++) {
      const item = dataArray[i];
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        throw new AppError(400, ${JSON.stringify(i18n.eachBulkItemObject)});
      }

      const currentKeys = Object.keys(item).sort();
      if (currentKeys.length !== firstKeys.length || currentKeys.some((key, idx) => key !== firstKeys[idx])) {
        throw new AppError(400, ${JSON.stringify(i18n.bulkItemsSameShape)});
      }
    }
  }

  async getAll(filters, page = 1, limit = DEFAULT_LIMIT, includeTotal = true) {
    const normalized = normalizePagination(page, limit);
    const shouldIncludeTotal = parseIncludeTotal(includeTotal);
    this.assertAllowedFilterColumns(filters || {});

    const { data, total } = await this.repository.findAll(
      filters,
      normalized.page,
      normalized.limit,
      shouldIncludeTotal,
    );
    const totalPages = shouldIncludeTotal ? Math.ceil(total / normalized.limit) : null;

    return {
      data,
      meta: {
        totalItems: total,
        totalPages,
        includeTotal: shouldIncludeTotal,
        currentPage: normalized.page,
        itemsPerPage: normalized.limit,
      },
    };
  }

  async getById(id) {
    const item = await this.repository.findById(id);
    if (!item) throw new AppError(404, this.entityName + ${JSON.stringify(i18n.notFoundSuffix)});
    return item;
  }

  async getByIdWithRelations(id, depth = 1) {
    const item = await this.repository.findByIdWithRelations(id, depth);
    if (!item) throw new AppError(404, this.entityName + ${JSON.stringify(i18n.notFoundSuffix)});
    return item;
  }

  async create(data) {
    return this.repository.create(data);
  }

  async createBulk(dataArray) {
    if (!Array.isArray(dataArray) || dataArray.length === 0) {
      throw new AppError(400, ${JSON.stringify(i18n.bulkInsertBody)});
    }
    this.assertUniformBulkShape(dataArray);
    return this.repository.createBulk(dataArray);
  }

  async update(id, data) {
    await this.getById(id);
    return this.repository.update(id, data);
  }

  async delete(id) {
    await this.getById(id);
    return this.repository.delete(id);
  }

  async updateBulk(dataArray) {
    if (!Array.isArray(dataArray) || dataArray.length === 0) {
      throw new AppError(400, ${JSON.stringify(i18n.bulkUpdateBody)});
    }
    for (let i = 0; i < dataArray.length; i++) {
      const item = dataArray[i];
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        throw new AppError(400, ${JSON.stringify(i18n.eachBulkItemObject)});
      }
      if (item[this.primaryKey] === undefined || item[this.primaryKey] === null) {
        throw new AppError(400, this.primaryKey + ${JSON.stringify(i18n.bulkUpdatePrimaryKeySuffix)});
      }
    }
    return this.repository.updateBulk(dataArray);
  }

  async deleteBulk(ids) {
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new AppError(400, ${JSON.stringify(i18n.bulkDeleteBody)});
    }
    return this.repository.deleteBulk(ids);
  }

  async getSelectedColumns(columns) {
    if (!Array.isArray(columns) || columns.length === 0) {
      throw new AppError(400, ${JSON.stringify(i18n.columnsConfigBody)});
    }

    const normalizedColumns = columns
      .filter((column) => typeof column === 'string' && column.trim())
      .map((column) => column.trim());

    if (normalizedColumns.length === 0) {
      throw new AppError(400, ${JSON.stringify(i18n.columnsConfigBody)});
    }

    const invalidColumns = normalizedColumns.filter((column) => !this.allowedColumns.has(column));
    if (invalidColumns.length > 0) {
      throw new AppError(400, ${JSON.stringify(i18n.invalidSelectedColumnsPrefix)} + invalidColumns.join(', '));
    }

    return this.repository.findSelectedColumns(normalizedColumns);
  }

  async findByColumnPaginated(columnName, value, page = 1, limit = DEFAULT_LIMIT, includeTotal = true) {
    if (!this.allowedColumns.has(columnName)) {
      throw new AppError(400, ${JSON.stringify(i18n.invalidSearchColumnPrefix)} + columnName);
    }

    const normalized = normalizePagination(page, limit);
    const shouldIncludeTotal = parseIncludeTotal(includeTotal);
    const isStringColumn = this.stringColumns.has(columnName);

    const { data, total } = await this.repository.findByColumnPaginated(
      columnName,
      value,
      isStringColumn,
      normalized.page,
      normalized.limit,
      shouldIncludeTotal,
    );
    const totalPages = shouldIncludeTotal ? Math.ceil(total / normalized.limit) : null;

    return {
      data,
      meta: {
        totalItems: total,
        totalPages,
        includeTotal: shouldIncludeTotal,
        currentPage: normalized.page,
        itemsPerPage: normalized.limit,
      },
    };
  }
}

module.exports = BaseCrudService;
`;
  },

  baseCrudController: () => `
/**
 * @fileoverview Classe base para controllers CRUD HTTP.
 */

class BaseCrudController {
  constructor({ service }) {
    this.service = service;
    this.getAll = this.getAll.bind(this);
    this.getById = this.getById.bind(this);
    this.getByIdWithRelations = this.getByIdWithRelations.bind(this);
    this.create = this.create.bind(this);
    this.createBulk = this.createBulk.bind(this);
    this.update = this.update.bind(this);
    this.delete = this.delete.bind(this);
    this.updateBulk = this.updateBulk.bind(this);
    this.deleteBulk = this.deleteBulk.bind(this);
    this.findByColumn = this.findByColumn.bind(this);
  }

  buildPaginationLinks(req, result, baseUrl, filters = {}) {
    const queryParams = new URLSearchParams({ ...filters, includeTotal: result.meta.includeTotal });
    const links = {
      self: baseUrl + '?page=' + result.meta.currentPage + '&limit=' + result.meta.itemsPerPage + '&' + queryParams,
    };

    if (result.meta.includeTotal) {
      links.first = baseUrl + '?page=1&limit=' + result.meta.itemsPerPage + '&' + queryParams;
      links.last = baseUrl + '?page=' + result.meta.totalPages + '&limit=' + result.meta.itemsPerPage + '&' + queryParams;

      if (result.meta.currentPage > 1) {
        links.prev = baseUrl + '?page=' + (result.meta.currentPage - 1) + '&limit=' + result.meta.itemsPerPage + '&' + queryParams;
      }
      if (result.meta.currentPage < result.meta.totalPages) {
        links.next = baseUrl + '?page=' + (result.meta.currentPage + 1) + '&limit=' + result.meta.itemsPerPage + '&' + queryParams;
      }
      return links;
    }

    if (result.meta.currentPage > 1) {
      links.prev = baseUrl + '?page=' + (result.meta.currentPage - 1) + '&limit=' + result.meta.itemsPerPage + '&' + queryParams;
    }
    if (result.data.length === result.meta.itemsPerPage) {
      links.next = baseUrl + '?page=' + (result.meta.currentPage + 1) + '&limit=' + result.meta.itemsPerPage + '&' + queryParams;
    }
    return links;
  }

  async getAll(req, res, next) {
    try {
      const { page = 1, limit = 10, includeTotal = 'true', ...filters } = req.query;
      const result = await this.service.getAll(filters, page, limit, includeTotal);

      const baseUrl = req.protocol + '://' + req.get('host') + req.baseUrl;
      result.links = this.buildPaginationLinks(req, result, baseUrl, filters);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  async getById(req, res, next) {
    try {
      const item = await this.service.getById(req.params.id);
      res.json(item);
    } catch (error) {
      next(error);
    }
  }

  async getByIdWithRelations(req, res, next) {
    try {
      const { depth = 1 } = req.query;
      const item = await this.service.getByIdWithRelations(req.params.id, depth);
      res.json(item);
    } catch (error) {
      next(error);
    }
  }

  async create(req, res, next) {
    try {
      const item = await this.service.create(req.body);
      res.status(201).json(item);
    } catch (error) {
      next(error);
    }
  }

  async createBulk(req, res, next) {
    try {
      const result = await this.service.createBulk(req.body);
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  }

  async update(req, res, next) {
    try {
      const item = await this.service.update(req.params.id, req.body);
      res.json(item);
    } catch (error) {
      next(error);
    }
  }

  async delete(req, res, next) {
    try {
      await this.service.delete(req.params.id);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  }

  async updateBulk(req, res, next) {
    try {
      const result = await this.service.updateBulk(req.body);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  async deleteBulk(req, res, next) {
    try {
      await this.service.deleteBulk(req.body);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  }

  async findByColumn(req, res, next) {
    try {
      const { column, value } = req.params;
      const { page = 1, limit = 10, includeTotal = 'true' } = req.query;
      const result = await this.service.findByColumnPaginated(column, value, page, limit, includeTotal);

      const baseUrl =
        req.protocol + '://' + req.get('host') + req.baseUrl + '/search/' + column + '/' + value;
      result.links = this.buildPaginationLinks(req, result, baseUrl);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = BaseCrudController;
`,

  server: () => `
/**
 * @fileoverview Bootstrap do servidor HTTP.
 */

const app = require('./app');
const env = require('./config/env');
const logger = require('./utils/logger');
app.listen(env.PORT, () => logger.info('server.started', { port: env.PORT }));
`,

  packageJson: () =>
    JSON.stringify(
      {
        name: 'generated-api',
        version: '1.0.0',
        main: 'src/server.js',
        scripts: {
          start: 'node src/server.js',
          dev: 'nodemon src/server.js',
          migrate: 'node src/scripts/migrate.js',
          'migrate:with-seed': 'node src/scripts/migrate.js --with-seed',
          'migrate:dry-run': 'node src/scripts/migrate.js --dry-run',
          'seed:new': 'node src/scripts/create-seed.js',
          test: 'jest --runInBand --detectOpenHandles',
          'test:watch': 'jest --watch',
          'test:integration': 'jest tests/integration --runInBand',
          format: 'prettier --write .',
          'format:check': 'prettier --check .',
        },
        dependencies: {
          express: '^4.18.2',
          cors: '^2.8.5',
          helmet: '^8.0.0',
          mysql2: '^3.6.1',
          dotenv: '^16.3.1',
          'express-rate-limit': '^7.4.1',
          'express-slow-down': '^2.0.3',
          jsonwebtoken: '^9.0.2',
          'swagger-ui-express': '^5.0.1',
        },
        devDependencies: {
          jest: '^29.7.0',
          nodemon: '^3.1.4',
          prettier: '^3.6.2',
          supertest: '^7.1.4',
        },
      },
      null,
      4,
    ),

  database: () => `
/**
 * @fileoverview Configuração de múltiplos pools MySQL com resolução por tabela.
 */

const mysql = require('mysql2/promise');
const env = require('./env');
const tableDatabaseMap = require('./databaseTables');

function createPool(config) {
  return mysql.createPool({
    host: config.host,
    user: config.user,
    password: config.password,
    database: config.database,
    port: config.port,
    waitForConnections: true,
    connectionLimit: Number(process.env.DB_CONNECTION_LIMIT) || 10,
    queueLimit: Number(process.env.DB_QUEUE_LIMIT) || 0,
    connectTimeout: Number(process.env.DB_CONNECT_TIMEOUT_MS) || 10000,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
  });
}

const pools = Object.fromEntries(
  Object.entries(env.DB_CONNECTIONS).map(([key, cfg]) => [key, createPool(cfg)]),
);

const fallbackDatabaseKey = env.DEFAULT_DB_KEY || Object.keys(pools)[0] || 'default';

function resolveDatabaseKey(tableName) {
  return tableDatabaseMap[tableName] || fallbackDatabaseKey;
}

function getPoolForTable(tableName) {
  const dbKey = resolveDatabaseKey(tableName);
  const pool = pools[dbKey];
  if (!pool) {
    const known = Object.keys(pools).join(', ');
    throw new Error(
      'Pool not configured for table "' + tableName + '". Resolved key: "' + dbKey + '". Known keys: [' + known + ']',
    );
  }
  return pool;
}

module.exports = {
  pools,
  resolveDatabaseKey,
  getPoolForTable,
};
`,

  env: () => `
/**
 * @fileoverview Carregamento e validação de variáveis de ambiente.
 */

require('dotenv').config();

  /**
   * @param {string|number|undefined} value Valor bruto.
   * @param {number} fallback Valor padrão.
   * @returns {number}
   */
  function parseNumber(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  /**
   * @param {string|boolean|undefined|null} value Valor bruto.
   * @param {boolean} [fallback=false] Padrão.
   * @returns {boolean}
   */
  function parseBoolean(value, fallback = false) {
    if (value === undefined || value === null || value === '') return fallback;
    if (typeof value === 'boolean') return value;
    const normalized = String(value).toLowerCase().trim();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
    return fallback;
  }

  /**
   * @param {string|undefined} value Valor CSV.
   * @param {string[]} [fallback=[]] Lista padrão.
   * @returns {string[]}
   */
  function parseList(value, fallback = []) {
    if (!value) return fallback;
    return String(value)
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  /**
   * @param {string|undefined} value Mapa CSV no formato kid:secret.
   * @returns {Record<string, string>}
   */
  function parseJwtKeyMap(value) {
    const pairs = parseList(value);
    if (pairs.length === 0) return {};

    return pairs.reduce((acc, pair) => {
      const [kid, ...secretParts] = pair.split(':');
      const secret = secretParts.join(':').trim();
      const normalizedKid = (kid || '').trim();

      if (!normalizedKid || !secret) {
        throw new Error('Invalid JWT_KEYS entry. Use kid:secret format.');
      }

      acc[normalizedKid] = secret;
      return acc;
    }, {});
  }

  /**
   * @param {string|undefined} secret Segredo JWT.
   * @param {string} context Nome lógico da chave.
   * @returns {void}
   */
  function assertStrongSecret(secret, context) {
    if (!secret) {
      throw new Error(context + ' is required.');
    }

    if (process.env.NODE_ENV === 'production' && secret.length < 32) {
      throw new Error(context + ' must contain at least 32 characters in production.');
    }
  }

  const NODE_ENV = process.env.NODE_ENV || 'development';
  const AUTH_DISABLED = parseBoolean(process.env.AUTH_DISABLED, false);

  if (NODE_ENV === 'production' && AUTH_DISABLED) {
    throw new Error('AUTH_DISABLED cannot be true in production.');
  }

  const JWT_KEYS = parseJwtKeyMap(process.env.JWT_KEYS);
  const JWT_ACTIVE_KID = process.env.JWT_ACTIVE_KID || '';

  if (!AUTH_DISABLED) {
    if (Object.keys(JWT_KEYS).length > 0) {
      if (!JWT_ACTIVE_KID) {
        throw new Error('JWT_ACTIVE_KID is required when JWT_KEYS is configured.');
      }

      if (!JWT_KEYS[JWT_ACTIVE_KID]) {
        throw new Error('JWT_ACTIVE_KID must match one of the configured JWT_KEYS.');
      }

      Object.values(JWT_KEYS).forEach((secret, index) => {
        assertStrongSecret(secret, 'JWT_KEYS[' + index + ']');
      });
    } else {
      assertStrongSecret(process.env.JWT_SECRET, 'JWT_SECRET');
    }
  }

  const CORS_ALLOWED_ORIGINS = parseList(process.env.CORS_ALLOWED_ORIGINS);

  function parseDbConnections(raw) {
    if (!raw) {
      return {
        default: {
          host: process.env.DB_HOST,
          user: process.env.DB_USER,
          password: process.env.DB_PASSWORD,
          database: process.env.DB_NAME,
          port: parseNumber(process.env.DB_PORT, 3306),
        },
      };
    }

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      throw new Error('DB_CONNECTIONS must be a valid JSON object');
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('DB_CONNECTIONS must be a JSON object of named connections');
    }

    const normalized = {};
    for (const [key, config] of Object.entries(parsed)) {
      if (!config || typeof config !== 'object' || Array.isArray(config)) {
        throw new Error('DB_CONNECTIONS."' + key + '" must be an object');
      }

      normalized[key] = {
        host: config.host,
        user: config.user,
        password: config.password,
        database: config.database,
        port: parseNumber(config.port, 3306),
      };
    }

    return normalized;
  }

  const DB_CONNECTIONS = parseDbConnections(process.env.DB_CONNECTIONS);
  const DEFAULT_DB_KEY = process.env.DEFAULT_DB_KEY || Object.keys(DB_CONNECTIONS)[0] || 'default';

  module.exports = {
    NODE_ENV,
    PORT: process.env.PORT || 3000,
    DB_HOST: process.env.DB_HOST,
    DB_USER: process.env.DB_USER,
    DB_PASSWORD: process.env.DB_PASSWORD,
    DB_NAME: process.env.DB_NAME,
    DB_PORT: parseNumber(process.env.DB_PORT, 3306),
    DB_CONNECTIONS,
    DEFAULT_DB_KEY,
    JWT_SECRET: process.env.JWT_SECRET,
    JWT_KEYS,
    JWT_ACTIVE_KID,
    JWT_ISSUER: process.env.JWT_ISSUER || 'generated-api',
    JWT_AUDIENCE: process.env.JWT_AUDIENCE || 'generated-api-clients',
    JWT_ALGORITHMS: parseList(process.env.JWT_ALGORITHMS, ['HS256']),
    JWT_ACCESS_MAX_AGE: process.env.JWT_ACCESS_MAX_AGE || '15m',
    DB_QUERY_TIMEOUT_MS: parseNumber(process.env.DB_QUERY_TIMEOUT_MS, 10000),
    API_MAX_LIMIT: parseNumber(process.env.API_MAX_LIMIT, 100),
    API_JSON_LIMIT: process.env.API_JSON_LIMIT || '256kb',
    API_MAX_QUERY_PARAMS: parseNumber(process.env.API_MAX_QUERY_PARAMS, 20),
    API_MAX_URL_LENGTH: parseNumber(process.env.API_MAX_URL_LENGTH, 2048),
    RATE_LIMIT_WINDOW_MS: parseNumber(process.env.RATE_LIMIT_WINDOW_MS, 60 * 1000),
    RATE_LIMIT_MAX: parseNumber(process.env.RATE_LIMIT_MAX, 120),
    RATE_LIMIT_SENSITIVE_MAX: parseNumber(process.env.RATE_LIMIT_SENSITIVE_MAX, 40),
    SLOW_DOWN_WINDOW_MS: parseNumber(process.env.SLOW_DOWN_WINDOW_MS, 60 * 1000),
    SLOW_DOWN_DELAY_AFTER: parseNumber(process.env.SLOW_DOWN_DELAY_AFTER, 40),
    SLOW_DOWN_DELAY_MS: parseNumber(process.env.SLOW_DOWN_DELAY_MS, 200),
    CORS_ALLOWED_ORIGINS,
    AUTH_DISABLED,
    SWAGGER_ENABLED: parseBoolean(process.env.SWAGGER_ENABLED, NODE_ENV !== 'production'),
    SWAGGER_REQUIRE_ADMIN: parseBoolean(process.env.SWAGGER_REQUIRE_ADMIN, true),
    SWAGGER_ALLOWED_IPS: parseList(process.env.SWAGGER_ALLOWED_IPS)
};
`,

  authMiddleware: (language = 'pt') => {
    const i18n = getErrorI18n(language);
    return `
/**
 * @fileoverview Middleware de autenticação JWT Bearer.
 */

const jwt = require('jsonwebtoken');
const env = require('../config/env');
  const AppError = require('../utils/AppError');

  /**
   * @param {import('express').NextFunction} next
   * @returns {void}
   */
  function unauthorized(next) {
    return next(new AppError(401, ${JSON.stringify(i18n.unauthorized)}));
  }

  /**
   * @param {string|undefined} authHeader Header Authorization bruto.
   * @returns {string|null}
   */
  function extractToken(authHeader) {
    if (!authHeader) return null;

    const parts = authHeader.split(' ');
    if (parts.length !== 2) return null;

    const [scheme, token] = parts;
    if (!/^Bearer$/i.test(scheme)) return null;
    return token;
  }

  /**
   * @param {string} token JWT recebido.
   * @returns {string}
   */
  function resolveSecret(token) {
    if (Object.keys(env.JWT_KEYS).length === 0) {
      return env.JWT_SECRET;
    }

    const decoded = jwt.decode(token, { complete: true });
    const kid = decoded && decoded.header ? decoded.header.kid : null;

    if (!kid || !env.JWT_KEYS[kid]) {
      throw new AppError(401, ${JSON.stringify(i18n.unauthorized)});
    }

    return env.JWT_KEYS[kid];
  }

  /**
   * @param {Record<string, any>} decoded Claims decodificadas.
   * @returns {void}
   */
  function assertRequiredClaims(decoded) {
    const requiredClaims = ['iss', 'aud', 'sub', 'exp', 'iat'];
    const missing = requiredClaims.filter((claim) => decoded[claim] === undefined || decoded[claim] === null || decoded[claim] === '');

    if (missing.length > 0) {
      throw new AppError(401, ${JSON.stringify(i18n.unauthorized)});
    }
  }

/**
 * Valida token e monta contexto de identidade da requisição.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 * @returns {void}
 */
module.exports = (req, res, next) => {
    if (env.AUTH_DISABLED) {
    // Bypass controlado para ambiente de desenvolvimento/teste.
        req.auth = { sub: 'dev', roles: ['admin'], scope: 'admin' };
        req.userId = 'dev';
        return next();
    }

    const token = extractToken(req.headers.authorization);
    if (!token) return unauthorized(next);

    let secret;
    try {
      secret = resolveSecret(token);
    } catch (error) {
      return unauthorized(next);
    }

    jwt.verify(
      token,
      secret,
      {
        algorithms: env.JWT_ALGORITHMS,
        issuer: env.JWT_ISSUER,
        audience: env.JWT_AUDIENCE,
        maxAge: env.JWT_ACCESS_MAX_AGE,
      },
      (err, decoded) => {
        if (err) return unauthorized(next);

        try {
          assertRequiredClaims(decoded);
        } catch (claimError) {
          return unauthorized(next);
        }

        req.auth = decoded;
        req.userId = decoded.sub || decoded.id;
        return next();
      }
    );
};
`;
  },

  authorizeMiddleware: (language = 'pt') => {
    const i18n = getErrorI18n(language);
    return `
  /**
   * @fileoverview Middleware de autorização por papel e escopo.
   */

  const AppError = require('../utils/AppError');
  const env = require('../config/env');

  /**
   * @param {string|string[]|undefined|null} value Valor bruto de papel/escopo.
   * @returns {string[]}
   */
  function normalizeArray(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value.map((item) => String(item));
    if (typeof value === 'string') {
      return value
        .split(' ')
        .map((item) => item.trim())
        .filter(Boolean);
    }
    return [];
  }

  /**
   * Cria middleware de autorização com política declarativa.
   * @param {{ anyRole?: string[], anyScope?: string[] }} [policy={}]
   * @returns {import('express').RequestHandler}
   */
  module.exports = ({ anyRole = [], anyScope = [] } = {}) => {
    const requiredRoles = new Set(anyRole.map((role) => String(role)));
    const requiredScopes = new Set(anyScope.map((scope) => String(scope)));

    return (req, res, next) => {
      // Em modo sem auth, autorização também é ignorada.
      if (env.AUTH_DISABLED) return next();

      const auth = req.auth || {};
      const userRoles = new Set(normalizeArray(auth.roles || auth.role));
      const userScopes = new Set(normalizeArray(auth.scope || auth.scopes));

      const roleAllowed =
        requiredRoles.size === 0 ||
        Array.from(requiredRoles).some((role) => userRoles.has(role));

      const scopeAllowed =
        requiredScopes.size === 0 ||
        Array.from(requiredScopes).some((scope) => userScopes.has(scope));

      if (!roleAllowed || !scopeAllowed) {
        return next(new AppError(403, ${JSON.stringify(i18n.forbidden)}));
      }

      return next();
    };
  };
  `;
  },

  migrationsSchemaSql: (tables, schema) => {
    const tableNames = Array.isArray(tables) ? tables : [];
    const lines = [
      '-- Generated by generator',
      'CREATE DATABASE IF NOT EXISTS `__DB_NAME__` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;',
      'USE `__DB_NAME__`;',
      '',
      'SET FOREIGN_KEY_CHECKS = 0;',
      '',
    ];

    for (const tableName of tableNames) {
      const tableSchema = schema[tableName] || { columns: [], foreignKeys: [] };
      const columnLines = [];
      const pkColumns = [];
      const uniqueColumns = [];
      const indexedColumns = [];

      for (const col of tableSchema.columns || []) {
        let columnSql = '  `' + col.name + '` ' + col.type;
        columnSql += col.nullable ? ' NULL' : ' NOT NULL';

        if (col.default !== undefined && col.default !== null) {
          const defaultValue = String(col.default);
          if (/^CURRENT_TIMESTAMP(?:\(\))?$/i.test(defaultValue)) {
            columnSql += ' DEFAULT ' + defaultValue;
          } else if (/^(\d+|\d+\.\d+)$/i.test(defaultValue)) {
            columnSql += ' DEFAULT ' + defaultValue;
          } else {
            columnSql += " DEFAULT '" + defaultValue.replace(/'/g, "''") + "'";
          }
        } else if (col.nullable) {
          columnSql += ' DEFAULT NULL';
        }

        if (col.extra) {
          columnSql += ' ' + String(col.extra).toUpperCase();
        }

        columnLines.push(columnSql);
        if (col.key === 'PRI') pkColumns.push(col.name);
        if (col.key === 'UNI') uniqueColumns.push(col.name);
        if (col.key === 'MUL') indexedColumns.push(col.name);
      }

      if (pkColumns.length > 0) {
        columnLines.push(
          '  PRIMARY KEY (' + pkColumns.map((name) => '`' + name + '`').join(', ') + ')',
        );
      }

      for (const colName of uniqueColumns) {
        columnLines.push('  UNIQUE KEY `uk_' + tableName + '_' + colName + '` (`' + colName + '`)');
      }

      for (const colName of indexedColumns) {
        columnLines.push('  KEY `idx_' + tableName + '_' + colName + '` (`' + colName + '`)');
      }

      lines.push('CREATE TABLE IF NOT EXISTS `' + tableName + '` (');
      lines.push(columnLines.join(',\n'));
      lines.push(') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;');
      lines.push('');
    }

    for (const tableName of tableNames) {
      const tableSchema = schema[tableName] || { foreignKeys: [] };
      for (const fk of tableSchema.foreignKeys || []) {
        const fkName = 'fk_' + tableName + '_' + fk.column;
        lines.push(
          'ALTER TABLE `' +
            tableName +
            '` ADD CONSTRAINT `' +
            fkName +
            '` FOREIGN KEY (`' +
            fk.column +
            '`) REFERENCES `' +
            fk.referencedTable +
            '` (`' +
            fk.referencedColumn +
            '`) ON UPDATE CASCADE ON DELETE RESTRICT;',
        );
      }
      if ((tableSchema.foreignKeys || []).length > 0) {
        lines.push('');
      }
    }

    lines.push('SET FOREIGN_KEY_CHECKS = 1;');
    lines.push('');
    return lines.join('\n');
  },

  migrationsSeedSql: (tables, schema, seedData = {}) => {
    const tableNames = Array.isArray(tables) ? tables : [];
    const lines = [
      '-- Generated by generator',
      'USE `__DB_NAME__`;',
      '',
      'SET FOREIGN_KEY_CHECKS = 0;',
      '',
    ];

    let hasInserts = false;

    for (const tableName of tableNames) {
      const rows = Array.isArray(seedData[tableName]) ? seedData[tableName] : [];
      const tableColumns = (schema[tableName]?.columns || []).map((col) => col.name);
      if (rows.length === 0 || tableColumns.length === 0) {
        continue;
      }

      const columnsSql = tableColumns.map((col) => '`' + col + '`').join(', ');
      const valuesSql = rows
        .map((row) => {
          const rowValues = tableColumns.map((colName) => {
            const value = row[colName];
            if (value === null || value === undefined) return 'NULL';
            if (typeof value === 'number') return String(value);
            if (typeof value === 'boolean') return value ? '1' : '0';
            if (value instanceof Date)
              return "'" + value.toISOString().slice(0, 19).replace('T', ' ') + "'";
            if (typeof value === 'object') {
              return "'" + JSON.stringify(value).replace(/'/g, "''") + "'";
            }
            return "'" + String(value).replace(/\\/g, '\\\\').replace(/'/g, "''") + "'";
          });
          return '(' + rowValues.join(', ') + ')';
        })
        .join(',\n');

      lines.push('INSERT INTO `' + tableName + '` (' + columnsSql + ') VALUES');
      lines.push(valuesSql + ';');
      lines.push('');
      hasInserts = true;
    }

    if (!hasInserts) {
      lines.push('-- No seed data generated.');
      lines.push('');
    }

    lines.push('SET FOREIGN_KEY_CHECKS = 1;');
    lines.push('');
    return lines.join('\n');
  },

  migrationRunner: () => `
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config();

function resolveDbConfig() {
  return {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    port: Number(process.env.DB_PORT || 3306),
  };
}

function splitSqlStatements(sql) {
  return sql
    .split(/;\\s*\\n/g)
    .map((statement) => statement.trim())
    .filter(Boolean);
}

function isIgnorableMigrationError(error, statement) {
  if (!error) return false;

  // Reexecução segura: ignora apenas conflitos de objetos já existentes.
  const ignorableCodes = new Set([
    'ER_TABLE_EXISTS_ERROR',
    'ER_DUP_KEYNAME',
    'ER_FK_DUP_NAME',
    'ER_CANT_CREATE_TABLE',
  ]);

  if (ignorableCodes.has(error.code)) return true;

  const msg = String(error.message || '').toLowerCase();
  if (statement.startsWith('ALTER TABLE') && msg.includes('duplicate foreign key constraint name')) {
    return true;
  }
  if (statement.startsWith('ALTER TABLE') && msg.includes('duplicate key name')) {
    return true;
  }

  return false;
}

async function runSqlFile(connection, filePath, dbName, { continueOnConflict = false } = {}) {
  const rawSql = fs.readFileSync(filePath, 'utf8');
  const sql = rawSql.replace(/__DB_NAME__/g, dbName);
  if (!sql.trim()) return;

  const statements = splitSqlStatements(sql);
  for (const statement of statements) {
    try {
      await connection.query(statement);
    } catch (error) {
      if (continueOnConflict && isIgnorableMigrationError(error, statement)) {
        console.warn('Skipping already-applied statement:', error.code || error.message);
        continue;
      }
      throw error;
    }
  }
}

function parseArgs() {
  const args = process.argv.slice(2);
  const withSeed = args.includes('--with-seed');
  const dryRun = args.includes('--dry-run');
  const seedFilter = args.find((arg) => !arg.startsWith('--')) || null;
  return { withSeed, dryRun, seedFilter };
}

function listSeedFiles(migrationDir) {
  if (!fs.existsSync(migrationDir)) return [];

  return fs
    .readdirSync(migrationDir)
    .filter((file) => file.toLowerCase().endsWith('.sql'))
    .filter((file) => file !== '001_schema.sql')
    .filter((file) => file.toLowerCase().includes('seed'))
    .sort();
}

function printDryRun(schemaFile, seedFiles, withSeed, seedFilter) {
  console.log('DRY RUN: no SQL was executed.');
  console.log('Schema file:', schemaFile);

  if (!withSeed) {
    console.log('Seed execution: disabled');
    return;
  }

  if (seedFilter) {
    console.log('Seed filter:', seedFilter);
  }

  if (seedFiles.length === 0) {
    console.log('No seed files selected.');
    return;
  }

  console.log('Seed files to execute:');
  for (const file of seedFiles) {
    console.log('-', file);
  }
}

async function main() {
  const { withSeed, dryRun, seedFilter } = parseArgs();
  const dbName = process.env.DB_NAME;
  if (!dbName) {
    throw new Error('DB_NAME is required in .env');
  }

  const migrationDir = path.join(__dirname, '../../migrations');
  const schemaFile = path.join(migrationDir, '001_schema.sql');
  const allSeedFiles = listSeedFiles(migrationDir);
  const selectedSeedFiles = seedFilter
    ? allSeedFiles.filter((file) => file.includes(seedFilter))
    : allSeedFiles;

  if (dryRun) {
    printDryRun(schemaFile, selectedSeedFiles, withSeed, seedFilter);
    return;
  }

  const connection = await mysql.createConnection(resolveDbConfig());
  try {
    console.log('Applying schema migration...');
    await runSqlFile(connection, schemaFile, dbName, { continueOnConflict: true });

    if (withSeed) {
      if (selectedSeedFiles.length > 0) {
        console.log('Applying seed migration...');
        for (const seedFileName of selectedSeedFiles) {
          const seedFile = path.join(migrationDir, seedFileName);
          await runSqlFile(connection, seedFile, dbName);
        }
      } else {
        console.log('No seed files found for execution, skipping.');
      }
    }

    console.log(withSeed ? 'Migration finished (schema + seed).' : 'Migration finished (schema only).');
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
`,

  createSeedScript: () => `
const fs = require('fs');
const path = require('path');

function slugify(value) {
  return String(value || 'custom')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'custom';
}

function nextMigrationPrefix(migrationDir) {
  if (!fs.existsSync(migrationDir)) {
    return '003';
  }

  const files = fs.readdirSync(migrationDir).filter((file) => file.endsWith('.sql'));
  let maxPrefix = 0;

  for (const file of files) {
    const match = file.match(/^(\\d+)_/);
    if (!match) continue;
    const value = Number(match[1]);
    if (Number.isFinite(value) && value > maxPrefix) {
      maxPrefix = value;
    }
  }

  return String(maxPrefix + 1).padStart(3, '0');
}

function buildSeedTemplate(name) {
  return [
    '-- Generated seed file',
    '-- Update statements below as needed',
    'USE \`__DB_NAME__\`;',
    '',
    '-- Example:',
    '-- INSERT INTO your_table (column_a, column_b) VALUES (\\'value_a\\', \\'value_b\\');',
    '',
  ].join('\\n');
}

function main() {
  const seedNameArg = process.argv.slice(2).find((arg) => !arg.startsWith('--')) || 'custom';
  const seedName = slugify(seedNameArg);
  const migrationDir = path.join(__dirname, '../../migrations');
  fs.mkdirSync(migrationDir, { recursive: true });

  const prefix = nextMigrationPrefix(migrationDir);
  const fileName = prefix + '_' + seedName + '_seed.sql';
  const targetFile = path.join(migrationDir, fileName);

  if (fs.existsSync(targetFile)) {
    throw new Error('Seed file already exists: ' + fileName);
  }

  fs.writeFileSync(targetFile, buildSeedTemplate(seedName), 'utf8');
  console.log('Seed file created:', fileName);
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
`,

  prettierConfigFile: () => `/** @type {import('prettier').Config} */
module.exports = {
  semi: true,
  singleQuote: true,
  trailingComma: 'all',
  printWidth: 100,
  tabWidth: 2,
  bracketSpacing: true,
  arrowParens: 'always',
  endOfLine: 'lf',
};
`,

  prettierIgnoreFile: () => `node_modules
package-lock.json
`,

  gitignoreFile: () => `node_modules/
.env
dist/
*.log
npm-debug.log*
`,

  envfile: () => `PORT=${process.env.PORT || 3000}
NODE_ENV=development



DB_HOST=${process.env.DB_HOST || 'localhost'}
DB_USER=${process.env.DB_USER || 'root'}
DB_PASSWORD=${process.env.DB_PASSWORD || ''}
DB_NAME=${process.env.DB_NAME || 'my_database'}
DB_PORT=${process.env.DB_PORT || 3306}

# Optional multi-database mode (JSON object by connection key)
# Example: {"default":{"host":"localhost","user":"root","password":"","database":"db1","port":3306},"crm":{"host":"localhost","user":"root","password":"","database":"db2","port":3306}}
DB_CONNECTIONS=
DEFAULT_DB_KEY=default

# Disable auth for all routes (non-production only; blocked in production)
AUTH_DISABLED=true

JWT_SECRET=replace_with_minimum_32_characters_secret
JWT_ISSUER=generated-api
JWT_AUDIENCE=generated-api-clients
JWT_ALGORITHMS=HS256
JWT_ACCESS_MAX_AGE=15m

# Optional key rotation format: kid:secret,kid2:secret2
JWT_KEYS=
JWT_ACTIVE_KID=

DB_CONNECTION_LIMIT=10
DB_QUEUE_LIMIT=0
DB_CONNECT_TIMEOUT_MS=10000
DB_QUERY_TIMEOUT_MS=10000
API_MAX_LIMIT=100
API_JSON_LIMIT=256kb
API_MAX_QUERY_PARAMS=20
API_MAX_URL_LENGTH=2048

RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=120
RATE_LIMIT_SENSITIVE_MAX=40
SLOW_DOWN_WINDOW_MS=60000
SLOW_DOWN_DELAY_AFTER=40
SLOW_DOWN_DELAY_MS=200

# CORS allowlist (comma separated)
CORS_ALLOWED_ORIGINS=http://localhost:3000

# Swagger defaults are secure for production
SWAGGER_ENABLED=true
SWAGGER_REQUIRE_ADMIN=true
SWAGGER_ALLOWED_IPS=
`,
};
