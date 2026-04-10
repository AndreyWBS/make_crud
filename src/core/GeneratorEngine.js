/**
 * Orquestra o pipeline de geração a partir do esquema do banco.
 *
 * Fluxo principal:
 * 1. Obtém o schema via `introspector.getSchema()`.
 * 2. Executa cada gerador registrado na ordem de cadastro.
 * 3. Finaliza quando todos os geradores concluírem sem erro.
 */
class GeneratorEngine {
  /**
   * @param {{ getSchema: () => Promise<object> }} introspector Dependência responsável por introspecção.
   */
  constructor(introspector) {
    this.introspector = introspector;
    this.generators = [];
  }

  /**
   * Registra um novo gerador no pipeline.
   *
   * Requisitos:
   * - O objeto deve possuir função assíncrona `generate(schema)`.
   *
   * Comportamento:
   * - Mantém ordem de inserção (ordem de execução).
   * - Retorna `this` para encadeamento fluente.
   *
   * @param {{ generate: (schema: object) => Promise<void> }} generator Gerador a ser executado.
   * @returns {GeneratorEngine}
   */
  addGenerator(generator) {
    this.generators.push(generator);
    return this;
  }

  /**
   * Executa o pipeline completo de geração.
   *
   * Requisitos:
   * - Introspector configurado e acessível ao banco.
   * - Ao menos um gerador registrado para produzir artefatos.
   *
   * Possíveis erros:
   * - Falha de conexão/consulta no introspector.
   * - Falha de escrita de arquivos nos geradores.
   * - Exceções de templates durante renderização.
   *
   * @returns {Promise<void>}
   */
  async run() {
    console.log("Starting introspection...");
    const schema = await this.introspector.getSchema();

    console.log("Executing generators...");
    for (const generator of this.generators) {
      await generator.generate(schema);
    }
    console.log("Generation finished successfully.");
  }
}

module.exports = GeneratorEngine;
