const path = require('path');
const fs = require('fs-extra');
const BaseGenerator = require('../core/BaseGenerator');

/**
 * Gera arquivos estáticos únicos (não dependem de tabela individual).
 *
 * Fluxo:
 * 1. Resolve caminho absoluto do arquivo de destino.
 * 2. Garante a existência do diretório pai.
 * 3. Renderiza o conteúdo via template com contexto global.
 * 4. Escreve o arquivo final no disco.
 */
class StaticFileGenerator extends BaseGenerator {
  /**
   * @param {string} targetDir Diretório raiz de saída.
   * @param {string} relativePath Caminho relativo do arquivo final.
   * @param {(tables: string[], schema: object) => string} templateFn Função de template para arquivo único.
   * @param {boolean} [enabled=true] Se false, pula a geração deste arquivo.
   * @param {((tableName: string) => boolean)|null} [tablesFilter=null] Filtra tabelas antes de passar ao template.
   */
  constructor(targetDir, relativePath, templateFn, enabled = true, tablesFilter = null) {
    super(targetDir);
    this.relativePath = relativePath; // e.g., 'src/config/database.js'
    this.templateFn = templateFn;
    this.enabled = enabled;
    this.tablesFilter = tablesFilter;
  }

  /**
   * Gera o arquivo estático com base no schema completo.
   *
   * Requisitos:
   * - `templateFn` deve aceitar lista de tabelas e schema completo.
   * - `relativePath` deve ser um caminho válido de arquivo.
   *
   * Possíveis erros:
   * - Falha de escrita/permissão em disco.
   * - Erro de template ao montar conteúdo.
   *
   * @param {object} schema Schema completo do banco.
   * @returns {Promise<void>}
   */
  async generate(schema) {
    if (!this.enabled) return;

    const filteredSchema = this.tablesFilter
      ? Object.fromEntries(Object.entries(schema).filter(([t]) => this.tablesFilter(t)))
      : schema;

    const fullPath = path.join(this.targetDir, this.relativePath);
    await fs.ensureDir(path.dirname(fullPath));
    const content = this.templateFn(Object.keys(filteredSchema), filteredSchema);
    await fs.writeFile(fullPath, content);
  }
}

module.exports = StaticFileGenerator;
