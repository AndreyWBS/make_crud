const path = require('path');
const fs = require('fs-extra');
const { execSync } = require('child_process');
const dotenv = require('dotenv');
const readline = require('readline');

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

function hasFlag(args, longFlag, shortFlag = null) {
  if (!Array.isArray(args)) return false;
  return args.includes(longFlag) || (shortFlag ? args.includes(shortFlag) : false);
}

function resolveLanguage(value, fallback = 'pt') {
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

function resolveOptions(options = {}) {
  const cliArgs = Array.isArray(options.cliArgs) ? options.cliArgs : [];
  const inputDirArg = getArgValue(cliArgs, '--input', '-i') || getArgValue(cliArgs, '--dir', '-d');
  const outputDirArg = getArgValue(cliArgs, '--output', '-o');
  const configPathArg = getArgValue(cliArgs, '--config', '-c');
  const dbConfigPathArg = getArgValue(cliArgs, '--db-config', '-b');
  const envPathArg = getArgValue(cliArgs, '--env', '-e');
  const languageArg = getArgValue(cliArgs, '--lang', '-l');
  const useDefaultConfig = hasFlag(cliArgs, '--default-config', '-dc');
  const showHelp = hasFlag(cliArgs, '--help', '-h');

  const inputDir = path.resolve(options.inputDir || inputDirArg || process.cwd());
  const outputDir = path.resolve(options.outputDir || outputDirArg || path.join(inputDir, 'dist'));
  const configPath = path.resolve(
    options.configPath || configPathArg || path.join(inputDir, 'api.config.json'),
  );
  const dbConfigPath = path.resolve(
    options.dbConfigPath || dbConfigPathArg || path.join(inputDir, 'db.config.json'),
  );
  const envPath = path.resolve(options.envPath || envPathArg || path.join(inputDir, '.env'));
  const rawLanguage = options.language || languageArg || null;
  const language = rawLanguage ? resolveLanguage(rawLanguage) : null;

  return {
    cliArgs,
    inputDir,
    outputDir,
    configPath,
    dbConfigPath,
    envPath,
    language,
    useDefaultConfig,
    showHelp,
  };
}

function printHelp() {
  console.log(`gerador-crud - Gerador de API CRUD

Atalho de comando:
  gcrud

Uso:
  gerador-crud [opcoes]

Opcoes:
  --help, -h                 Mostra esta ajuda
  --init                     Introspecta bancos e cria/atualiza arquivos de configuracao
  --default-config, -dc      Usa api.config.json padrao e segue direto para geracao
  --input, -i <dir>          Diretorio de entrada
  --dir, -d <dir>            Alias legado para --input
  --output, -o <dir>         Diretorio de saida
  --db-config, -b <arquivo>  Caminho do db.config.json
  --config, -c <arquivo>     Caminho do api.config.json
  --env, -e <arquivo>        Caminho do arquivo .env
  --lang, -l <pt|en>         Idioma das mensagens da API gerada

Exemplos:
  gerador-crud --init
  gerador-crud --input ./entrada --default-config
  gerador-crud --input ./entrada --output ./saida --lang pt
`);
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

function firstDatabaseEntry(bundle = {}) {
  const entries = Object.entries(bundle?.databases || {});
  if (entries.length === 0) {
    return { databaseKey: 'default', config: {} };
  }

  const [databaseKey, config] = entries[0];
  return { databaseKey, config: config || {} };
}

function hasDatabaseName(bundle = {}) {
  return Object.values(bundle?.databases || {}).some(
    (db) => typeof db?.database === 'string' && db.database.trim().length > 0,
  );
}

function isInteractiveTerminal() {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

function buildPromptQuestion(label, fallback = '') {
  const fallbackText = String(fallback || '').trim();
  return fallbackText ? `${label} [${fallbackText}]: ` : `${label}: `;
}

async function askQuestion(rl, label, fallback = '') {
  const answer = await new Promise((resolve) => {
    rl.question(buildPromptQuestion(label, fallback), resolve);
  });

  const trimmed = String(answer || '').trim();
  if (trimmed) return trimmed;
  return String(fallback || '').trim();
}

async function promptDatabaseConfig(envDatabaseConfig = {}) {
  const { databaseKey: envDatabaseKey, config: envEntry } = firstDatabaseEntry(envDatabaseConfig);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    console.log('\nNenhum db.config.json encontrado. Informe as credenciais do banco:');
    const host = await askQuestion(rl, 'Host', envEntry.host || 'localhost');
    const user = await askQuestion(rl, 'Usuario', envEntry.user || 'root');
    const password = await askQuestion(rl, 'Senha', envEntry.password || '');

    let database = await askQuestion(rl, 'Nome do banco', envEntry.database || '');
    while (!database) {
      console.log('Nome do banco e obrigatorio.');
      database = await askQuestion(rl, 'Nome do banco', envEntry.database || '');
    }

    const portInput = await askQuestion(rl, 'Porta', envEntry.port || '3306');
    const parsedPort = Number(portInput);
    const port = Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 3306;

    const aliasFallback = envDatabaseKey || database || 'default';
    const alias = await askQuestion(rl, 'Alias da conexao (chave)', aliasFallback);
    const databaseKey = alias || aliasFallback;

    return {
      defaultDatabase: databaseKey,
      databases: {
        [databaseKey]: {
          host,
          user,
          password,
          database,
          port,
        },
      },
    };
  } finally {
    rl.close();
  }
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

function addStaticGenerators(
  engine,
  outputDir,
  enabledTables,
  tableDatabaseMap = {},
  generatedEnvFileContent = null,
  language = 'pt',
) {
  engine
    .addGenerator(
      new StaticFileGenerator(outputDir, 'src/config/database.js', infraTemplates.database),
    )
    .addGenerator(
      new StaticFileGenerator(
        outputDir,
        'src/config/databaseTables.js',
        () => `module.exports = ${JSON.stringify(tableDatabaseMap, null, 2)};\n`,
      ),
    )
    .addGenerator(new StaticFileGenerator(outputDir, 'src/config/env.js', infraTemplates.env))
    .addGenerator(
      new StaticFileGenerator(outputDir, 'src/middlewares/authMiddleware.js', () =>
        infraTemplates.authMiddleware(language),
      ),
    )
    .addGenerator(
      new StaticFileGenerator(outputDir, 'src/middlewares/authorizeMiddleware.js', () =>
        infraTemplates.authorizeMiddleware(language),
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
      new StaticFileGenerator(outputDir, 'src/middlewares/errorMiddleware.js', () =>
        infraTemplates.errorMiddleware(language),
      ),
    )
    .addGenerator(
      new StaticFileGenerator(outputDir, 'src/utils/AppError.js', infraTemplates.appError),
    )
    .addGenerator(new StaticFileGenerator(outputDir, 'src/utils/logger.js', infraTemplates.logger))
    .addGenerator(
      new StaticFileGenerator(outputDir, 'src/utils/pagination.js', () =>
        infraTemplates.pagination(language),
      ),
    )
    .addGenerator(
      new StaticFileGenerator(outputDir, 'src/core/BaseCrudService.js', () =>
        infraTemplates.baseCrudService(language),
      ),
    )
    .addGenerator(
      new StaticFileGenerator(
        outputDir,
        'src/core/BaseCrudController.js',
        infraTemplates.baseCrudController,
      ),
    )
    .addGenerator(
      new StaticFileGenerator(
        outputDir,
        'src/app.js',
        (tables, schema) => infraTemplates.app(tables, language),
        true,
        enabledTables,
      ),
    )
    .addGenerator(new StaticFileGenerator(outputDir, 'src/server.js', infraTemplates.server))
    .addGenerator(new StaticFileGenerator(outputDir, 'package.json', infraTemplates.packageJson))
    .addGenerator(
      new StaticFileGenerator(
        outputDir,
        '.env',
        generatedEnvFileContent ? () => generatedEnvFileContent : infraTemplates.envfile,
      ),
    )
    .addGenerator(new StaticFileGenerator(outputDir, '.gitignore', infraTemplates.gitignoreFile));
}

function buildTableDatabaseMap(enabledDatabaseEntries) {
  const tableDatabaseMap = {};
  for (const [databaseKey, databaseSettings] of enabledDatabaseEntries) {
    const tablesConfig = databaseSettings?.tables || {};
    for (const [tableName, tableConfig] of Object.entries(tablesConfig)) {
      if (tableConfig?.enabled !== false) {
        tableDatabaseMap[tableName] = databaseKey;
      }
    }
  }
  return tableDatabaseMap;
}

function resolveDefaultDatabaseKey(enabledDatabaseEntries, dbConfigBundle) {
  const enabledDatabaseKeys = enabledDatabaseEntries.map(([databaseKey]) => databaseKey);
  if (enabledDatabaseKeys.includes(dbConfigBundle.defaultDatabase)) {
    return dbConfigBundle.defaultDatabase;
  }
  return enabledDatabaseKeys[0] || dbConfigBundle.defaultDatabase || 'default';
}

function buildEnvFileContent(enabledDatabaseEntries, dbConfigBundle) {
  const defaultDatabaseKey = resolveDefaultDatabaseKey(enabledDatabaseEntries, dbConfigBundle);
  const defaultDatabaseConfig = dbConfigBundle.databases[defaultDatabaseKey] || {};

  const dbConnections = Object.fromEntries(
    enabledDatabaseEntries.map(([databaseKey]) => {
      const dbConfig = dbConfigBundle.databases[databaseKey] || {};
      return [
        databaseKey,
        {
          host: dbConfig.host || '',
          user: dbConfig.user || '',
          password: dbConfig.password || '',
          database: dbConfig.database || '',
          port: Number(dbConfig.port) || 3306,
        },
      ];
    }),
  );

  return `PORT=${process.env.PORT || 3000}
NODE_ENV=development



DB_HOST=${defaultDatabaseConfig.host || 'localhost'}
DB_USER=${defaultDatabaseConfig.user || 'root'}
DB_PASSWORD=${defaultDatabaseConfig.password || ''}
DB_NAME=${defaultDatabaseConfig.database || 'my_database'}
DB_PORT=${defaultDatabaseConfig.port || 3306}

# Optional multi-database mode (JSON object by connection key)
# Example: {"default":{"host":"localhost","user":"root","password":"","database":"db1","port":3306},"crm":{"host":"localhost","user":"root","password":"","database":"db2","port":3306}}
DB_CONNECTIONS=${JSON.stringify(dbConnections)}
DEFAULT_DB_KEY=${defaultDatabaseKey}

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
`;
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
  const {
    cliArgs,
    inputDir,
    outputDir,
    configPath,
    dbConfigPath,
    envPath,
    language,
    useDefaultConfig,
    showHelp,
  } = resolveOptions(options);

  if (showHelp) {
    printHelp();
    return;
  }

  dotenv.config({ path: envPath });

  const isInit = cliArgs.includes('--init');
  const shouldAutoInstallAndFormat = parseBoolean(process.env.AUTO_INSTALL_AND_FORMAT, true);

  const configBuilder = new ConfigBuilder(configPath);
  const existingConfig = await configBuilder.load();
  const preferEnvCredentials = useDefaultConfig
    ? true
    : existingConfig?.global?.databaseConfig?.preferEnvCredentials !== false;

  const databaseConfigBuilder = new DatabaseConfigBuilder(dbConfigPath);
  const existingDatabaseConfig = await databaseConfigBuilder.load();
  const envDatabaseConfig = databaseConfigBuilder.buildFromEnv();

  let databaseConfigSource = mergeDatabaseConfigBundle(
    existingDatabaseConfig,
    envDatabaseConfig,
    preferEnvCredentials,
  );

  if (!existingDatabaseConfig) {
    if (isInteractiveTerminal()) {
      const promptedDatabaseConfig = await promptDatabaseConfig(envDatabaseConfig);
      databaseConfigSource = mergeDatabaseConfigBundle(
        databaseConfigSource,
        promptedDatabaseConfig,
        true,
      );
    } else if (!hasDatabaseName(databaseConfigSource)) {
      throw new Error(
        `Database config not found at ${dbConfigPath}. Configure DB_* variables or run in interactive mode to informar as credenciais.`,
      );
    }
  }

  const dbConfigBundle = databaseConfigBuilder.normalize(databaseConfigSource);

  if (!existingDatabaseConfig) {
    await databaseConfigBuilder.save(dbConfigBundle);
  }

  const databaseConfigStatus = existingDatabaseConfig
    ? 'already exists (skipping file update)'
    : 'created';

  let config = existingConfig;

  if (isInit || !existingConfig || useDefaultConfig) {
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
    config = useDefaultConfig
      ? configBuilder.buildDefaultFromSchemas(schemasByDatabase, dbConfigBundle.defaultDatabase)
      : existingConfig
        ? configBuilder.mergeSchemas(
            existingConfig,
            schemasByDatabase,
            dbConfigBundle.defaultDatabase,
          )
        : configBuilder.buildDefaultFromSchemas(schemasByDatabase, dbConfigBundle.defaultDatabase);

    config.global = config.global || {};
    config.global.language = resolveLanguage(language || config.global.language || 'en');

    await configBuilder.save(config);

    if (useDefaultConfig) {
      console.log(`Config padrao criado/atualizado: ${configPath}`);
      console.log('Prosseguindo com a geracao usando configuracoes padrao.');
    } else {
      if (!existingConfig) {
        console.log(`Config created: ${configPath}`);
        console.log('Review api.config.json then run again to generate the API.');
      } else {
        console.log(`Config updated: ${configPath}`);
        console.log('New tables merged. Review and run again if needed.');
      }

      return;
    }
  }

  if (!config) {
    throw new Error('api.config.json could not be resolved.');
  }

  const globalConfig = config.global || {};
  const selectedLanguage = resolveLanguage(language || globalConfig.language || 'pt');
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

  const separateApis = globalConfig.separateApis === true;
  const useSingleApi = !separateApis && enabledDatabaseEntries.length > 1;

  console.log(`Entrada: ${inputDir}`);
  console.log(`Saida: ${outputDir}`);
  console.log(`Banco: ${dbConfigPath}`);
  console.log(`Config: ${configPath}`);
  console.log(`Idioma: ${selectedLanguage}`);
  console.log(`Prefer env credentials: ${preferEnvCredentials ? 'enabled' : 'disabled'}`);
  console.log(
    `Modo: ${useSingleApi ? 'API única (múltiplos bancos combinados)' : separateApis ? 'APIs separadas por banco' : 'API única'}`,
  );

  await fs.emptyDir(outputDir);

  if (useSingleApi) {
    await generateSingleApi({
      enabledDatabaseEntries,
      dbConfigBundle,
      dbConfigPath,
      outputDir,
      globalConfig,
      shouldIncludeSourceData,
      shouldAutoInstallAndFormat,
      language: selectedLanguage,
    });
  } else {
    await generateSeparateApis({
      enabledDatabaseEntries,
      dbConfigBundle,
      dbConfigPath,
      outputDir,
      globalConfig,
      shouldIncludeSourceData,
      shouldAutoInstallAndFormat,
      language: selectedLanguage,
    });
  }
}

async function generateSingleApi({
  enabledDatabaseEntries,
  dbConfigBundle,
  dbConfigPath,
  outputDir,
  globalConfig,
  shouldIncludeSourceData,
  shouldAutoInstallAndFormat,
  language,
}) {
  const mergedTablesConfig = {};
  const mergedSchema = {};
  const mergedSeedSnapshot = {};
  const tableDatabaseMap = {};

  for (const [databaseKey, databaseSettings] of enabledDatabaseEntries) {
    const dbConfig = dbConfigBundle.databases[databaseKey];
    if (!dbConfig) {
      throw new Error(
        `Database '${databaseKey}' is enabled in api.config.json but missing in ${dbConfigPath}.`,
      );
    }
    ensureDatabaseName(dbConfig, `${dbConfigPath} (${databaseKey})`);

    const tablesConfig = databaseSettings.tables || {};
    Object.assign(mergedTablesConfig, tablesConfig);
    for (const [tableName, tableConfig] of Object.entries(tablesConfig)) {
      if (tableConfig?.enabled !== false) {
        tableDatabaseMap[tableName] = databaseKey;
      }
    }

    const introspector = new Introspector(dbConfig);
    console.log(`Introspectando banco '${databaseKey}'...`);
    const schema = await introspector.getSchema();
    Object.assign(mergedSchema, schema);

    if (shouldIncludeSourceData) {
      const enabledTableNames = Object.keys(tablesConfig).filter(
        (t) => tablesConfig[t]?.enabled !== false,
      );
      if (enabledTableNames.length > 0) {
        console.log(`Exportando dados de '${databaseKey}'...`);
        const snap = await introspector.getDataSnapshot(enabledTableNames);
        Object.assign(mergedSeedSnapshot, snap);
      }
    }
  }

  const enabledTables = (tableName) => mergedTablesConfig[tableName]?.enabled !== false;
  const generatedEnvFileContent = buildEnvFileContent(enabledDatabaseEntries, dbConfigBundle);
  const staticIntrospector = { getSchema: async () => mergedSchema };
  const engine = new GeneratorEngine(staticIntrospector);

  addLayerGenerators(engine, outputDir, mergedTablesConfig);
  addStaticGenerators(
    engine,
    outputDir,
    enabledTables,
    tableDatabaseMap,
    generatedEnvFileContent,
    language,
  );
  addOptionalGenerators(
    engine,
    outputDir,
    mergedTablesConfig,
    globalConfig,
    enabledTables,
    mergedSeedSnapshot,
  );

  await engine.run();

  if (!shouldAutoInstallAndFormat) {
    console.log('AUTO_INSTALL_AND_FORMAT=false: skipping npm install and npm run format.');
    return;
  }

  console.log('Installing dependencies...');
  execSync('npm install', { cwd: outputDir, stdio: 'inherit', shell: true });

  if (globalConfig.prettier !== false) {
    console.log('Formatting generated API...');
    execSync('npm run format', { cwd: outputDir, stdio: 'inherit', shell: true });
  }
}

async function generateSeparateApis({
  enabledDatabaseEntries,
  dbConfigBundle,
  dbConfigPath,
  outputDir,
  globalConfig,
  shouldIncludeSourceData,
  shouldAutoInstallAndFormat,
  language,
}) {
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
    const tableDatabaseMap = buildTableDatabaseMap([[databaseKey, databaseSettings]]);
    const generatedEnvFileContent = buildEnvFileContent(
      [[databaseKey, databaseSettings]],
      dbConfigBundle,
    );
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
    addStaticGenerators(
      engine,
      databaseOutputDir,
      enabledTables,
      tableDatabaseMap,
      generatedEnvFileContent,
      language,
    );
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
