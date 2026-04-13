const path = require('path');
const fs = require('fs-extra');
const { execSync } = require('child_process');
require('dotenv').config();

const Introspector = require('./src/core/Introspector');
const GeneratorEngine = require('./src/core/GeneratorEngine');
const LayerGenerator = require('./src/generators/LayerGenerator');
const StaticFileGenerator = require('./src/generators/StaticFileGenerator');
const ConfigBuilder = require('./src/core/ConfigBuilder');

const crudTemplates = require('./src/templates/crudTemplates');
const infraTemplates = require('./src/templates/infraTemplates');
const validatorTemplates = require('./src/templates/validatorTemplates');
const testsTemplates = require('./src/templates/testsTemplates');

const CONFIG_PATH = path.join(__dirname, 'api.config.json');

function parseBoolean(value, fallback = true) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  return fallback;
}

async function main() {
  const isInit = process.argv.includes('--init');
  const shouldAutoInstallAndFormat = parseBoolean(process.env.AUTO_INSTALL_AND_FORMAT, true);

  const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306,
  };

  const introspector = new Introspector(dbConfig);
  const configBuilder = new ConfigBuilder(CONFIG_PATH);
  const existingConfig = await configBuilder.load();

  if (isInit || !existingConfig) {
    console.log('Introspecting database to build api.config.json...');
    const schema = await introspector.getSchema();
    const config = existingConfig
      ? configBuilder.merge(existingConfig, schema)
      : configBuilder.buildDefault(schema);

    await configBuilder.save(config);

    if (!existingConfig) {
      console.log(`Config created: ${CONFIG_PATH}`);
      console.log('Review api.config.json then run again to generate the API.');
    } else {
      console.log(`Config updated: ${CONFIG_PATH}`);
      console.log('New tables merged. Review and run again if needed.');
    }
    return;
  }

  const config = existingConfig;
  const tablesConfig = config.tables || {};
  const globalConfig = config.global || {};
  const g = (key) => globalConfig[key] !== false;
  const enabledTables = (tableName) => tablesConfig[tableName]?.enabled !== false;
  const migrationsConfig =
    typeof globalConfig.migrations === 'object' && globalConfig.migrations !== null
      ? {
          enabled: globalConfig.migrations.enabled !== false,
          includeSourceData: globalConfig.migrations.includeSourceData === true,
        }
      : globalConfig.migrations === false
        ? { enabled: false, includeSourceData: false }
        : { enabled: true, includeSourceData: false };
  const includeSeedByEnv = parseBoolean(process.env.MIGRATIONS_INCLUDE_SOURCE_DATA, false);
  const shouldGenerateMigrations = migrationsConfig.enabled;
  const shouldIncludeSourceData = migrationsConfig.includeSourceData || includeSeedByEnv;

  const targetDir = path.join(__dirname, '../dist');
  const targetDirCli = path.join(__dirname, '../dist_cli');
  await fs.emptyDir(targetDir);
  await fs.emptyDir(targetDirCli);

  const engine = new GeneratorEngine(introspector);

  let seedSnapshot = {};
  if (shouldGenerateMigrations && shouldIncludeSourceData) {
    const enabledTableNames = Object.keys(tablesConfig).filter(enabledTables);
    if (enabledTableNames.length > 0) {
      console.log('Exporting source data snapshot for seed migration...');
      seedSnapshot = await introspector.getDataSnapshot(enabledTableNames);
    }
  }

  engine
    .addGenerator(new LayerGenerator(targetDir, 'models', crudTemplates.model, 'js', tablesConfig))
    .addGenerator(
      new LayerGenerator(targetDir, 'repositories', crudTemplates.repository, 'js', tablesConfig),
    )
    .addGenerator(
      new LayerGenerator(targetDir, 'services', crudTemplates.service, 'js', tablesConfig),
    )
    .addGenerator(
      new LayerGenerator(targetDir, 'controllers', crudTemplates.controller, 'js', tablesConfig),
    )
    .addGenerator(
      new LayerGenerator(
        targetDir,
        'middlewares/validators',
        validatorTemplates.validator,
        'js',
        tablesConfig,
      ),
    )
    .addGenerator(new LayerGenerator(targetDir, 'routes', crudTemplates.routes, 'js', tablesConfig))
    .addGenerator(
      new LayerGenerator(targetDirCli, 'apiClient', crudTemplates.apiClient, 'js', tablesConfig),
    );

  if (g('docs_md')) {
    engine.addGenerator(
      new LayerGenerator(
        targetDir,
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
        targetDir,
        'docs/html',
        crudTemplates.documentationHtml,
        'html',
        tablesConfig,
      ),
    );
  }

  if (g('tests')) {
    engine.addGenerator(
      new LayerGenerator(
        targetDir,
        'tests/integration',
        testsTemplates.resourceCrudIntegration,
        'test.js',
        tablesConfig,
      ),
    );
  }

  engine
    .addGenerator(
      new StaticFileGenerator(targetDir, 'src/config/database.js', infraTemplates.database),
    )
    .addGenerator(new StaticFileGenerator(targetDir, 'src/config/env.js', infraTemplates.env))
    .addGenerator(
      new StaticFileGenerator(
        targetDir,
        'src/middlewares/authMiddleware.js',
        infraTemplates.authMiddleware,
      ),
    )
    .addGenerator(
      new StaticFileGenerator(
        targetDir,
        'src/middlewares/authorizeMiddleware.js',
        infraTemplates.authorizeMiddleware,
      ),
    )
    .addGenerator(
      new StaticFileGenerator(
        targetDir,
        'src/middlewares/requestContextMiddleware.js',
        infraTemplates.requestContextMiddleware,
      ),
    )
    .addGenerator(
      new StaticFileGenerator(
        targetDir,
        'src/middlewares/requestLoggerMiddleware.js',
        infraTemplates.requestLoggerMiddleware,
      ),
    )
    .addGenerator(
      new StaticFileGenerator(
        targetDir,
        'src/middlewares/errorMiddleware.js',
        infraTemplates.errorMiddleware,
      ),
    )
    .addGenerator(
      new StaticFileGenerator(targetDir, 'src/utils/AppError.js', infraTemplates.appError),
    )
    .addGenerator(new StaticFileGenerator(targetDir, 'src/utils/logger.js', infraTemplates.logger))
    .addGenerator(
      new StaticFileGenerator(targetDir, 'src/utils/pagination.js', infraTemplates.pagination),
    )
    .addGenerator(
      new StaticFileGenerator(targetDir, 'src/app.js', infraTemplates.app, true, enabledTables),
    )
    .addGenerator(new StaticFileGenerator(targetDir, 'src/server.js', infraTemplates.server))
    .addGenerator(new StaticFileGenerator(targetDir, 'package.json', infraTemplates.packageJson))
    .addGenerator(new StaticFileGenerator(targetDir, '.env', infraTemplates.envfile))
    .addGenerator(new StaticFileGenerator(targetDir, '.gitignore', infraTemplates.gitignoreFile));

  if (shouldGenerateMigrations) {
    engine
      .addGenerator(
        new StaticFileGenerator(
          targetDir,
          'migrations/001_schema.sql',
          (tables, schema) => infraTemplates.migrationsSchemaSql(tables, schema),
          true,
          enabledTables,
        ),
      )
      .addGenerator(
        new StaticFileGenerator(
          targetDir,
          'migrations/002_seed.sql',
          (tables, schema) => infraTemplates.migrationsSeedSql(tables, schema, seedSnapshot),
          true,
          enabledTables,
        ),
      )
      .addGenerator(
        new StaticFileGenerator(
          targetDir,
          'src/scripts/migrate.js',
          infraTemplates.migrationRunner,
        ),
      );
  }

  if (g('swagger')) {
    engine
      .addGenerator(
        new StaticFileGenerator(
          targetDir,
          'src/docs/html/index.html',
          infraTemplates.indexDocumentation,
        ),
      )
      .addGenerator(
        new StaticFileGenerator(
          targetDir,
          'src/docs/swagger/swaggerSpec.js',
          infraTemplates.swaggerSpec,
        ),
      );
  }

  if (g('docs_technical')) {
    engine
      .addGenerator(
        new StaticFileGenerator(
          targetDir,
          'src/docs/technical/00-visao-geral.md',
          infraTemplates.architectureOverviewMd,
        ),
      )
      .addGenerator(
        new StaticFileGenerator(
          targetDir,
          'src/docs/technical/01-fluxo-requisicao.md',
          infraTemplates.requestFlowMd,
        ),
      )
      .addGenerator(
        new StaticFileGenerator(
          targetDir,
          'src/docs/technical/02-erros-e-tratativas.md',
          infraTemplates.errorCatalogMd,
        ),
      )
      .addGenerator(
        new StaticFileGenerator(
          targetDir,
          'src/docs/technical/06-migracoes.md',
          infraTemplates.migrationGuideMd,
        ),
      )
      .addGenerator(
        new StaticFileGenerator(
          targetDir,
          'src/docs/technical/middlewares/README.md',
          infraTemplates.middlewaresIndexMd,
        ),
      )
      .addGenerator(
        new StaticFileGenerator(
          targetDir,
          'src/docs/technical/middlewares/01-auth-middleware.md',
          infraTemplates.authMiddlewareMd,
        ),
      )
      .addGenerator(
        new StaticFileGenerator(
          targetDir,
          'src/docs/technical/middlewares/02-authorize-middleware.md',
          infraTemplates.authorizeMiddlewareMd,
        ),
      )
      .addGenerator(
        new StaticFileGenerator(
          targetDir,
          'src/docs/technical/middlewares/03-request-context-middleware.md',
          infraTemplates.requestContextMiddlewareMd,
        ),
      )
      .addGenerator(
        new StaticFileGenerator(
          targetDir,
          'src/docs/technical/middlewares/04-request-logger-middleware.md',
          infraTemplates.requestLoggerMiddlewareMd,
        ),
      )
      .addGenerator(
        new StaticFileGenerator(
          targetDir,
          'src/docs/technical/middlewares/05-error-middleware.md',
          infraTemplates.errorMiddlewareMd,
        ),
      );
  }

  if (g('prettier')) {
    engine
      .addGenerator(
        new StaticFileGenerator(targetDir, 'prettier.config.js', infraTemplates.prettierConfigFile),
      )
      .addGenerator(
        new StaticFileGenerator(targetDir, '.prettierignore', infraTemplates.prettierIgnoreFile),
      );
  }

  if (g('tests')) {
    engine
      .addGenerator(new StaticFileGenerator(targetDir, 'jest.config.js', testsTemplates.jestConfig))
      .addGenerator(
        new StaticFileGenerator(targetDir, 'tests/jest.setup.js', testsTemplates.jestSetup),
      )
      .addGenerator(
        new StaticFileGenerator(targetDir, 'tests/helpers/auth.js', testsTemplates.authHelper),
      )
      .addGenerator(new StaticFileGenerator(targetDir, 'tests/README.md', testsTemplates.readme));
  }

  await engine.run();

  if (shouldAutoInstallAndFormat) {
    console.log('Installing dependencies for generated API...');
    execSync('npm install', {
      cwd: targetDir,
      stdio: 'inherit',
      shell: true,
    });

    if (g('prettier')) {
      console.log('Formatting generated API with local Prettier...');
      execSync('npm run format', {
        cwd: targetDir,
        stdio: 'inherit',
        shell: true,
      });
    }
    return;
  }

  console.log(
    'AUTO_INSTALL_AND_FORMAT=false: skipping npm install and npm run format in generated API.',
  );
}

main().catch(console.error);
