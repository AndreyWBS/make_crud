const path = require('path');
const fs = require('fs-extra');
const { execSync } = require('child_process');
const dotenv = require('dotenv');

const Introspector = require('./src/core/Introspector');
const GeneratorEngine = require('./src/core/GeneratorEngine');
const LayerGenerator = require('./src/generators/LayerGenerator');
const StaticFileGenerator = require('./src/generators/StaticFileGenerator');
const ConfigBuilder = require('./src/core/ConfigBuilder');
const DatabaseConfigBuilder = require('./src/core/DatabaseConfigBuilder');

const crudTemplates = require('./src/templates/crudTemplates');
const infraTemplates = require('./src/templates/infraTemplates');
const validatorTemplates = require('./src/templates/validatorTemplates');
const testsTemplates = require('./src/templates/testsTemplates');

function parseBoolean(value, fallback = true) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;

  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  return fallback;
}

function getArgValue(args, longFlag, shortFlag) {
  const longIndex = args.indexOf(longFlag);
  if (longIndex !== -1 && args[longIndex + 1]) {
    return args[longIndex + 1];
  }

  const shortIndex = args.indexOf(shortFlag);
  if (shortIndex !== -1 && args[shortIndex + 1]) {
    return args[shortIndex + 1];
  }

  return null;
}

function resolveOptions(options = {}) {
  const cliArgs = Array.isArray(options.cliArgs) ? options.cliArgs : [];
  const inputDirArg = getArgValue(cliArgs, '--input', '-i') || getArgValue(cliArgs, '--dir', '-d');
  const outputDirArg = getArgValue(cliArgs, '--output', '-o');
  const configPathArg = getArgValue(cliArgs, '--config', '-c');
  const dbConfigPathArg = getArgValue(cliArgs, '--db-config', '-b');
  const envPathArg = getArgValue(cliArgs, '--env', '-e');

  const inputDir = path.resolve(options.inputDir || inputDirArg || process.cwd());
  const outputDir = path.resolve(options.outputDir || outputDirArg || path.join(inputDir, 'dist'));
  const configPath = path.resolve(
    options.configPath || configPathArg || path.join(inputDir, 'api.config.json'),
  );
  const dbConfigPath = path.resolve(
    options.dbConfigPath || dbConfigPathArg || path.join(inputDir, 'db.config.json'),
  );
  const envPath = path.resolve(options.envPath || envPathArg || path.join(inputDir, '.env'));

  return {
    cliArgs,
    inputDir,
    outputDir,
    configPath,
    dbConfigPath,
    envPath,
  };
}

function ensureDatabaseName(dbConfig, dbConfigPath) {
  if (!dbConfig.database) {
    throw new Error(
      `Database name not found. Configure DB_NAME in the .env or edit ${dbConfigPath}.`,
    );
  }
}

function mergeDatabaseConfigBundle(existingConfig, envConfig, preferEnvCredentials = true) {
  const databaseKeys = new Set([
    ...Object.keys(existingConfig?.databases || {}),
    ...Object.keys(envConfig?.databases || {}),
  ]);

  const databases = {};
  for (const databaseKey of databaseKeys) {
    const existingDatabase = existingConfig?.databases?.[databaseKey] || {};
    const envDatabase = envConfig?.databases?.[databaseKey] || {};

    databases[databaseKey] = preferEnvCredentials
      ? {
          ...existingDatabase,
          ...envDatabase,
        }
      : {
          ...envDatabase,
          ...existingDatabase,
        };
  }

  return {
    defaultDatabase: preferEnvCredentials
      ? envConfig?.defaultDatabase || existingConfig?.defaultDatabase || 'default'
      : existingConfig?.defaultDatabase || envConfig?.defaultDatabase || 'default',
    databases,
  };
}

