const path = require('path');
const fs = require('fs-extra');
const BaseGenerator = require('../core/BaseGenerator');
const { camelCase } = require('../utils/stringUtils');

/**
 * Gera arquivos por tabela em uma camada específica (ex.: controllers, services).
 *
 * Fluxo:
 * 1. Cria/garante diretório da camada em `targetDir/src/<layerName>`.
 * 2. Itera todas as tabelas do schema.
 * 3. Monta nome de arquivo com sufixo baseado na camada.
 * 4. Renderiza conteúdo via template e escreve em disco.
 */
class LayerGenerator extends BaseGenerator {
  /**
   * @param {string} targetDir Diretório raiz de saída.
   * @param {string} layerName Nome da camada (ex.: 'controllers').
   * @param {(tableName: string, tableSchema: object, fullSchema?: object, tableConfig?: object|null) => string} templateFn Função de template por tabela.
   * @param {string} [extention='js'] Extensão do arquivo gerado.
   * @param {Record<string, { enabled: boolean, routes: Record<string, boolean>, customRoutes?: any[] }>|null} [tablesConfig=null] Config por tabela. Se informado, filtra tabelas desabilitadas e passa config da tabela ao template.
   */
  constructor(targetDir, layerName, templateFn, extention = 'js', tablesConfig = null) {
    super(targetDir);
    this.layerName = layerName; // e.g., 'controllers'
    this.templateFn = templateFn;
    this.extention = extention;
    this.tablesConfig = tablesConfig;
  }

  /**
   * Gera arquivos da camada para todas as tabelas do schema.
   *
   * Requisitos:
   * - `schema` no formato retornado pelo introspector.
   * - `templateFn` deve retornar string válida de conteúdo.
   *
   * Possíveis erros:
   * - Falha ao criar diretórios ou escrever arquivos.
   * - Exceções internas de template ao renderizar conteúdo.
   *
   * @param {object} schema Schema completo do banco.
   * @returns {Promise<void>}
   */
  async generate(schema) {
    let tables = Object.keys(schema);

    if (this.tablesConfig) {
      tables = tables.filter((t) => this.tablesConfig[t]?.enabled !== false);
    }

    const layerPath = path.join(this.targetDir, 'src', this.layerName);
    await fs.ensureDir(layerPath);

    for (const table of tables) {
      const baseLayerName = path.basename(this.layerName);
      let suffix;
      if (baseLayerName.endsWith('s')) {
        suffix = baseLayerName.charAt(0).toUpperCase() + baseLayerName.slice(1, -1);
      } else {
        suffix = baseLayerName.charAt(0).toUpperCase() + baseLayerName.slice(1);
      }
      if (baseLayerName === 'repositories') suffix = 'Repository';
      const fileName = `${camelCase(table)}${suffix}.${this.extention}`;
      const tableConfig = this.tablesConfig ? (this.tablesConfig[table] ?? null) : null;
      const content = this.templateFn(table, schema[table], schema, tableConfig);
      await fs.writeFile(path.join(layerPath, fileName), content);
    }
  }
}

module.exports = LayerGenerator;
