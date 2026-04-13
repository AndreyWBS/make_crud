const { camelCase } = require('../../utils/stringUtils');

function buildSampleValueByType(type = '') {
  const normalized = String(type).toLowerCase();

  if (
    normalized.includes('int') ||
    normalized.includes('decimal') ||
    normalized.includes('float') ||
    normalized.includes('double')
  ) {
    return 1;
  }

  if (normalized.includes('bool') || normalized === 'tinyint(1)') {
    return true;
  }

  if (normalized.includes('date') || normalized.includes('time')) {
    return '2026-01-01T10:00:00Z';
  }

  if (normalized.includes('json')) {
    return { status: 'ok' };
  }

  if (normalized.includes('email')) {
    return 'user@example.com';
  }

  return 'valor_teste';
}

function buildValidPayload(schema) {
  const payload = {};
  const columns = Array.isArray(schema?.columns) ? schema.columns : [];

  for (const column of columns) {
    if (column.extra === 'auto_increment') continue;
    if (!column.nullable && column.default === null) {
      payload[column.name] = buildSampleValueByType(column.type);
    }
  }

  if (Object.keys(payload).length === 0) {
    for (const column of columns) {
      if (column.extra === 'auto_increment') continue;
      payload[column.name] = buildSampleValueByType(column.type);
      break;
    }
  }

  return payload;
}

