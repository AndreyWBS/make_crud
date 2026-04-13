const path = require('path');
const fs = require('fs-extra');
const { execSync } = require('child_process');
require('dotenv').config();

const Introspector = require('./src/core/Introspector');
const GeneratorEngine = require('./src/core/GeneratorEngine');
const LayerGenerator = require('./src/generators/LayerGenerator');
const StaticFileGenerator = require('./src/generators/StaticFileGenerator');

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

async function main() {
  const shouldAutoInstallAndFormat = parseBoolean(process.env.AUTO_INSTALL_AND_FORMAT, true);

  const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306,
  };

  const targetDir = path.join(__dirname, '../dist');
  const targetDir_cli = path.join(__dirname, '../dist_cli');
  await fs.emptyDir(targetDir);
  await fs.emptyDir(targetDir_cli);

  const introspector = new Introspector(dbConfig);
  const engine = new GeneratorEngine(introspector);

  engine
    .addGenerator(new LayerGenerator(targetDir, 'models', crudTemplates.model))
    .addGenerator(new LayerGenerator(targetDir, 'repositories', crudTemplates.repository))
    .addGenerator(new LayerGenerator(targetDir, 'services', crudTemplates.service))
    .addGenerator(new LayerGenerator(targetDir, 'controllers', crudTemplates.controller))
    .addGenerator(
      new LayerGenerator(targetDir, 'middlewares/validators', validatorTemplates.validator),
    )
    .addGenerator(new LayerGenerator(targetDir, 'routes', crudTemplates.routes))
    .addGenerator(new LayerGenerator(targetDir, 'docs/rotas_md', crudTemplates.documentation, 'md'))
    .addGenerator(
      new LayerGenerator(targetDir, 'docs/html', crudTemplates.documentationHtml, 'html'),
    )
    .addGenerator(
      new LayerGenerator(
        targetDir,
        'tests/integration',
        testsTemplates.resourceCrudIntegration,
        'test.js',
      ),
    )
    .addGenerator(new LayerGenerator(targetDir_cli, 'apiClient', crudTemplates.apiClient));

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
    )
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
    )
    .addGenerator(
      new StaticFileGenerator(targetDir, 'src/utils/AppError.js', infraTemplates.appError),
    )
    .addGenerator(new StaticFileGenerator(targetDir, 'src/utils/logger.js', infraTemplates.logger))
    .addGenerator(
      new StaticFileGenerator(targetDir, 'src/utils/pagination.js', infraTemplates.pagination),
    )
    .addGenerator(new StaticFileGenerator(targetDir, 'src/app.js', infraTemplates.app))
    .addGenerator(new StaticFileGenerator(targetDir, 'src/server.js', infraTemplates.server))
    .addGenerator(new StaticFileGenerator(targetDir, 'jest.config.js', testsTemplates.jestConfig))
    .addGenerator(
      new StaticFileGenerator(targetDir, 'tests/jest.setup.js', testsTemplates.jestSetup),
    )
    .addGenerator(
      new StaticFileGenerator(targetDir, 'tests/helpers/auth.js', testsTemplates.authHelper),
    )
    .addGenerator(new StaticFileGenerator(targetDir, 'tests/README.md', testsTemplates.readme))
    .addGenerator(new StaticFileGenerator(targetDir, 'package.json', infraTemplates.packageJson))
    .addGenerator(
      new StaticFileGenerator(targetDir, 'prettier.config.js', infraTemplates.prettierConfigFile),
    )
    .addGenerator(
      new StaticFileGenerator(targetDir, '.prettierignore', infraTemplates.prettierIgnoreFile),
    )
    .addGenerator(new StaticFileGenerator(targetDir, '.env', infraTemplates.envfile))
    .addGenerator(new StaticFileGenerator(targetDir, '.gitignore', infraTemplates.gitignoreFile));

  await engine.run();

  if (shouldAutoInstallAndFormat) {
    console.log('Installing dependencies for generated API...');
    execSync('npm install', {
      cwd: targetDir,
      stdio: 'inherit',
      shell: true,
    });

    console.log('Formatting generated API with local Prettier...');
    execSync('npm run format', {
      cwd: targetDir,
      stdio: 'inherit',
      shell: true,
    });
    return;
  }

  console.log(
    'AUTO_INSTALL_AND_FORMAT=false: skipping npm install and npm run format in generated API.',
  );
}

main().catch(console.error);

// Exemplo de uso:
