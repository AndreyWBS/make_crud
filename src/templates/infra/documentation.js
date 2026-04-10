const { camelCase } = require("../../utils/stringUtils");

module.exports = {
  indexDocumentation: (tables) => {
    const tableLinks = tables
      .map((t) => {
        const className = t.charAt(0).toUpperCase() + t.slice(1);
        const fileName = `${camelCase(t)}Html.html`;
        return `
                <div class="col-md-4 mb-4">
                    <div class="card h-100 shadow-sm table-card">
                        <div class="card-body text-center">
                            <div class="icon-box mb-3">
                                <span class="fs-1">📂</span>
                            </div>
                            <h5 class="card-title">${className}</h5>
                            <p class="card-text text-muted small">Gerenciamento de endpoints para a tabela <code>${t}</code>.</p>
                            <a href="./${fileName}" class="btn btn-outline-primary stretched-link">Ver Documentação</a>
                        </div>
                    </div>
                </div>`;
      })
      .join("");

    return `
<!DOCTYPE html>
<html lang="pt-br">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Índice da API - Documentação</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <style>
        body { background-color: #f4f7f6; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
        .hero { background: linear-gradient(135deg, #0d6efd 0%, #003d99 100%); color: white; padding: 60px 0; margin-bottom: 40px; }
        .table-card { transition: transform 0.2s, shadow 0.2s; border: none; }
        .table-card:hover { transform: translateY(-5px); box-shadow: 0 10px 20px rgba(0,0,0,0.1) !important; }
        .icon-box { background-color: #e7f1ff; width: 80px; height: 80px; line-height: 80px; border-radius: 50%; margin: 0 auto; }
        footer { margin-top: 50px; color: #6c757d; }
    </style>
</head>
<body>

    <header class="hero text-center">
        <div class="container">
            <h1 class="display-4 fw-bold">Portal da API</h1>
            <p class="lead">Índice centralizado de documentação técnica dos recursos</p>
        </div>
    </header>

    <main class="container">
        <div class="row mb-4">
            <div class="col-12">
                <h3 class="border-bottom pb-2 mb-4">Entidades Disponíveis</h3>
            </div>
        </div>

        <div class="row">
            ${tableLinks}
        </div>
    </main>

    <footer class="container text-center py-4">
        <hr>
        <p>Gerado em ${new Date().getFullYear()}</p>
    </footer>

    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
</body>
</html>
`;
  },

  architectureOverviewMd: (tables) => {
    const tableCount = Array.isArray(tables) ? tables.length : 0;
    return `# Arquitetura da API Gerada

## Objetivo

Este documento descreve a arquitetura base da API gerada, com foco em fluxo de execução, requisitos de configuração, pontos de observabilidade e responsabilidades dos módulos de infraestrutura.

> Escopo: infraestrutura e comportamento transversal. Os detalhes de CRUD por entidade ficam na documentação específica já gerada por recurso.

## Estrutura principal

- src/server.js: bootstrap do processo HTTP.
- src/app.js: composição de middlewares globais, rotas e tratamento de erros.
- src/config/env.js: leitura e validação de variáveis de ambiente.
- src/config/database.js: criação e gerenciamento do pool MySQL.
- src/middlewares: autenticação, autorização, correlação de requisição, logs e erros.
- src/utils: utilitários transversais (logger, AppError, paginação).

## Fluxo macro de uma requisição

1. Request chega no Express em src/app.js.
2. Middleware de contexto define correlationId (ou reaproveita header recebido).
3. Middleware de request logging registra status, latência e metadados.
4. Camada de hardening HTTP aplica headers e política de CORS.
5. Regras de abuso aplicam rate limit e slow down.
6. Rotas da API são resolvidas e passam por autenticação/autorização.
7. Erros operacionais ou inesperados são normalizados no errorMiddleware.

## Requisitos mínimos de execução

- Banco MySQL acessível com credenciais válidas.
- Variáveis de ambiente obrigatórias preenchidas (especialmente autenticação em produção).
- Dependências instaladas com npm install.

## Segurança por padrão

- JWT validado com claims obrigatórias e algoritmo configurado.
- RBAC/escopos por rota via authorizeMiddleware.
- Swagger controlado por ambiente e políticas de acesso.
- Redação de dados sensíveis no logger.

## Observabilidade

- Todos os logs são estruturados em JSON.
- Eventos principais: server.started, http.request, request.error.
- correlationId em resposta e logs para rastreabilidade ponta a ponta.

## Resumo do contexto gerado

- Quantidade de recursos detectados no schema: ${tableCount}
`;
  },

  requestFlowMd: () => `# Fluxo Técnico da Requisição

## Ordem de execução dos middlewares globais

1. requestContextMiddleware
2. requestLoggerMiddleware
3. helmet
4. cors
5. express.json (com limite configurável)
6. validação de limite de query params e URL
7. rate limit global + slow down
8. rate limit de rotas sensíveis
9. rotas /api/*
10. errorMiddleware

## Fluxo de autenticação e autorização

1. authMiddleware extrai token Bearer.
2. Verifica segredo (ou chave por kid) e valida JWT.
3. Claims obrigatórias são verificadas.
4. authorizeMiddleware avalia papel e escopo por endpoint.

Observação:
- Se AUTH_DISABLED=true em ambiente não produtivo, auth e authorize fazem bypass para facilitar desenvolvimento local.

## Requisitos por tipo de endpoint

- Endpoints de API:
    - Header Authorization quando autenticação está ativa.
    - Payload JSON respeitando API_JSON_LIMIT.
    - Query params respeitando API_MAX_QUERY_PARAMS.
- Endpoints de documentação (Swagger):
    - Dependem de SWAGGER_ENABLED.
    - Podem exigir admin e allowlist de IP.

## Saída padronizada de erro

Formato geral:

{
    "status": 4xx/5xx,
    "error": "Nome HTTP",
    "message": "Mensagem segura",
    "correlationId": "uuid"
}

## Fluxo de persistência

1. Service valida regras de entrada e paginação.
2. Repository executa query parametrizada com timeout.
3. Erros SQL sobem para errorMiddleware e são normalizados.
`,

  errorCatalogMd: () => `# Catálogo de Erros e Tratativas

## Estratégia de erro

- Erros operacionais: lançados com AppError e status explícito.
- Erros de banco conhecidos: mapeados para status HTTP sem vazar detalhes internos.
- Erros inesperados: retornam 500 com mensagem genérica.

## Principais status retornados

- 400 Bad Request
    - JSON inválido
    - Parâmetros fora do formato esperado
- 401 Unauthorized
    - Token ausente, inválido ou expirado
    - Claims JWT obrigatórias ausentes
- 403 Forbidden
    - Usuário autenticado sem papel/escopo necessário
- 409 Conflict
    - Violação de unicidade ou referência em uso
- 422 Unprocessable Entity
    - Violação de integridade referencial/valor inválido para coluna
- 429 Too Many Requests
    - Excedeu limites de abuso
- 500 Internal Server Error
    - Falha não mapeada

## Erros MySQL mapeados

- ER_DUP_ENTRY -> 409
- ER_NO_REFERENCED_ROW_2 -> 422
- ER_ROW_IS_REFERENCED_2 -> 409
- ER_BAD_FIELD_ERROR -> 400
- ER_PARSE_ERROR -> 400
- ER_DATA_TOO_LONG -> 422
- ER_TRUNCATED_WRONG_VALUE -> 422

## Como investigar incidentes

1. Capturar correlationId retornado ao cliente.
2. Buscar o mesmo correlationId nos logs JSON.
3. Analisar evento request.error para causa raiz.
4. Correlacionar com evento http.request para latência e status.

## Boas práticas para consumidores da API

- Tratar 401 e 403 de forma separada no cliente.
- Implementar retry com backoff apenas para falhas transitórias.
- Não exibir mensagens técnicas diretamente para usuário final.
`,

  middlewaresIndexMd: () => `# Middlewares da API

Este diretório documenta os middlewares transversais da API gerada.

## Índice

1. [authMiddleware](./01-auth-middleware.md)
2. [authorizeMiddleware](./02-authorize-middleware.md)
3. [requestContextMiddleware](./03-request-context-middleware.md)
4. [requestLoggerMiddleware](./04-request-logger-middleware.md)
5. [errorMiddleware](./05-error-middleware.md)

## Ordem típica de execução

1. requestContextMiddleware
2. requestLoggerMiddleware
3. authMiddleware (em rotas protegidas)
4. authorizeMiddleware (em rotas com política de acesso)
5. errorMiddleware (sempre por último)
`,

  authMiddlewareMd: () => `# authMiddleware

## Responsabilidade

Validar autenticação baseada em Bearer JWT e anexar contexto de identidade em req.

## Fluxo

1. Extrai token do header Authorization.
2. Resolve segredo ativo (JWT_SECRET ou JWT_KEYS por kid).
3. Valida assinatura e claims do token.
4. Define req.auth e req.userId.
5. Continua o fluxo com next().

## Requisitos

- Header Authorization no formato Bearer <token>.
- Configuração JWT válida no env.
- Em produção, segredo forte e sem fallback inseguro.

## Comportamento especial

- Se AUTH_DISABLED=true (não produção), faz bypass de autenticação para uso local.

## Possíveis erros

- 401 Unauthorized:
    - Header ausente ou malformado.
    - Token inválido, expirado ou sem claims obrigatórias.
    - kid ausente/inválido quando rotação está ativa.
`,

  authorizeMiddlewareMd: () => `# authorizeMiddleware

## Responsabilidade

Aplicar autorização por papel (role) e escopo (scope) por endpoint.

## Fluxo

1. Recebe política da rota (anyRole, anyScope).
2. Lê papéis e escopos de req.auth.
3. Verifica se ao menos um papel e/ou escopo exigido foi atendido.
4. Em sucesso, chama next().

## Requisitos

- authMiddleware executado antes para preencher req.auth.
- Rotas devem declarar política de acesso coerente.

## Comportamento especial

- Se AUTH_DISABLED=true, autorização também faz bypass para evitar 403 em ambiente local.

## Possíveis erros

- 403 Forbidden:
    - Usuário autenticado sem papel exigido.
    - Usuário autenticado sem escopo exigido.
`,

  requestContextMiddlewareMd: () => `# requestContextMiddleware

## Responsabilidade

Garantir correlationId por requisição para rastreabilidade ponta a ponta.

## Fluxo

1. Verifica x-correlation-id ou x-request-id no header.
2. Se não existir, gera UUID.
3. Define req.id.
4. Retorna o ID no header x-correlation-id da resposta.

## Requisitos

- Deve rodar no início da cadeia de middlewares.

## Possíveis erros

- Não costuma lançar erro funcional.
- Falhas seriam atípicas (ex.: runtime comprometido para geração de UUID).
`,

  requestLoggerMiddlewareMd: () => `# requestLoggerMiddleware

## Responsabilidade

Emitir log estruturado da requisição após conclusão da resposta.

## Fluxo

1. Captura timestamp de início.
2. Aguarda evento finish da resposta.
3. Calcula latência e escolhe nível por status HTTP.
4. Registra evento http.request com metadados.

## Campos de log

- correlationId
- method
- path
- statusCode
- durationMs
- userId
- ip

## Requisitos

- requestContextMiddleware deve estar ativo para correlationId consistente.

## Possíveis erros

- Não bloqueia resposta em caso de falha de log.
- Erros de stdout/stderr podem afetar observabilidade, não o contrato HTTP.
`,

  errorMiddlewareMd: () => `# errorMiddleware

## Responsabilidade

Centralizar tratamento de erros e padronizar resposta HTTP segura.

## Fluxo

1. Registra evento request.error com contexto da falha.
2. Trata AppError como erro operacional conhecido.
3. Mapeia erros MySQL conhecidos para status apropriado.
4. Trata erros JWT e payload JSON inválido.
5. Aplica fallback 500 para falhas não mapeadas.

## Requisitos

- Deve ser o último middleware registrado no app.

## Contrato de erro

Formato padrão:

{
    "status": 4xx/5xx,
    "error": "Nome HTTP",
    "message": "Mensagem segura",
    "correlationId": "uuid"
}

## Possíveis erros cobertos

- 400, 401, 403, 409, 422, 429, 500.
- Em produção, evita exposição de detalhes internos.
`,
};
