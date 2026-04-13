# MySQL Layered CRUD Generator

Este é um gerador de código Node.js que analisa seu banco de dados MySQL e gera uma API completa seguindo a arquitetura em camadas e princípios SOLID.

## Estrutura Gerada no `/dist`

O projeto gerado segue esta estrutura:

- `src/config`: Configurações de banco e ambiente.
- `src/controllers`: Camada de entrada (HTTP).
- `src/services`: Camada de lógica de negócio.
- `src/repositories`: Camada de acesso a dados (MySQL2 puro).
- `src/models`: Estruturas de dados.
- `src/routes`: Definição de endpoints.
- `src/middlewares`: Autenticação JWT, autorização RBAC por papel/escopo, correlação de requests e tratamento de erros.
- `src/docs/html`: Documentação HTML por entidade.
- `src/docs/swagger`: Especificação OpenAPI usada pelo Swagger UI.
- `src/utils`: Utilitários como logger.
- `tests`: Base de testes automatizados (Jest + Supertest) com matriz de cobertura CRUD, segurança e contrato.

## Como usar o Gerador

1. Configure o arquivo `.env` na pasta do gerador com as credenciais do seu banco.
2. Execute `npm install`.
3. Execute `node index.js`.
4. O código completo será gerado na pasta `/dist`.

## Como usar o Projeto Gerado

1. Entre na pasta `/dist`.
2. Execute `npm install`.
3. Configure o `.env` gerado.
4. Execute `npm start`.
5. Em ambiente local, acesse Swagger em `/api-docs` (exemplo: `http://localhost:3000/api-docs`).
6. Em produção, Swagger fica desabilitado por padrão (ou protegido por admin + allowlist de IP quando habilitado).
7. Se quiser consumir o OpenAPI em JSON, use `/api-docs.json` quando Swagger estiver habilitado.

## Baseline de Segurança Gerado

Toda API gerada já inclui controles genéricos reutilizáveis:

- JWT sem fallback inseguro e validação de claims (`iss`, `aud`, `sub`, `exp`, `iat`).
- Algoritmos JWT permitidos explicitamente (`JWT_ALGORITHMS`) e suporte a rotação por `kid` (`JWT_KEYS`, `JWT_ACTIVE_KID`).
- RBAC básico por rota com papéis (`admin`, `operator`, `read_only`) e escopos (`resource:read|write|delete`).
- Rate limit global, rate limit para rotas sensíveis e proteção de burst (slow down).
- Hardening HTTP com `helmet`, CORS por allowlist e `x-powered-by` desabilitado.
- Limites de payload JSON, query params e tamanho de URL.
- Correlation ID em request/response e logs estruturados com redação de dados sensíveis.

### Variáveis importantes do `.env` gerado

- `JWT_SECRET` (obrigatória, mínimo forte em produção)
- `JWT_ISSUER`, `JWT_AUDIENCE`, `JWT_ALGORITHMS`, `JWT_ACCESS_MAX_AGE`
- `JWT_KEYS`, `JWT_ACTIVE_KID` (opcional para rotação)
- `CORS_ALLOWED_ORIGINS`
- `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX`, `RATE_LIMIT_SENSITIVE_MAX`
- `SLOW_DOWN_WINDOW_MS`, `SLOW_DOWN_DELAY_AFTER`, `SLOW_DOWN_DELAY_MS`
- `API_JSON_LIMIT`, `API_MAX_QUERY_PARAMS`, `API_MAX_URL_LENGTH`
- `SWAGGER_ENABLED`, `SWAGGER_REQUIRE_ADMIN`, `SWAGGER_ALLOWED_IPS`