async function introspectSchemas(databases, dbConfigPath) {
  const schemasByDatabase = {};

  for (const [databaseKey, databaseConfig] of Object.entries(databases)) {
    ensureDatabaseName(databaseConfig, `${dbConfigPath} (${databaseKey})`);
    const introspector = new Introspector(databaseConfig);
    schemasByDatabase[databaseKey] = await introspector.getSchema();
  }

  return schemasByDatabase;
}

function resolveDatabaseOutputDir(
  baseOutputDir,
  databaseKey,
  databaseConfig,
  enabledDatabaseCount,
) {
  if (databaseConfig.outputDir) {
    return path.join(baseOutputDir, databaseConfig.outputDir);
  }

  if (enabledDatabaseCount > 1) {
    return path.join(baseOutputDir, databaseKey);
  }

  return baseOutputDir;
}

function addLayerGenerators(engine, outputDir, tablesConfig) {
  engine
    .addGenerator(new LayerGenerator(outputDir, 'models', crudTemplates.model, 'js', tablesConfig))
    .addGenerator(
      new LayerGenerator(outputDir, 'repositories', crudTemplates.repository, 'js', tablesConfig),
    )
    .addGenerator(
      new LayerGenerator(outputDir, 'services', crudTemplates.service, 'js', tablesConfig),
    )
    .addGenerator(
      new LayerGenerator(outputDir, 'controllers', crudTemplates.controller, 'js', tablesConfig),
    )
    .addGenerator(
      new LayerGenerator(
        outputDir,
        'middlewares/validators',
        validatorTemplates.validator,
        'js',
        tablesConfig,
      ),
    )
    .addGenerator(new LayerGenerator(outputDir, 'routes', crudTemplates.routes, 'js', tablesConfig))
    .addGenerator(
      new LayerGenerator(
        path.join(outputDir, 'api-client'),
        'apiClient',
        crudTemplates.apiClient,
        'js',
        tablesConfig,
      ),
    );
}

function addStaticGenerators(engine, outputDir, enabledTables) {
  engine
    .addGenerator(
      new StaticFileGenerator(outputDir, 'src/config/database.js', infraTemplates.database),
    )
    .addGenerator(new StaticFileGenerator(outputDir, 'src/config/env.js', infraTemplates.env))
    .addGenerator(
      new StaticFileGenerator(
        outputDir,
        'src/middlewares/authMiddleware.js',
        infraTemplates.authMiddleware,
      ),
    )
    .addGenerator(
      new StaticFileGenerator(
        outputDir,
        'src/middlewares/authorizeMiddleware.js',
        infraTemplates.authorizeMiddleware,
      ),
    )
    .addGenerator(
      new StaticFileGenerator(
        outputDir,
        'src/middlewares/requestContextMiddleware.js',
        infraTemplates.requestContextMiddleware,
      ),
    )
    .addGenerator(
      new StaticFileGenerator(
        outputDir,
        'src/middlewares/requestLoggerMiddleware.js',
        infraTemplates.requestLoggerMiddleware,
      ),
    )
    .addGenerator(
      new StaticFileGenerator(
        outputDir,
        'src/middlewares/errorMiddleware.js',
        infraTemplates.errorMiddleware,
      ),
    )
    .addGenerator(
      new StaticFileGenerator(outputDir, 'src/utils/AppError.js', infraTemplates.appError),
    )
    .addGenerator(new StaticFileGenerator(outputDir, 'src/utils/logger.js', infraTemplates.logger))
    .addGenerator(
      new StaticFileGenerator(outputDir, 'src/utils/pagination.js', infraTemplates.pagination),
    )
    .addGenerator(
      new StaticFileGenerator(outputDir, 'src/app.js', infraTemplates.app, true, enabledTables),
    )
    .addGenerator(new StaticFileGenerator(outputDir, 'src/server.js', infraTemplates.server))
    .addGenerator(new StaticFileGenerator(outputDir, 'package.json', infraTemplates.packageJson))
    .addGenerator(new StaticFileGenerator(outputDir, '.env', infraTemplates.envfile))
    .addGenerator(new StaticFileGenerator(outputDir, '.gitignore', infraTemplates.gitignoreFile));
}

