/**
 * Classe base para todos os geradores de arquivo.
 *
 * Fluxo esperado:
 * 1. O engine instancia uma subclasse concreta com o diretório alvo.
 * 2. O engine chama `generate(schema)` após a introspecção do banco.
 *
 * Requisitos:
 * - Subclasses devem implementar `generate(schema)`.
 * - `targetDir` deve apontar para um caminho válido de escrita.
 */
class BaseGenerator {
  /**
   * @param {string} targetDir Diretório raiz onde os arquivos serão gerados.
   */
  constructor(targetDir) {
    this.targetDir = targetDir;
  }

  /**
   * Método abstrato para geração de artefatos.
   *
   * Comportamento:
   * - Deve ser sobrescrito por subclasses com a estratégia de geração.
   *
   * Possíveis erros:
   * - Lança erro caso a subclasse não implemente o método.
   *
   * @param {object} schema Esquema normalizado retornado pelo introspector.
   * @returns {Promise<void>}
   */
  async generate(schema) {
    throw new Error("Method 'generate()' must be implemented.");
  }
}

module.exports = BaseGenerator;
