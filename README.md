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
- `src/middlewares`: Autenticação JWT e tratamento de erros.
- `src/docs/html`: Documentação HTML por entidade.
- `src/docs/swagger`: Especificação OpenAPI usada pelo Swagger UI.
- `src/utils`: Utilitários como logger.

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
5. Acesse a documentação Swagger em `/api-docs` (exemplo: `http://localhost:3000/api-docs`).
6. Se quiser consumir o OpenAPI em JSON, use `/api-docs.json`.