function addOptionalGenerators(
  engine,
  outputDir,
  tablesConfig,
  globalConfig,
  enabledTables,
  seedSnapshot,
) {
  const g = (key) => globalConfig[key] !== false;

  if (g('docs_md')) {
    engine.addGenerator(
      new LayerGenerator(
        outputDir,
        'docs/rotas_md',
        crudTemplates.documentation,
        'md',
        tablesConfig,
      ),
    );
  }

  if (g('docs_html')) {
    engine.addGenerator(
      new LayerGenerator(
        outputDir,
        'docs/html',
        crudTemplates.documentationHtml,
        'html',
        tablesConfig,
      ),
    );
  }

  if (g('tests')) {
    engine
      .addGenerator(
        new LayerGenerator(
          outputDir,
          'tests/integration',
          testsTemplates.resourceCrudIntegration,
          'test.js',
          tablesConfig,
        ),
      )
      .addGenerator(new StaticFileGenerator(outputDir, 'jest.config.js', testsTemplates.jestConfig))
      .addGenerator(
        new StaticFileGenerator(outputDir, 'tests/jest.setup.js', testsTemplates.jestSetup),
      )
      .addGenerator(
        new StaticFileGenerator(outputDir, 'tests/helpers/auth.js', testsTemplates.authHelper),
      )
      .addGenerator(new StaticFileGenerator(outputDir, 'tests/README.md', testsTemplates.readme));
  }

  const migrationsConfig =
    typeof globalConfig.migrations === 'object' && globalConfig.migrations !== null
      ? {
          enabled: globalConfig.migrations.enabled !== false,
          includeSourceData: globalConfig.migrations.includeSourceData === true,
        }
      : globalConfig.migrations === false
        ? { enabled: false, includeSourceData: false }
        : { enabled: true, includeSourceData: false };

  if (migrationsConfig.enabled) {
    engine
      .addGenerator(
        new StaticFileGenerator(
          outputDir,
          'migrations/001_schema.sql',
          (tables, schema) => infraTemplates.migrationsSchemaSql(tables, schema),
          true,
          enabledTables,
        ),
      )
      .addGenerator(
        new StaticFileGenerator(
          outputDir,
          'migrations/002_seed.sql',
          (tables, schema) => infraTemplates.migrationsSeedSql(tables, schema, seedSnapshot),
          true,
          enabledTables,
        ),
      )
      .addGenerator(
        new StaticFileGenerator(
          outputDir,
          'src/scripts/migrate.js',
          infraTemplates.migrationRunner,
        ),
      )
      .addGenerator(
        new StaticFileGenerator(
          outputDir,
          'src/scripts/create-seed.js',
          infraTemplates.createSeedScript,
        ),
      );
  }

  if (g('swagger')) {
    engine
      .addGenerator(
        new StaticFileGenerator(
          outputDir,
          'src/docs/html/index.html',
          infraTemplates.indexDocumentation,
        ),
      )
      .addGenerator(
        new StaticFileGenerator(
          outputDir,
          'src/docs/swagger/swaggerSpec.js',
          infraTemplates.swaggerSpec,
        ),
      );
  }

  if (g('docs_technical')) {
    engine
      .addGenerator(
        new StaticFileGenerator(
          outputDir,
          'src/docs/technical/00-visao-geral.md',
          infraTemplates.architectureOverviewMd,
        ),
      )
      .addGenerator(
        new StaticFileGenerator(
          outputDir,
          'src/docs/technical/01-fluxo-requisicao.md',
          infraTemplates.requestFlowMd,
        ),
      )
      .addGenerator(
        new StaticFileGenerator(
          outputDir,
          'src/docs/technical/02-erros-e-tratativas.md',
          infraTemplates.errorCatalogMd,
        ),
      )
      .addGenerator(
        new StaticFileGenerator(
          outputDir,
          'src/docs/technical/06-migracoes.md',
          infraTemplates.migrationGuideMd,
        ),
      )
      .addGenerator(
        new StaticFileGenerator(
          outputDir,
          'src/docs/technical/middlewares/README.md',
          infraTemplates.middlewaresIndexMd,
        ),
      )
      .addGenerator(
        new StaticFileGenerator(
          outputDir,
          'src/docs/technical/middlewares/01-auth-middleware.md',
          infraTemplates.authMiddlewareMd,
        ),
      )
      .addGenerator(
        new StaticFileGenerator(
          outputDir,
          'src/docs/technical/middlewares/02-authorize-middleware.md',
          infraTemplates.authorizeMiddlewareMd,
        ),
      )
      .addGenerator(
        new StaticFileGenerator(
          outputDir,
          'src/docs/technical/middlewares/03-request-context-middleware.md',
          infraTemplates.requestContextMiddlewareMd,
        ),
      )
      .addGenerator(
        new StaticFileGenerator(
          outputDir,
          'src/docs/technical/middlewares/04-request-logger-middleware.md',
          infraTemplates.requestLoggerMiddlewareMd,
        ),
      )
      .addGenerator(
        new StaticFileGenerator(
          outputDir,
          'src/docs/technical/middlewares/05-error-middleware.md',
          infraTemplates.errorMiddlewareMd,
        ),
      );
  }

  if (g('prettier')) {
    engine
      .addGenerator(
        new StaticFileGenerator(outputDir, 'prettier.config.js', infraTemplates.prettierConfigFile),
      )
      .addGenerator(
        new StaticFileGenerator(outputDir, '.prettierignore', infraTemplates.prettierIgnoreFile),
      );
  }
}

