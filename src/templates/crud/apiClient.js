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

class ${className}Client {
    constructor(config = {}) {
        this.baseUrl = config.baseUrl || '/api/${tableName}';
        this.token = config.token || null;
        this.columns = ${columnMetadata};
    }

    /**
     * Configuração de Headers com Memoização Simples
     */
    _getHeaders() {
        const headers = { 'Content-Type': 'application/json' };
        if (this.token) headers['Authorization'] = \`Bearer \${this.token}\`;
        return headers;
    }

    /**
     * Centralizador de requisições para reduzir repetição de código
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

    async getAll(filters = {}, page = 1, limit = 10) {
        const params = new URLSearchParams({ page, limit, ...filters });
        return this._request(\`?\${params}\`);
    }

    async getById(id) {
        return this._request(\`/\${id}\`);
    }

    async create(data) {
        return this._request('', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    }

    async createBulk(dataArray) {
        return this._request('/bulk', {
            method: 'POST',
            body: JSON.stringify(dataArray)
        });
    }

    async update(id, data) {
        return this._request(\`/\${id}\`, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
    }

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
     * Helper para verificar se um objeto é válido para esta entidade
     * antes de enviar ao servidor
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