module.exports = {
  jestConfig: () => `module.exports = {
  testEnvironment: 'node',
  clearMocks: true,
  restoreMocks: true,
  setupFiles: ['<rootDir>/tests/jest.setup.js'],
  testMatch: ['**/*.test.js'],
};
`,

  jestSetup: () => `process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.AUTH_DISABLED = 'false';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'this_is_a_super_secret_key_for_test_suite_123';
process.env.JWT_ISSUER = process.env.JWT_ISSUER || 'generated-api';
process.env.JWT_AUDIENCE = process.env.JWT_AUDIENCE || 'generated-api-clients';
process.env.JWT_ALGORITHMS = process.env.JWT_ALGORITHMS || 'HS256';
process.env.SWAGGER_ENABLED = process.env.SWAGGER_ENABLED || 'false';
`,

  authHelper: () => `const jwt = require('jsonwebtoken');

function parseList(value, fallback = []) {
  if (!value) return fallback;
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function getJwtConfig() {
  return {
    secret: process.env.JWT_SECRET,
    issuer: process.env.JWT_ISSUER || 'generated-api',
    audience: process.env.JWT_AUDIENCE || 'generated-api-clients',
    algorithm: parseList(process.env.JWT_ALGORITHMS, ['HS256'])[0] || 'HS256',
  };
}

function createAccessToken({
  sub = 'integration-user',
  roles = ['admin'],
  scopes = ['*'],
  expiresIn = '15m',
} = {}) {
  const jwtConfig = getJwtConfig();

  return jwt.sign(
    {
      sub,
      roles,
      scope: Array.isArray(scopes) ? scopes.join(' ') : scopes,
    },
    jwtConfig.secret,
    {
      algorithm: jwtConfig.algorithm,
      issuer: jwtConfig.issuer,
      audience: jwtConfig.audience,
      expiresIn,
    },
  );
}

module.exports = {
  createAccessToken,
};
`,

  readme: () => `# Testes gerados automaticamente

Este diretório entrega uma base de testes para acelerar a validação das APIs geradas.

## Tipos de teste incluídos

- Testes de integração por recurso com Jest + Supertest.
- Casos executáveis para fluxos principais de autenticação/autorização e CRUD.
- Matriz de cenários com \`test.todo\` para expandir cobertura de:
  - CREATE, READ, UPDATE, DELETE
  - regras de negócio e segurança
  - contrato OpenAPI/Swagger
  - performance, banco de dados e idempotência
  - edge cases e headers HTTP
  - observabilidade e logs

## Como executar

- \`npm test\` executa toda a suíte.
- \`npm run test:integration\` executa apenas integrações em \`tests/integration\`.
- \`npm run test:watch\` executa em modo watch.

## Observações

- Os testes usam mocks de service para isolar camada HTTP.
- Para validação E2E real com banco, substitua mocks por setup de banco de teste e fixtures.
- Use este diretório como baseline para completar os \`test.todo\` conforme regras do seu domínio.
`,

  resourceCrudIntegration: (tableName, schema) => {
    const resourceName = tableName;
    const serviceName = `${camelCase(tableName)}Service`;
    const validPayload = buildValidPayload(schema);
    const validPayloadLiteral = JSON.stringify(validPayload, null, 2)
      .split('\n')
      .map((line) => `  ${line}`)
      .join('\n');

    return `const request = require('supertest');
const AppError = require('../../utils/AppError');
const { createAccessToken } = require('../../../tests/helpers/auth');

jest.mock('../../services/${serviceName}', () => ({
  getAll: jest.fn(),
  getById: jest.fn(),
  getByIdWithRelations: jest.fn(),
  create: jest.fn(),
  createBulk: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  findByColumnPaginated: jest.fn(),
}));

const ${serviceName} = require('../../services/${serviceName}');

describe('API /api/${resourceName} - cobertura base de integracao', () => {
  /** @type {import('express').Application} */
  let app;

  beforeAll(() => {
    app = require('../../app');
  });

  beforeEach(() => {
    jest.clearAllMocks();

    ${serviceName}.getAll.mockResolvedValue({
      data: [],
      meta: {
        totalItems: 0,
        totalPages: 0,
        includeTotal: true,
        currentPage: 1,
        itemsPerPage: 10,
      },
    });

    ${serviceName}.getById.mockResolvedValue({ id: 1 });
    ${serviceName}.create.mockResolvedValue({ id: 1 });
    ${serviceName}.update.mockResolvedValue({ id: 1 });
    ${serviceName}.delete.mockResolvedValue({ success: true });
  });

  test('GET lista sem token retorna 401', async () => {
    const response = await request(app).get('/api/${resourceName}');
    expect(response.status).toBe(401);
  });

  test('POST sem token retorna 401', async () => {
    const response = await request(app)
      .post('/api/${resourceName}')
      .send({});

    expect(response.status).toBe(401);
  });

  test('GET com perfil read_only retorna 200', async () => {
    const token = createAccessToken({ roles: ['read_only'], scopes: ['${resourceName}:read'] });

    const response = await request(app)
      .get('/api/${resourceName}')
      .set('Authorization', 'Bearer ' + token);

    expect(response.status).toBe(200);
    expect(${serviceName}.getAll).toHaveBeenCalledTimes(1);
  });

  test('POST com perfil sem escrita retorna 403', async () => {
    const token = createAccessToken({ roles: ['read_only'], scopes: ['${resourceName}:read'] });

    const response = await request(app)
      .post('/api/${resourceName}')
      .set('Authorization', 'Bearer ' + token)
      .send({});

    expect(response.status).toBe(403);
  });

  test('POST com dados validos e permissao retorna 201', async () => {
    const token = createAccessToken({ roles: ['operator'], scopes: ['${resourceName}:write'] });
    const payload = ${validPayloadLiteral};

    const response = await request(app)
      .post('/api/${resourceName}')
      .set('Authorization', 'Bearer ' + token)
      .send(payload);

    expect(response.status).toBe(201);
    expect(${serviceName}.create).toHaveBeenCalledWith(payload);
  });

  test('GET por id inexistente retorna 404', async () => {
    const token = createAccessToken({ roles: ['operator'], scopes: ['${resourceName}:read'] });
    ${serviceName}.getById.mockRejectedValue(new AppError(404, 'Not found'));

    const response = await request(app)
      .get('/api/${resourceName}/999999')
      .set('Authorization', 'Bearer ' + token);

    expect(response.status).toBe(404);
  });

  test('PUT com permissao de escrita retorna 200', async () => {
    const token = createAccessToken({ roles: ['operator'], scopes: ['${resourceName}:write'] });
    const payload = ${validPayloadLiteral};

    const response = await request(app)
      .put('/api/${resourceName}/1')
      .set('Authorization', 'Bearer ' + token)
      .send(payload);

    expect(response.status).toBe(200);
    expect(${serviceName}.update).toHaveBeenCalledWith('1', payload);
  });

  test('DELETE com perfil admin retorna 204', async () => {
    const token = createAccessToken({ roles: ['admin'], scopes: ['${resourceName}:delete'] });

    const response = await request(app)
      .delete('/api/${resourceName}/1')
      .set('Authorization', 'Bearer ' + token);

    expect(response.status).toBe(204);
    expect(${serviceName}.delete).toHaveBeenCalledWith('1');
  });

  describe('Matriz de cobertura recomendada', () => {
    test.todo('CREATE: criar com todos os campos opcionais e valores minimos');
    test.todo('CREATE: obrigatorio ausente, tipo invalido, formato invalido e limite excedido');
    test.todo('CREATE: duplicidade, FK inexistente e violacao de regra de negocio');
    test.todo('CREATE: token invalido e permissao insuficiente');

    test.todo('READ listagem: lista vazia, paginacao, ordenacao e filtros');
    test.todo('READ por id: id valido inexistente e id invalido');
    test.todo('READ seguranca: sem autenticacao e sem permissao');

    test.todo('UPDATE PUT/PATCH: sucesso total e parcial com dados validos');
    test.todo('UPDATE validacao: campo invalido, obrigatorio ausente no PUT e tipo incorreto');
    test.todo('UPDATE existencia: id inexistente e id invalido');
    test.todo('UPDATE regras: duplicidade e violacao de regra');
    test.todo('UPDATE seguranca: sem token, token invalido e sem permissao');

    test.todo('DELETE: sucesso, id inexistente e id invalido');
    test.todo('DELETE regras: dependencia FK e comportamento soft vs hard delete');
    test.todo('DELETE seguranca: sem autenticacao e sem permissao');

    test.todo('Integracao: fluxo completo criar->buscar->atualizar->deletar');
    test.todo('Integracao: consistencia no banco, rollback transacional e servicos externos');

    test.todo('Contrato: estrutura JSON, tipos, campos obrigatorios e compatibilidade OpenAPI');

    test.todo('Performance: latencia, carga, stress e volume');

    test.todo('Seguranca: SQL Injection, XSS, CSRF, rate limit, JWT/OAuth, roles/perfis e dados sensiveis');

    test.todo('Banco: persistencia, integridade referencial, indices e migracoes');

    test.todo('Idempotencia: repeticao de POST/PUT/DELETE conforme regra da API');

    test.todo('Edge cases: string vazia, null, extremos numericos, unicode e datas invalidas');

    test.todo('Headers/HTTP: status codes e headers obrigatorios (content-type, authorization, cache-control)');

    test.todo('Observabilidade: logs estruturados, monitoramento e tratamento de erros');
  });
});
`;
  },
};