async function generate(options = {}) {
  const { cliArgs, inputDir, outputDir, configPath, dbConfigPath, envPath } =
    resolveOptions(options);

  dotenv.config({ path: envPath });

  const isInit = cliArgs.includes('--init');
  const shouldAutoInstallAndFormat = parseBoolean(process.env.AUTO_INSTALL_AND_FORMAT, true);

  const configBuilder = new ConfigBuilder(configPath);
  const existingConfig = await configBuilder.load();
  const preferEnvCredentials =
    existingConfig?.global?.databaseConfig?.preferEnvCredentials !== false;

  const databaseConfigBuilder = new DatabaseConfigBuilder(dbConfigPath);
  const existingDatabaseConfig = await databaseConfigBuilder.load();
  const envDatabaseConfig = databaseConfigBuilder.buildFromEnv();
  const dbConfigBundle = databaseConfigBuilder.normalize(
    mergeDatabaseConfigBundle(existingDatabaseConfig, envDatabaseConfig, preferEnvCredentials),
  );

  if (!existingDatabaseConfig) {
    await databaseConfigBuilder.save(dbConfigBundle);
  }

  const databaseConfigStatus = existingDatabaseConfig
    ? 'already exists (skipping file update)'
    : 'created';

  if (isInit || !existingConfig) {
    console.log(`Entrada: ${inputDir}`);
    console.log(`Banco: ${dbConfigPath}`);
    console.log(`Config: ${configPath}`);
    console.log(`Env: ${envPath}`);
    console.log('Creating database connection config...');
    console.log(
      `Prefer env credentials: ${preferEnvCredentials ? 'enabled' : 'disabled'} (api.config.json)`,
    );
    console.log(`Database config ${databaseConfigStatus}: ${dbConfigPath}`);
    console.log('Introspecting database to build api.config.json...');

    const schemasByDatabase = await introspectSchemas(dbConfigBundle.databases, dbConfigPath);
    const config = existingConfig
      ? configBuilder.mergeSchemas(
          existingConfig,
          schemasByDatabase,
          dbConfigBundle.defaultDatabase,
        )
      : configBuilder.buildDefaultFromSchemas(schemasByDatabase, dbConfigBundle.defaultDatabase);

    await configBuilder.save(config);

    if (!existingConfig) {
      console.log(`Config created: ${configPath}`);
      console.log('Review api.config.json then run again to generate the API.');
    } else {
      console.log(`Config updated: ${configPath}`);
      console.log('New tables merged. Review and run again if needed.');
    }
    return;
  }

  const config = existingConfig;
  const globalConfig = config.global || {};
  const includeSeedByEnv = parseBoolean(process.env.MIGRATIONS_INCLUDE_SOURCE_DATA, false);
  const shouldIncludeSourceData =
    (typeof globalConfig.migrations === 'object' &&
      globalConfig.migrations?.includeSourceData === true) ||
    includeSeedByEnv;
  const enabledDatabaseEntries = Object.entries(config.databases || {}).filter(
    ([, databaseConfig]) => databaseConfig?.enabled !== false,
  );

  if (enabledDatabaseEntries.length === 0) {
    throw new Error('No enabled databases found in api.config.json.');
  }

  console.log(`Entrada: ${inputDir}`);
  console.log(`Saida: ${outputDir}`);
  console.log(`Banco: ${dbConfigPath}`);
  console.log(`Config: ${configPath}`);
  console.log(`Prefer env credentials: ${preferEnvCredentials ? 'enabled' : 'disabled'}`);

  await fs.emptyDir(outputDir);

  for (const [databaseKey, databaseSettings] of enabledDatabaseEntries) {
    const dbConfig = dbConfigBundle.databases[databaseKey];
    if (!dbConfig) {
      throw new Error(
        `Database '${databaseKey}' is enabled in api.config.json but missing in ${dbConfigPath}.`,
      );
    }

    ensureDatabaseName(dbConfig, `${dbConfigPath} (${databaseKey})`);

    const tablesConfig = databaseSettings.tables || {};
    const enabledTables = (tableName) => tablesConfig[tableName]?.enabled !== false;
    const databaseOutputDir = resolveDatabaseOutputDir(
      outputDir,
      databaseKey,
      databaseSettings,
      enabledDatabaseEntries.length,
    );
    const introspector = new Introspector(dbConfig);
    const engine = new GeneratorEngine(introspector);

    console.log(`Gerando banco '${databaseKey}' em: ${databaseOutputDir}`);

    let seedSnapshot = {};
    if (shouldIncludeSourceData) {
      const enabledTableNames = Object.keys(tablesConfig).filter(enabledTables);
      if (enabledTableNames.length > 0) {
        console.log(`Exporting source data snapshot for '${databaseKey}'...`);
        seedSnapshot = await introspector.getDataSnapshot(enabledTableNames);
      }
    }

    addLayerGenerators(engine, databaseOutputDir, tablesConfig);
    addStaticGenerators(engine, databaseOutputDir, enabledTables);
    addOptionalGenerators(
      engine,
      databaseOutputDir,
      tablesConfig,
      globalConfig,
      enabledTables,
      seedSnapshot,
    );

    await engine.run();

    if (!shouldAutoInstallAndFormat) {
      continue;
    }

    console.log(`Installing dependencies for '${databaseKey}'...`);
    execSync('npm install', {
      cwd: databaseOutputDir,
      stdio: 'inherit',
      shell: true,
    });

    if (globalConfig.prettier !== false) {
      console.log(`Formatting generated API for '${databaseKey}'...`);
      execSync('npm run format', {
        cwd: databaseOutputDir,
        stdio: 'inherit',
        shell: true,
      });
    }
  }

  if (!shouldAutoInstallAndFormat) {
    console.log('AUTO_INSTALL_AND_FORMAT=false: skipping npm install and npm run format.');
  }
}

module.exports = generate;

if (require.main === module) {
  generate({ cliArgs: process.argv.slice(2) }).catch((error) => {
    console.error('Error:', error.message);
    if (process.env.DEBUG) {
      console.error(error.stack);
    }
    process.exit(1);
  });
}
