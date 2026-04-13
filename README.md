# gerador-crud

Gerador CLI para criar APIs CRUD em Node.js a partir de bancos MySQL, com arquitetura em camadas, documentacao, testes e migracoes.

## Instalacao global

```bash
npm install -g gerador-crud
```

## Fluxo basico

1. Crie uma pasta para guardar os arquivos de entrada do gerador.
2. Adicione um arquivo `.env` nessa pasta com as credenciais do banco.
3. Rode `gerador-crud --init` para criar ou atualizar primeiro o `db.config.json` e depois o `api.config.json`.
4. Ajuste o `db.config.json` e o `api.config.json`.
5. Rode `gerador-crud` para gerar o projeto.

Por padrao:

- entrada: diretorio atual
- saida: `dist` dentro do diretorio atual (quando `--output` nao for informado)
- banco: `db.config.json` dentro do diretorio de entrada
- config: `api.config.json` dentro do diretorio de entrada
- env: `.env` dentro do diretorio de entrada

## Flags da CLI

```bash
gerador-crud --init
gerador-crud --input ./meu-projeto
gerador-crud --input ./entrada --output ./saida
gerador-crud --input ./entrada --db-config ./configs/db.config.json
gerador-crud --input ./entrada --config ./configs/api.config.json --env ./configs/.env
gerador-crud --input ./entrada --lang pt
```

Flags suportadas:

- `--input`, `-i`: diretorio de entrada
- `--output`, `-o`: diretorio onde os projetos gerados serao salvos
- `--db-config`, `-b`: caminho do JSON com as conexoes dos bancos
- `--config`, `-c`: caminho do `api.config.json`
- `--env`, `-e`: caminho do arquivo `.env`
- `--lang`, `-l`: idioma das mensagens de erro da API gerada (`en` ou `pt`)
- `--dir`, `-d`: alias legado para `--input`
- `--init`: introspecta os bancos e cria ou atualiza os arquivos de configuracao

## Ordem de criacao dos arquivos

Ao rodar `gerador-crud --init`, a CLI executa nesta ordem:

1. cria ou atualiza o `db.config.json`
2. introspecta todos os bancos configurados nesse arquivo
3. cria ou atualiza o `api.config.json`

## Exemplo de db.config.json com um banco

```json
{
  "defaultDatabase": "default",
  "databases": {
    "default": {
      "host": "localhost",
      "user": "root",
      "password": "sua_senha",
      "database": "meu_banco",
      "port": 3306
    }
  }
}
```

## Exemplo de db.config.json com varios bancos

```json
{
  "defaultDatabase": "core",
  "databases": {
    "core": {
      "host": "localhost",
      "user": "root",
      "password": "senha_core",
      "database": "core_db",
      "port": 3306
    },
    "audit": {
      "host": "localhost",
      "user": "root",
      "password": "senha_audit",
      "database": "audit_db",
      "port": 3306
    }
  }
}
```

## Exemplo de api.config.json com varios bancos

```json
{
  "global": {
    "language": "en",
    "swagger": true,
    "docs_md": true,
    "docs_html": true,
    "docs_technical": true,
    "tests": true,
    "prettier": true,
    "databaseConfig": {
      "preferEnvCredentials": true
    },
    "migrations": {
      "enabled": true,
      "includeSourceData": false
    }
  },
  "defaultDatabase": "core",
  "databases": {
    "core": {
      "enabled": true,
      "outputDir": "core",
      "tables": {
        "users": {
          "enabled": true,
          "routes": {
            "getAll": true,
            "getById": true,
            "getByIdWithRelations": true,
            "create": true,
            "createBulk": true,
            "update": true,
            "updateBulk": true,
            "delete": true,
            "deleteBulk": true,
            "search": true
          },
          "customRoutes": []
        }
      }
    },
    "audit": {
      "enabled": true,
      "outputDir": "audit",
      "tables": {
        "logs": {
          "enabled": true,
          "routes": {
            "getAll": true,
            "getById": true,
            "getByIdWithRelations": true,
            "create": true,
            "createBulk": true,
            "update": true,
            "updateBulk": true,
            "delete": true,
            "deleteBulk": true,
            "search": true
          },
          "customRoutes": []
        }
      }
    }
  }
}
```

## Como funciona a geracao multi-banco

- cada banco configurado em `db.config.json` e introspectado no `--init`
- cada banco aparece em `api.config.json` dentro de `databases`
- cada banco habilitado gera um projeto separado na saida
- se houver mais de um banco habilitado, o gerador cria uma subpasta por banco dentro de `dist`
- se houver apenas um banco habilitado, o projeto continua sendo gerado diretamente em `dist`

## Flag para credenciais do .env

No `api.config.json`, a flag abaixo controla a prioridade entre `.env` e `db.config.json`:

```json
{
  "global": {
    "databaseConfig": {
      "preferEnvCredentials": true
    }
  }
}
```

Comportamento:

- `true`: os valores vindos do `.env` sempre sobrescrevem os do `db.config.json`
- `false`: o `db.config.json` tem prioridade e o `.env` nao sobrescreve os valores existentes

O padrao agora e `true`.

## Exemplo de uso com varios bancos

```bash
gerador-crud --input ./generator-config --output ./apps --init
gerador-crud --input ./generator-config --output ./apps
```

Nesse cenario:

- a CLI le `.env`, `db.config.json` e `api.config.json` em `./generator-config`
- se `core` e `audit` estiverem habilitados, o resultado sera algo como:
  - `./apps/core`
  - `./apps/audit`

## Exemplo de .env

```env
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=sua_senha
DB_NAME=meu_banco
DB_PORT=3306
AUTO_INSTALL_AND_FORMAT=true
MIGRATIONS_INCLUDE_SOURCE_DATA=false
DEBUG=false
```

Observacao:

- o `.env` pode sobrescrever as credenciais do `db.config.json` quando `global.databaseConfig.preferEnvCredentials=true`
- para varios bancos, o arquivo principal passa a ser o `db.config.json`

## Estrutura do projeto gerado

- `src/config`
- `src/controllers`
- `src/services`
- `src/repositories`
- `src/models`
- `src/routes`
- `src/middlewares`
- `src/docs`
- `tests`
- `migrations`
- `api-client`

## Migracoes

Quando habilitadas no `api.config.json`, cada projeto gerado inclui:

- `migrations/001_schema.sql`
- `migrations/002_seed.sql`
- `src/scripts/migrate.js`
- `src/scripts/create-seed.js`

Comandos no projeto gerado:

```bash
npm run migrate
npm run migrate:with-seed
npm run migrate:with-seed 002
npm run migrate:dry-run
npm run seed:new nome_da_seed
```

## Observacoes

- o diretorio de saida base e limpo antes de uma nova geracao
- a instalacao de dependencias roda em cada projeto gerado
- se `AUTO_INSTALL_AND_FORMAT=false`, o gerador apenas escreve os arquivos
