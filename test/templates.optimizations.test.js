const test = require('node:test');
const assert = require('node:assert/strict');

const crudTemplates = require('../src/templates/crud/core');
const validatorTemplates = require('../src/templates/validator/validator');
const infraTemplates = require('../src/templates/infra/basics');
const swaggerTemplates = require('../src/templates/infra/swagger');
const testsTemplates = require('../src/templates/tests');

const schema = {
  columns: [
    {
      name: 'id',
      key: 'PRI',
      extra: 'auto_increment',
      type: 'int',
      nullable: false,
      default: null,
    },
    {
      name: 'name',
      key: '',
      extra: '',
      type: 'varchar(255)',
      nullable: false,
      default: null,
    },
    {
      name: 'age',
      key: '',
      extra: '',
      type: 'int',
      nullable: true,
      default: null,
    },
    {
      name: 'created_at',
      key: '',
      extra: '',
      type: 'datetime',
      nullable: true,
      default: null,
    },
  ],
};

test('repository template aplica whitelist, paginacao opcional e bulk com transacao', () => {
  const output = crudTemplates.repository('users', schema);

  assert.match(output, /const FILTERABLE_COLUMNS = new Set\(/);
  assert.match(output, /const COLUMN_SQL_MAP = ALL_COLUMNS\.reduce\(/);
  assert.ok(output.includes("acc[column] = '`' + column + '`';"));
  assert.match(
    output,
    /async findAll\(filters = \{\}, page = 1, limit = 10, includeTotal = true\)/,
  );
  assert.match(output, /if \(includeTotal\) \{/);
  assert.match(output, /SELECT_COLUMNS_SQL/);
  assert.ok(!output.includes('SELECT *'));
  assert.match(output, /beginTransaction\(\)/);
  assert.match(output, /rollback\(\)/);
  assert.match(output, /normalizeBulkShape\(dataArray\)/);
  assert.match(
    output,
    /findByColumnPaginated\(columnName, value, isStringColumn = false, page = 1, limit = 10, includeTotal = true\)/,
  );
  assert.match(output, /async findSelectedColumns\(columns\)/);
  assert.match(output, /async findByIdWithRelations\(id, depth = 1\)/);
  assert.match(output, /return baseKey \+ '_' \+ discriminator \+ '_' \+ String\(index\);/);
  assert.match(output, /relationships\.belongsTo/);
  assert.match(output, /relationships\.hasMany/);
  assert.ok(!output.includes('async findByName('));
  assert.ok(!output.includes('async findByAge('));
  assert.ok(!output.includes('async findByCreatedAt('));
});

test('service template valida page/limit/includeTotal, coluna e shape de bulk', () => {
  const output = crudTemplates.service('users', schema);

  assert.match(output, /require\('\.\.\/utils\/pagination'\)/);
  assert.match(output, /normalizePagination\(page, limit\)/);
  assert.match(output, /parseIncludeTotal\(includeTotal\)/);
  assert.match(output, /if \(!ALLOWED_COLUMNS\.has\(columnName\)\)/);
  assert.match(output, /assertUniformBulkShape\(dataArray\)/);
  assert.match(output, /async getSelectedColumns\(columns\)/);
  assert.match(output, /async getByIdWithRelations\(id, depth = 1\)/);
  assert.match(output, /includeTotal: shouldIncludeTotal/);
  assert.ok(!output.includes('async findByName('));
  assert.ok(!output.includes('async findByAge('));
  assert.ok(!output.includes('async findByCreatedAt('));
});

test('validator template unifica validacao single e bulk com validatePayload', () => {
  const output = validatorTemplates.validator('users', schema);

  assert.match(output, /validatePayload\(data\)/);
  assert.match(output, /const errors = this\.validatePayload\(data\);/);
  assert.match(output, /allErrors\.push\(\{ index, errors \}\)/);
  assert.match(output, /Body must be an array for bulk insert/);
});

test('route template aplica auth e autorizacao por papel e escopo', () => {
  const output = crudTemplates.routes('users', schema);
  const customOutput = crudTemplates.routes('users', schema, null, {
    routes: {},
    customRoutes: [{ method: 'get', path: '/summary', columns: ['id', 'name'] }],
  });
  const controllerOutput = crudTemplates.controller('users', schema, null, {
    customRoutes: [{ method: 'get', path: '/summary', columns: ['id', 'name'] }],
  });

  assert.match(output, /authorizeMiddleware/);
  assert.match(output, /const canRead = authorize\(/);
  assert.match(output, /anyRole: \['admin', 'operator', 'read_only'\]/);
  assert.match(output, /RESOURCE \+ ':write'/);
  assert.match(output, /router\.get\('\/:id\/relations', authMiddleware, canRead/);
  assert.match(output, /\(req, res, next\) => usersValidator\.validate\(req, res, next\)/);
  assert.match(output, /router\.delete\('\/:id', authMiddleware, canDelete/);
  assert.match(
    customOutput,
    /router\.get\('\/summary', authMiddleware, canRead, usersController\.getSummaryProjection\)/,
  );
  assert.match(controllerOutput, /async getSummaryProjection\(req, res, next\)/);
  assert.match(controllerOutput, /getSelectedColumns\(\["id","name"\]\)/);
});

test('infra templates contem utilitario de paginacao e configuracoes de observabilidade', () => {
  const paginationOutput = infraTemplates.pagination();
  const databaseOutput = infraTemplates.database();
  const envOutput = infraTemplates.env();
  const loggerOutput = infraTemplates.logger();
  const authOutput = infraTemplates.authMiddleware();
  const authorizeOutput = infraTemplates.authorizeMiddleware();
  const requestContextOutput = infraTemplates.requestContextMiddleware();
  const requestLoggerOutput = infraTemplates.requestLoggerMiddleware();
  const migrationRunnerOutput = infraTemplates.migrationRunner();
  const migrationSchemaOutput = infraTemplates.migrationsSchemaSql(['users'], { users: schema });
  const migrationSeedOutput = infraTemplates.migrationsSeedSql(['users'], { users: schema }, {});
  const appOutput = swaggerTemplates.app(['users']);
  const packageJsonOutput = infraTemplates.packageJson();
  const packageJson = JSON.parse(packageJsonOutput);

  assert.match(paginationOutput, /function normalizePagination\(page, limit\)/);
  assert.match(paginationOutput, /function parseIncludeTotal\(value\)/);
  assert.match(databaseOutput, /DB_CONNECTION_LIMIT/);
  assert.match(databaseOutput, /connectTimeout/);
  assert.match(envOutput, /JWT_ALGORITHMS/);
  assert.match(envOutput, /JWT_ACCESS_MAX_AGE/);
  assert.match(envOutput, /assertStrongSecret\(process\.env\.JWT_SECRET, 'JWT_SECRET'\)/);
  assert.match(envOutput, /SWAGGER_ENABLED/);
  assert.match(loggerOutput, /\[REDACTED\]/);
  assert.match(authOutput, /assertRequiredClaims/);
  assert.match(authOutput, /algorithms: env\.JWT_ALGORITHMS/);
  assert.match(authorizeOutput, /new AppError\(403, 'Forbidden'\)/);
  assert.match(requestContextOutput, /x-correlation-id/);
  assert.match(requestLoggerOutput, /http\.request/);
  assert.match(appOutput, /helmet/);
  assert.match(appOutput, /express-rate-limit/);
  assert.match(appOutput, /SWAGGER_REQUIRE_ADMIN/);
  assert.match(migrationRunnerOutput, /--with-seed/);
  assert.match(migrationRunnerOutput, /--dry-run/);
  assert.match(migrationRunnerOutput, /listSeedFiles/);
  assert.match(migrationRunnerOutput, /seedFilter/);
  assert.match(migrationRunnerOutput, /Applying schema migration/);
  assert.match(migrationRunnerOutput, /continueOnConflict: true/);
  assert.match(migrationRunnerOutput, /ER_FK_DUP_NAME/);
  assert.match(migrationRunnerOutput, /Skipping already-applied statement/);
  assert.match(migrationSchemaOutput, /CREATE DATABASE IF NOT EXISTS/);
  assert.match(migrationSchemaOutput, /CREATE TABLE IF NOT EXISTS `users`/);
  assert.match(migrationSeedOutput, /No seed data generated/);
  assert.equal(packageJson.scripts.migrate, 'node src/scripts/migrate.js');
  assert.equal(packageJson.scripts['migrate:with-seed'], 'node src/scripts/migrate.js --with-seed');
  assert.equal(packageJson.scripts['migrate:dry-run'], 'node src/scripts/migrate.js --dry-run');
  assert.equal(packageJson.scripts['seed:new'], 'node src/scripts/create-seed.js');
  assert.equal(packageJson.scripts.test, 'jest --runInBand --detectOpenHandles');
  assert.equal(packageJson.scripts['test:integration'], 'jest tests/integration --runInBand');
  assert.ok(packageJson.devDependencies.jest);
  assert.ok(packageJson.devDependencies.supertest);
});

test('tests templates geram suite base de integracao e arquivos de suporte', () => {
  const integrationOutput = testsTemplates.resourceCrudIntegration('users', schema);
  const authHelperOutput = testsTemplates.authHelper();
  const jestConfigOutput = testsTemplates.jestConfig();
  const setupOutput = testsTemplates.jestSetup();
  const readmeOutput = testsTemplates.readme();

  assert.match(integrationOutput, /describe\('API \/api\/users/);
  assert.match(integrationOutput, /test\('GET lista sem token retorna 401'/);
  assert.match(integrationOutput, /test\('PUT \/bulk sem token retorna 401'/);
  assert.match(integrationOutput, /test\('PUT \/bulk com permissao de escrita retorna 200'/);
  assert.match(integrationOutput, /test\('DELETE \/bulk sem token retorna 401'/);
  assert.match(integrationOutput, /test\('DELETE \/bulk com perfil admin retorna 204'/);
  assert.match(integrationOutput, /updateBulk: jest\.fn\(\)/);
  assert.match(integrationOutput, /deleteBulk: jest\.fn\(\)/);
  assert.match(integrationOutput, /test\.todo\('CREATE: obrigatorio ausente/);
  assert.match(authHelperOutput, /createAccessToken/);
  assert.match(jestConfigOutput, /testEnvironment: 'node'/);
  assert.match(setupOutput, /process\.env\.NODE_ENV/);
  assert.match(readmeOutput, /Jest \+ Supertest/);
});
