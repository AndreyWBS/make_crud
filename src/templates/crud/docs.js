const { pascalCase, camelCase } = require('../../utils/stringUtils');

module.exports = {
  documentation: (tableName, schema) => {
    const className = pascalCase(tableName);
    const pk = schema.columns.find((c) => c.key === 'PRI')?.name || 'id';

    const getExampleValue = (type = 'string') => {
      const t = type.toLowerCase();
      if (
        t.includes('int') ||
        t.includes('float') ||
        t.includes('double') ||
        t.includes('decimal')
      ) {
        return 0;
      }
      if (t.includes('bool') || t === 'tinyint(1)') return true;
      if (t.includes('date') || t.includes('time')) return '2026-02-24T12:00:00Z';
      if (t.includes('json')) return { chave: 'valor_exemplo' };
      return `<${type}>`;
    };

    const exampleObject = {};
    schema.columns
      .filter((c) => c.name !== pk)
      .forEach((col) => {
        exampleObject[col.name] = getExampleValue(col.type);
      });

    const jsonExample = JSON.stringify(exampleObject, null, 2);
    const indentedJsonExample = jsonExample
      .split('\n')
      .map((line) => `  ${line}`)
      .join('\n')
      .trim();

    const searchDocs = schema.columns
      .filter((col) => col.name !== pk)
      .map((col) => {
        const routeName = col.name;
        return `### Buscar por ${pascalCase(routeName)}
Busca registros específicos baseados na coluna \`${routeName}\`.

- **Método:** \`GET\`
- **Rota:** \`/api/${tableName}/search/${routeName}/:value\`
- **Autenticação:** Requerida (Bearer Token)

**Parâmetros de Rota:**
| Nome | Tipo | Descrição |
|------|------|-----------|
| \`value\` | \`${col.type || 'string'}\` | Valor do campo ${routeName} para a busca |

**Exemplo de Resposta (Status 200):**
\`\`\`json
// ✍️ Insira o JSON de resposta esperado para a busca por ${routeName} aqui
{

}
\`\`\`
---`;
      })
      .join('\n\n');

    return `
# Documentação da API: ${className}

Bem-vindo à documentação dos endpoints para a entidade **${className}**.
> **Nota:** Todas as rotas abaixo requerem autenticação e validação prévia via middlewares (\`authMiddleware\` e \`${camelCase(tableName)}Validator\`).

---

## 📌 Índice de Rotas
1. [Listar Todos](#listar-todos)
2. [Buscar por ID](#buscar-por-id)
3. [Buscar por ID com Relacionamentos](#buscar-por-id-com-relacionamentos)
4. [Criar Novo](#criar-novo)
5. [Criar em Lote (Bulk)](#criar-em-lote-bulk)
6. [Atualizar](#atualizar)
7. [Deletar](#deletar)
8. [Buscas Específicas](#buscas-específicas)

---

### Listar Todos
Retorna uma lista paginada de registros de ${className}. Suporta filtros dinâmicos via *query parameters*.

- **Método:** \`GET\`
- **Rota:** \`/api/${tableName}\`
- **Autenticação:** Requerida

**Query Parameters (Opcionais):**
| Parâmetro | Tipo | Padrão | Descrição |
|-----------|------|--------|-----------|
| \`page\` | \`int\` | 1 | Número da página atual |
| \`limit\` | \`int\` | 10 | Quantidade de itens por página |
| \`[coluna]\` | \`any\` | - | Passe o nome de qualquer coluna para filtrar (ex: \`?status=ativo\`) |

**Exemplo de Resposta (Status 200):**
\`\`\`json
// ✍️ Insira o JSON da resposta paginada aqui (incluindo "data", "meta" e "links")
{

}
\`\`\`

---

### Buscar por ID
Retorna um único registro pelo seu \`${pk}\` exclusivo.

- **Método:** \`GET\`
- **Rota:** \`/api/${tableName}/:id\`
- **Autenticação:** Requerida

**Parâmetros de Rota:**
| Nome | Tipo | Descrição |
|------|------|-----------|
| \`id\` | \`identificador\` | O identificador único do registro |

**Exemplo de Resposta (Status 200):**
\`\`\`json
// ✍️ Insira o JSON de resposta de um único item aqui
{

}
\`\`\`

---

### Buscar por ID com Relacionamentos
Retorna um único registro incluindo relações encadeadas em JSON (pais e filhos), com controle de profundidade.

- **Método:** \`GET\`
- **Rota:** \`/api/${tableName}/:id/relations\`
- **Autenticação:** Requerida

**Parâmetros de Rota:**
| Nome | Tipo | Descrição |
|------|------|-----------|
| \`id\` | \`identificador\` | O identificador único do registro raiz |

**Query Parameters (Opcionais):**
| Parâmetro | Tipo | Padrão | Descrição |
|-----------|------|--------|-----------|
| \`depth\` | \`int\` | 2 | Profundidade máxima de encadeamento (0 a 5) |

**Exemplo de Resposta (Status 200):**
\`\`\`json
// ✍️ Insira o JSON de resposta com "relationships.belongsTo" e "relationships.hasMany"
{

}
\`\`\`

---

### Criar Novo
Cadastra um novo registro de ${className} no sistema.

- **Método:** \`POST\`
- **Rota:** \`/api/${tableName}\`
- **Autenticação:** Requerida

**Exemplo de Request Body:**
\`\`\`json
${jsonExample}
\`\`\`

**Exemplo de Resposta (Status 201):**
\`\`\`json
// ✍️ Insira o JSON de resposta após a criação (com ID inserido) aqui
{

}
\`\`\`

---

### Criar em Lote (Bulk)
Cadastra múltiplos registros de ${className} simultaneamente através de um Array.

- **Método:** \`POST\`
- **Rota:** \`/api/${tableName}/bulk\`
- **Autenticação:** Requerida

**Exemplo de Request Body:**
\`\`\`json
[
  ${indentedJsonExample},
  ${indentedJsonExample}
]
\`\`\`

**Exemplo de Resposta (Status 201):**
\`\`\`json
// ✍️ Insira o JSON de resposta esperado (ex: { "affectedRows": 2 })
{

}
\`\`\`

---

### Atualizar
Atualiza os dados de um registro existente baseado no seu \`${pk}\`.

- **Método:** \`PUT\`
- **Rota:** \`/api/${tableName}/:id\`
- **Autenticação:** Requerida

**Exemplo de Request Body:**
*(Envie apenas os campos que deseja atualizar ou o objeto completo)*
\`\`\`json
${jsonExample}
\`\`\`

**Exemplo de Resposta (Status 200):**
\`\`\`json
// ✍️ Insira o JSON de resposta após atualização aqui
{

}
\`\`\`

---

### Deletar
Remove permanentemente um registro do banco de dados pelo seu \`${pk}\`.

- **Método:** \`DELETE\`
- **Rota:** \`/api/${tableName}/:id\`
- **Autenticação:** Requerida

**Exemplo de Resposta (Status 204):**
\`\`\`text
// Resposta vazia (No Content). Sucesso, sem corpo de resposta.
\`\`\`

---

## 🔍 Buscas Específicas
Abaixo estão listadas as rotas dinâmicas geradas automaticamente para consultas rápidas em colunas específicas de ${className}.

${searchDocs}
`;
  },

  documentationHtml: (tableName, schema) => {
    const className = pascalCase(tableName);
    const pk = schema.columns.find((c) => c.key === 'PRI')?.name || 'id';

    const getExampleValue = (type = 'string') => {
      const t = type.toLowerCase();
      if (
        t.includes('int') ||
        t.includes('float') ||
        t.includes('double') ||
        t.includes('decimal')
      ) {
        return 0;
      }
      if (t.includes('bool') || t === 'tinyint(1)') return true;
      if (t.includes('date') || t.includes('time')) return '2026-02-24T12:00:00Z';
      if (t.includes('json')) return { chave: 'valor_exemplo' };
      return `exemplo_${type}`;
    };

    const exampleObject = {};
    schema.columns
      .filter((c) => c.name !== pk)
      .forEach((col) => {
        exampleObject[col.name] = getExampleValue(col.type);
      });

    const jsonExample = JSON.stringify(exampleObject, null, 2);
    const bulkExample = JSON.stringify([exampleObject, exampleObject], null, 2);

    const searchAccordionItems = schema.columns
      .filter((col) => col.name !== pk)
      .map(
        (col, index) => `
                <div class="accordion-item">
                    <h2 class="accordion-header" id="headingSearch${index}">
                        <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#collapseSearch${index}">
                            <span class="badge bg-success me-2">GET</span> /search/${col.name}/:value
                        </button>
                    </h2>
                    <div id="collapseSearch${index}" class="accordion-collapse collapse" data-bs-parent="#searchAccordion">
                        <div class="accordion-body">
                            <p>Busca registros pela coluna <strong>${col.name}</strong>.</p>
                            <table class="table table-sm">
                                <thead><tr><th>Parâmetro</th><th>Tipo</th><th>Descrição</th></tr></thead>
                                <tbody><tr><td><code>value</code></td><td><code>${col.type}</code></td><td>Valor para filtro exato</td></tr></tbody>
                            </table>
                        </div>
                    </div>
                </div>`,
      )
      .join('');

    return `
<!DOCTYPE html>
<html lang="pt-br">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>API Docs - ${className}</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <link href="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/themes/prism-tomorrow.min.css" rel="stylesheet" />
    <style>
        body { background-color: #f8f9fa; }
        .sidebar { height: 100vh; position: sticky; top: 0; padding-top: 2rem; border-right: 1px solid #dee2e6; z-index: 100; }
        .endpoint-card { margin-bottom: 2.5rem; border-left: 5px solid #ccc; scroll-margin-top: 2rem; }
        .method-badge { min-width: 85px; text-align: center; font-weight: bold; }
        .bg-get { border-left-color: #198754; }
        .bg-post { border-left-color: #0d6efd; }
        .bg-put { border-left-color: #fd7e14; }
        .bg-delete { border-left-color: #dc3545; }
        pre { border-radius: 8px; max-height: 400px; }
        .nav-link:hover { background-color: #e9ecef; }
    </style>
</head>
<body>
    <div class="container-fluid">
        <div class="row">
            <nav class="col-md-3 col-lg-2 d-md-block sidebar bg-white">
                <div class="position-sticky">
                    <h5 class="px-3 mb-4 text-primary">🚀 ${className} API</h5>
                    <ul class="nav flex-column">
                        <li class="nav-item"><a class="nav-link text-dark" href="#listar">Listar Todos</a></li>
                        <li class="nav-item"><a class="nav-link text-dark" href="#buscar-id">Buscar por ID</a></li>
                        <li class="nav-item"><a class="nav-link text-dark" href="#buscar-relacoes">Buscar por ID com Relacionamentos</a></li>
                        <li class="nav-item"><a class="nav-link text-dark" href="#criar">Criar Novo</a></li>
                        <li class="nav-item"><a class="nav-link text-dark" href="#bulk">Criar em Lote (Bulk)</a></li>
                        <li class="nav-item"><a class="nav-link text-dark" href="#atualizar">Atualizar</a></li>
                        <li class="nav-item"><a class="nav-link text-dark" href="#deletar">Deletar</a></li>
                        <li class="nav-item"><a class="nav-link text-dark" href="#buscas">Buscas Específicas</a></li>
                    </ul>
                </div>
            </nav>

            <main class="col-md-9 ms-sm-auto col-lg-10 px-md-4 py-4">
                <div class="d-flex justify-content-between flex-wrap flex-md-nowrap align-items-center pt-3 pb-2 mb-4 border-bottom">
                    <h1 class="h2">Documentação: ${className}</h1>
                </div>

                <section id="listar" class="card endpoint-card bg-get shadow-sm">
                    <div class="card-body">
                        <div class="d-flex align-items-center mb-3">
                            <span class="badge bg-success method-badge me-2">GET</span>
                            <h4 class="mb-0">/api/${tableName}</h4>
                        </div>
                        <p>Retorna uma lista paginada de registros com links de navegação HATEOAS.</p>
                        <h6>Parâmetros de Query (Opcionais):</h6>
                        <ul>
                            <li><code>page</code> (int): Página atual (Default: 1)</li>
                            <li><code>limit</code> (int): Itens por página (Default: 10)</li>
                            <li><code>[coluna]</code>: Filtre por qualquer campo da tabela.</li>
                        </ul>
                    </div>
                </section>

                <section id="buscar-id" class="card endpoint-card bg-get shadow-sm mt-4">
                    <div class="card-body">
                        <div class="d-flex align-items-center mb-3">
                            <span class="badge bg-success method-badge me-2">GET</span>
                            <h4 class="mb-0">/api/${tableName}/:id</h4>
                        </div>
                        <p>Recupera os detalhes completos de um registro através do seu ID único.</p>
                    </div>
                </section>

                <section id="buscar-relacoes" class="card endpoint-card bg-get shadow-sm mt-4">
                    <div class="card-body">
                        <div class="d-flex align-items-center mb-3">
                            <span class="badge bg-success method-badge me-2">GET</span>
                            <h4 class="mb-0">/api/${tableName}/:id/relations</h4>
                        </div>
                        <p>Retorna o registro com relacionamentos encadeados em JSON.</p>
                        <ul>
                            <li><code>depth</code> (int): profundidade máxima do encadeamento (0 a 5, padrão 2).</li>
                        </ul>
                    </div>
                </section>

                <section id="criar" class="card endpoint-card bg-post shadow-sm mt-4">
                    <div class="card-body">
                        <div class="d-flex align-items-center mb-3">
                            <span class="badge bg-primary method-badge me-2">POST</span>
                            <h4 class="mb-0">/api/${tableName}</h4>
                        </div>
                        <h6>Payload de Exemplo:</h6>
                        <pre><code class="language-json">${jsonExample}</code></pre>
                    </div>
                </section>

                <section id="bulk" class="card endpoint-card bg-post shadow-sm mt-4">
                    <div class="card-body">
                        <div class="d-flex align-items-center mb-3">
                            <span class="badge bg-primary method-badge me-2">POST</span>
                            <h4 class="mb-0">/api/${tableName}/bulk</h4>
                        </div>
                        <p>Inserção massiva de dados. Envie um array de objetos.</p>
                        <pre><code class="language-json">${bulkExample}</code></pre>
                    </div>
                </section>

                <section id="atualizar" class="card endpoint-card bg-put shadow-sm mt-4">
                    <div class="card-body">
                        <div class="d-flex align-items-center mb-3">
                            <span class="badge bg-warning text-dark method-badge me-2">PUT</span>
                            <h4 class="mb-0">/api/${tableName}/:id</h4>
                        </div>
                        <p>Atualiza campos específicos ou o objeto completo do registro indicado pelo ID.</p>
                        <pre><code class="language-json">${jsonExample}</code></pre>
                    </div>
                </section>

                <section id="deletar" class="card endpoint-card bg-delete shadow-sm mt-4">
                    <div class="card-body">
                        <div class="d-flex align-items-center mb-3">
                            <span class="badge bg-danger method-badge me-2">DELETE</span>
                            <h4 class="mb-0">/api/${tableName}/:id</h4>
                        </div>
                        <p>Remove o registro permanentemente do banco de dados. Retorna Status 204 (No Content) em caso de sucesso.</p>
                    </div>
                </section>

                <section id="buscas" class="mt-5 pt-4 border-top">
                    <h3 class="mb-3">Buscas Específicas</h3>

                    <div class="accordion shadow-sm" id="searchAccordion">
                        ${searchAccordionItems}
                    </div>
                </section>

                <footer class="mt-5 py-3 text-center text-muted border-top">
                    Documentação gerada em ${new Date().toLocaleDateString('pt-BR')}
                </footer>
            </main>
        </div>
    </div>

    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/prism.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-json.min.js"></script>
</body>
</html>
`;
  },
};
