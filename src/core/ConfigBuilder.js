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
  language: 'pt',
  swagger: true,
  docs_md: false,
  docs_html: false,
  docs_technical: true,
  tests: true,
  prettier: true,
  separateApis: false,
  databaseConfig: {
    preferEnvCredentials: true,
  },
  migrations: {
    enabled: true,
    includeSourceData: false,
  },
};

const DEFAULT_DATABASE_OPTIONS = {
  enabled: true,
  outputDir: null,
};

function normalizeLanguage(value, fallback = 'pt') {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();

  if (!normalized) {
    return fallback;
  }

  if (normalized === 'pt' || normalized === 'pt-br' || normalized === 'pt_br') {
    return 'pt';
  }

  if (normalized === 'en' || normalized === 'en-us' || normalized === 'en_us') {
    return 'en';
  }

  return fallback;
}

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
  normalizeTableConfig(tableConfig = {}) {
    return {
      enabled: tableConfig.enabled !== false,
      routes: { ...DEFAULT_ROUTES, ...(tableConfig.routes || {}) },
      customRoutes: Array.isArray(tableConfig.customRoutes) ? tableConfig.customRoutes : [],
    };
  }

  buildTables(schema = {}) {
    const tables = {};
    for (const tableName of Object.keys(schema).sort()) {
      tables[tableName] = this.normalizeTableConfig();
    }
    return tables;
  }

  normalize(existing = {}) {
    const databaseConfig =
      typeof existing.global?.databaseConfig === 'object' &&
      existing.global?.databaseConfig !== null
        ? {
            preferEnvCredentials: existing.global.databaseConfig.preferEnvCredentials !== false,
          }
        : existing.global?.databaseConfig === false
          ? { preferEnvCredentials: false }
          : { ...DEFAULT_GLOBAL.databaseConfig };

    const global = {
      ...DEFAULT_GLOBAL,
      ...(existing.global || {}),
      language: normalizeLanguage(existing.global?.language, DEFAULT_GLOBAL.language),
      databaseConfig,
      migrations:
        typeof existing.global?.migrations === 'object' && existing.global?.migrations !== null
          ? {
              enabled: existing.global.migrations.enabled !== false,
              includeSourceData: existing.global.migrations.includeSourceData === true,
            }
          : existing.global?.migrations === false
            ? { enabled: false, includeSourceData: false }
            : { ...DEFAULT_GLOBAL.migrations },
    };

    if (existing.databases && typeof existing.databases === 'object') {
      const databases = Object.fromEntries(
        Object.entries(existing.databases).map(([databaseKey, databaseConfig]) => [
          databaseKey,
          {
            ...DEFAULT_DATABASE_OPTIONS,
            ...(databaseConfig || {}),
            enabled: databaseConfig?.enabled !== false,
            outputDir:
              typeof databaseConfig?.outputDir === 'string' && databaseConfig.outputDir.trim()
                ? databaseConfig.outputDir.trim()
                : null,
            tables: Object.fromEntries(
              Object.entries(databaseConfig?.tables || {}).map(([tableName, tableConfig]) => [
                tableName,
                this.normalizeTableConfig(tableConfig),
              ]),
            ),
          },
        ]),
      );

      return {
        global,
        defaultDatabase: existing.defaultDatabase || Object.keys(databases)[0] || 'default',
        databases,
      };
    }

    return {
      global,
      defaultDatabase: existing.defaultDatabase || 'default',
      databases: {
        default: {
          ...DEFAULT_DATABASE_OPTIONS,
          tables: Object.fromEntries(
            Object.entries(existing.tables || {}).map(([tableName, tableConfig]) => [
              tableName,
              this.normalizeTableConfig(tableConfig),
            ]),
          ),
        },
      },
    };
  }

  buildDefault(schema, databaseKey = 'default') {
    return this.buildDefaultFromSchemas({ [databaseKey]: schema }, databaseKey);
  }

  buildDefaultFromSchemas(schemasByDatabase = {}, defaultDatabase = 'default') {
    const databases = Object.fromEntries(
      Object.entries(schemasByDatabase).map(([databaseKey, schema]) => [
        databaseKey,
        {
          ...DEFAULT_DATABASE_OPTIONS,
          tables: this.buildTables(schema),
        },
      ]),
    );

    return {
      global: { ...DEFAULT_GLOBAL },
      defaultDatabase,
      databases,
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
  merge(existing, schema, defaultDatabase = 'default') {
    if (!schema || schema.columns) {
      return this.mergeSchemas(existing, { [defaultDatabase]: schema }, defaultDatabase);
    }

    return this.mergeSchemas(existing, schema, defaultDatabase);
  }

  mergeSchemas(existing, schemasByDatabase = {}, defaultDatabase = 'default') {
    const normalizedExisting = this.normalize(existing);
    const merged = {
      global: normalizedExisting.global,
      defaultDatabase: normalizedExisting.defaultDatabase || defaultDatabase,
      databases: {},
    };

    const databaseKeys = new Set([
      ...Object.keys(normalizedExisting.databases || {}),
      ...Object.keys(schemasByDatabase || {}),
    ]);

    for (const databaseKey of Array.from(databaseKeys).sort()) {
      const existingDatabase = normalizedExisting.databases?.[databaseKey] || null;
      const schema = schemasByDatabase?.[databaseKey] || null;

      if (!schema && existingDatabase) {
        merged.databases[databaseKey] = existingDatabase;
        continue;
      }

      const existingTables = existingDatabase?.tables || {};
      const tables = {};

      for (const tableName of Object.keys(schema || {}).sort()) {
        tables[tableName] = this.normalizeTableConfig(existingTables[tableName]);
      }

      merged.databases[databaseKey] = {
        ...DEFAULT_DATABASE_OPTIONS,
        ...(existingDatabase || {}),
        enabled: existingDatabase?.enabled !== false,
        outputDir:
          typeof existingDatabase?.outputDir === 'string' && existingDatabase.outputDir.trim()
            ? existingDatabase.outputDir.trim()
            : null,
        tables,
      };
    }

    if (!merged.databases[merged.defaultDatabase]) {
      merged.defaultDatabase = Object.keys(merged.databases)[0] || defaultDatabase;
    }

    return merged;
  }

  /**
   * Carrega config do disco.
   * @returns {Promise<object|null>} Config ou null se não existir.
   */
  async load() {
    if (await fs.pathExists(this.configPath)) {
      const config = await fs.readJson(this.configPath);
      return this.normalize(config);
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
    await fs.writeJson(this.configPath, this.normalize(config), { spaces: 2 });
  }
}

module.exports = ConfigBuilder;
