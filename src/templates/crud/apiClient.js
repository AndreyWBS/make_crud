const { pascalCase } = require("../../utils/stringUtils");

module.exports = {
  apiClient: (tableName, schema) => {
    const className = pascalCase(tableName);
    const pk = schema.columns.find((c) => c.key === "PRI")?.name || "id";

    const columnMetadata = JSON.stringify(
      schema.columns.reduce((acc, col) => {
        acc[col.name] = { type: col.type, isPk: col.name === pk };
        return acc;
      }, {}),
      null,
      4,
    );

    return `
/**
 * @fileoverview Cliente HTTP para o recurso ${tableName}.
 * @description Encapsula chamadas CRUD e buscas por coluna.
 */

/**
 * @class ${className}Client
 * @classdesc Cliente de integração para endpoints /api/${tableName}.
 */
class ${className}Client {
    /**
     * @param {{ baseUrl?: string, token?: string|null }} [config={}]
     */
    constructor(config = {}) {
        this.baseUrl = config.baseUrl || '/api/${tableName}';
        this.token = config.token || null;
        this.columns = ${columnMetadata};
    }

    /**
     * Monta headers padrão da requisição.
     * @returns {Record<string, string>}
     */
    _getHeaders() {
        const headers = { 'Content-Type': 'application/json' };
        if (this.token) headers['Authorization'] = \`Bearer \${this.token}\`;
        return headers;
    }

    /**
     * Executor central de requisições HTTP.
     * @param {string} endpoint Caminho relativo ou URL absoluta.
     * @param {RequestInit} [options={}] Opções do fetch.
     * @returns {Promise<any>}
     * @throws {{status:number}} Lança objeto de erro padronizado quando !ok.
     */
    async _request(endpoint, options = {}) {
        const url = endpoint.startsWith('http') ? endpoint : \`\${this.baseUrl}\${endpoint}\`;
        const response = await fetch(url, {
            ...options,
            headers: { ...this._getHeaders(), ...options.headers }
        });

        if (response.status === 204) return null;

        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw { status: response.status, ...data };

        return data;
    }

    // --- Métodos CRUD Padrão ---

    /**
     * Lista registros com filtros e paginação.
     * @param {Record<string, any>} [filters={}] Filtros opcionais.
     * @param {number} [page=1] Página atual.
     * @param {number} [limit=10] Itens por página.
     * @returns {Promise<any>}
     */
    async getAll(filters = {}, page = 1, limit = 10) {
        const params = new URLSearchParams({ page, limit, ...filters });
        return this._request(\`?\${params}\`);
    }

    /**
     * Busca por id.
     * @param {string|number} id Identificador.
     * @returns {Promise<any>}
     */
    async getById(id) {
        return this._request(\`/\${id}\`);
    }

    /**
     * Cria registro.
     * @param {Record<string, any>} data Payload.
     * @returns {Promise<any>}
     */
    async create(data) {
        return this._request('', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    }

    /**
     * Cria registros em lote.
     * @param {Array<Record<string, any>>} dataArray Payload de lote.
     * @returns {Promise<any>}
     */
    async createBulk(dataArray) {
        return this._request('/bulk', {
            method: 'POST',
            body: JSON.stringify(dataArray)
        });
    }

    /**
     * Atualiza registro por id.
     * @param {string|number} id Identificador.
     * @param {Record<string, any>} data Payload.
     * @returns {Promise<any>}
     */
    async update(id, data) {
        return this._request(\`/\${id}\`, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
    }

    /**
     * Remove registro por id.
     * @param {string|number} id Identificador.
     * @returns {Promise<any>}
     */
    async delete(id) {
        return this._request(\`/\${id}\`, { method: 'DELETE' });
    }

    // --- Métodos de Busca Dinâmicos por Coluna ---

    ${schema.columns
      .map((col) => {
        const methodName = `findBy${pascalCase(col.name)}`;
        const isNumeric =
          col.type.toLowerCase().includes("int") ||
          col.type.toLowerCase().includes("decimal");

        return `
    /**
     * Busca específica pela coluna ${col.name} (${col.type})
     */
    async ${methodName}(value) {
        if (value === undefined || value === null) throw new Error('Valor para ${col.name} é obrigatório');
        ${isNumeric ? `if (isNaN(value)) console.warn('Aviso: ${col.name} espera um valor numérico.');` : ""}
        return this._request(\`/search/${col.name}/\${encodeURIComponent(value)}\`);
    }`;
      })
      .join("\n")}

    /**
     * Valida se os campos existem no metadata da entidade.
     * @param {Record<string, any>} data Payload a validar.
     * @returns {{isValid:boolean, errors:string[]}}
     */
    validate(data) {
        const errors = [];
        Object.keys(data).forEach(key => {
            if (!this.columns[key]) errors.push(\`Campo \${key} não existe na tabela ${tableName}\`);
        });
        return { isValid: errors.length === 0, errors };
    }
}

export default ${className}Client;
`;
  },
};
