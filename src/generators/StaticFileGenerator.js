const path = require("path");
const fs = require("fs-extra");
const BaseGenerator = require("../core/BaseGenerator");

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
   */
  constructor(targetDir, relativePath, templateFn) {
    super(targetDir);
    this.relativePath = relativePath; // e.g., 'src/config/database.js'
    this.templateFn = templateFn;
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
    const fullPath = path.join(this.targetDir, this.relativePath);
    await fs.ensureDir(path.dirname(fullPath));
    const content = this.templateFn(Object.keys(schema), schema);
    await fs.writeFile(fullPath, content);
  }
}

module.exports = StaticFileGenerator;
