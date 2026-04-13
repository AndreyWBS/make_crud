'use strict';

const fs = require('fs-extra');
const path = require('path');

const DEFAULT_DATABASE_KEY = 'default';
const DEFAULT_DATABASE_CONFIG = {
  host: 'localhost',
  user: 'root',
  password: '',
  database: '',
  port: 3306,
};

function withDefinedValues(values = {}) {
  return Object.fromEntries(
    Object.entries(values).filter(
      ([, value]) => value !== undefined && value !== null && value !== '',
    ),
  );
}

class DatabaseConfigBuilder {
  constructor(configPath) {
    this.configPath = configPath;
  }

  normalizeEntry(config = {}) {
    return {
      ...DEFAULT_DATABASE_CONFIG,
      ...config,
      port: Number(config.port || DEFAULT_DATABASE_CONFIG.port),
    };
  }

  normalize(config = {}) {
    if (config.databases && typeof config.databases === 'object') {
      const databases = Object.fromEntries(
        Object.entries(config.databases).map(([databaseKey, databaseConfig]) => [
          databaseKey,
          this.normalizeEntry(databaseConfig),
        ]),
      );

      const databaseKeys = Object.keys(databases);
      const defaultDatabase =
        config.defaultDatabase && databases[config.defaultDatabase]
          ? config.defaultDatabase
          : databaseKeys[0] || DEFAULT_DATABASE_KEY;

      if (databaseKeys.length === 0) {
        databases[defaultDatabase] = this.normalizeEntry();
      }

      return {
        defaultDatabase,
        databases,
      };
    }

    return {
      defaultDatabase: DEFAULT_DATABASE_KEY,
      databases: {
        [DEFAULT_DATABASE_KEY]: this.normalizeEntry(config),
      },
    };
  }

  buildFromEnv(env = process.env) {
    const databaseKey = env.DB_CONFIG_NAME || env.DB_ALIAS || env.DB_NAME || DEFAULT_DATABASE_KEY;
    const envEntry = withDefinedValues({
      host: env.DB_HOST,
      user: env.DB_USER,
      password: env.DB_PASSWORD,
      database: env.DB_NAME,
      port: env.DB_PORT,
    });

    const databases = Object.keys(envEntry).length > 0 ? { [databaseKey]: envEntry } : {};

    return {
      defaultDatabase: databaseKey,
      databases,
    };
  }

  async load() {
    if (await fs.pathExists(this.configPath)) {
      const config = await fs.readJson(this.configPath);
      return this.normalize(config);
    }

    return null;
  }

  async save(config) {
    await fs.ensureDir(path.dirname(this.configPath));
    await fs.writeJson(this.configPath, this.normalize(config), { spaces: 2 });
  }
}

module.exports = DatabaseConfigBuilder;
