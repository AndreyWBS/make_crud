'use strict';

const fs = require('fs-extra');
const path = require('path');

const DEFAULT_ROUTES = {
  getAll: true,
  getById: true,
  getByIdWithRelations: true,
  create: true,
  createBulk: true,
  update: true,
  updateBulk: true,
  delete: true,
  deleteBulk: true,
  search: true,
};

const DEFAULT_GLOBAL = {
  swagger: true,
  docs_md: true,
  docs_html: true,
  docs_technical: true,
  tests: true,
  prettier: true,
  migrations: {
    enabled: true,
    includeSourceData: false,
  },
};

/**
 * Constrói e persiste o arquivo de configuração api.config.json.
 *
 * Fluxo:
 * - `buildDefault(schema)` → cria config do zero com todas as tabelas habilitadas.
 * - `merge(existing, schema)` → preserva preferências existentes e adiciona novas tabelas.
 * - `load()` → lê o config do disco (ou retorna null se não existir).
 * - `save(config)` → grava config em disco com indentação de 2 espaços.
 */
class ConfigBuilder {
  /**
   * @param {string} configPath Caminho absoluto para o arquivo api.config.json.
   */
  constructor(configPath) {
    this.configPath = configPath;
  }

  /**
   * Cria config padrão a partir do schema do banco.
   * Todas as tabelas habilitadas, todas as rotas habilitadas.
   * @param {Record<string, any>} schema Schema retornado pelo Introspector.
   * @returns {object}
   */
  buildDefault(schema) {
    const tables = {};
    for (const tableName of Object.keys(schema).sort()) {
      tables[tableName] = {
        enabled: true,
        routes: { ...DEFAULT_ROUTES },
        customRoutes: [],
      };
    }
    return {
      global: { ...DEFAULT_GLOBAL },
      tables,
    };
  }

  /**
   * Mergeia config existente com schema atualizado do banco.
   * - Adiciona tabelas novas com todos os defaults habilitados.
   * - Preserva flags de tabelas e rotas já configuradas.
   * - Preenche flags globais ausentes com defaults.
   * @param {object} existing Config lido do disco.
   * @param {Record<string, any>} schema Schema do banco.
   * @returns {object}
   */
  merge(existing, schema) {
    const existingMigrations = existing.global?.migrations;
    const normalizedMigrations =
      typeof existingMigrations === 'object' && existingMigrations !== null
        ? {
            enabled: existingMigrations.enabled !== false,
            includeSourceData: existingMigrations.includeSourceData === true,
          }
        : existingMigrations === false
          ? { enabled: false, includeSourceData: false }
          : { ...DEFAULT_GLOBAL.migrations };

    const merged = {
      global: {
        ...DEFAULT_GLOBAL,
        ...(existing.global || {}),
        migrations: normalizedMigrations,
      },
      tables: {},
    };

    for (const tableName of Object.keys(schema).sort()) {
      const existingTable = (existing.tables || {})[tableName];
      if (existingTable) {
        merged.tables[tableName] = {
          enabled: existingTable.enabled !== false,
          routes: { ...DEFAULT_ROUTES, ...(existingTable.routes || {}) },
          customRoutes: Array.isArray(existingTable.customRoutes) ? existingTable.customRoutes : [],
        };
      } else {
        merged.tables[tableName] = {
          enabled: true,
          routes: { ...DEFAULT_ROUTES },
          customRoutes: [],
        };
      }
    }

    return merged;
  }

  /**
   * Carrega config do disco.
   * @returns {Promise<object|null>} Config ou null se não existir.
   */
  async load() {
    if (await fs.pathExists(this.configPath)) {
      return fs.readJson(this.configPath);
    }
    return null;
  }

  /**
   * Grava config em disco.
   * @param {object} config Config a persistir.
   * @returns {Promise<void>}
   */
  async save(config) {
    await fs.ensureDir(path.dirname(this.configPath));
    await fs.writeJson(this.configPath, config, { spaces: 2 });
  }
}

module.exports = ConfigBuilder;
