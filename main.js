const path = require("path");
const fs = require("fs-extra");
require("dotenv").config();

const Introspector = require("./src/core/Introspector");
const GeneratorEngine = require("./src/core/GeneratorEngine");
const LayerGenerator = require("./src/generators/LayerGenerator");
const StaticFileGenerator = require("./src/generators/StaticFileGenerator");

const crudTemplates = require("./src/templates/crudTemplates");
const infraTemplates = require("./src/templates/infraTemplates");
const validatorTemplates = require("./src/templates/validatorTemplates");

async function main() {
  const dbConfig = {
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306,
  };

  const targetDir = path.join(__dirname, "../dist");
  const targetDir_cli = path.join(__dirname, "../dist_cli");
  await fs.emptyDir(targetDir);
  await fs.emptyDir(targetDir_cli);

  const introspector = new Introspector(dbConfig);
  const engine = new GeneratorEngine(introspector);

  engine
    .addGenerator(new LayerGenerator(targetDir, "models", crudTemplates.model))
    .addGenerator(
      new LayerGenerator(targetDir, "repositories", crudTemplates.repository),
    )
    .addGenerator(
      new LayerGenerator(targetDir, "services", crudTemplates.service),
    )
    .addGenerator(
      new LayerGenerator(targetDir, "controllers", crudTemplates.controller),
    )
    .addGenerator(
      new LayerGenerator(
        targetDir,
        "middlewares/validators",
        validatorTemplates.validator,
      ),
    )
    .addGenerator(new LayerGenerator(targetDir, "routes", crudTemplates.routes))
    .addGenerator(
      new LayerGenerator(targetDir, "docs", crudTemplates.documentation, "md"),
    )
    .addGenerator(
      new LayerGenerator(
        targetDir,
        "docs/html",
        crudTemplates.documentationHtml,
        "html",
      ),
    )
    .addGenerator(
      new LayerGenerator(targetDir_cli, "apiClient", crudTemplates.apiClient),
    );

  engine
    .addGenerator(
      new StaticFileGenerator(
        targetDir,
        "src/config/database.js",
        infraTemplates.database,
      ),
    )
    .addGenerator(
      new StaticFileGenerator(
        targetDir,
        "src/config/env.js",
        infraTemplates.env,
      ),
    )
    .addGenerator(
      new StaticFileGenerator(
        targetDir,
        "src/middlewares/authMiddleware.js",
        infraTemplates.authMiddleware,
      ),
    )
    .addGenerator(
      new StaticFileGenerator(
        targetDir,
        "src/middlewares/errorMiddleware.js",
        infraTemplates.errorMiddleware,
      ),
    )
    .addGenerator(
      new StaticFileGenerator(
        targetDir,
        "src/docs/html/index.html",
        infraTemplates.indexDocumentation,
      ),
    )
    .addGenerator(
      new StaticFileGenerator(
        targetDir,
        "src/docs/swagger/swaggerSpec.js",
        infraTemplates.swaggerSpec,
      ),
    )
    .addGenerator(
      new StaticFileGenerator(
        targetDir,
        "src/utils/logger.js",
        infraTemplates.logger,
      ),
    )
    .addGenerator(
      new StaticFileGenerator(targetDir, "src/app.js", infraTemplates.app),
    )
    .addGenerator(
      new StaticFileGenerator(
        targetDir,
        "src/server.js",
        infraTemplates.server,
      ),
    )
    .addGenerator(
      new StaticFileGenerator(
        targetDir,
        "package.json",
        infraTemplates.packageJson,
      ),
    )
    .addGenerator(
      new StaticFileGenerator(targetDir, "env", infraTemplates.envfile),
    );

  await engine.run();
}

main().catch(console.error);

// Exemplo de uso:
