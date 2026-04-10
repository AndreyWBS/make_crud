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
};
