const mysql = require('mysql2/promise');

/**
 * Responsável por ler metadados do banco MySQL e montar um schema normalizado.
 *
 * Fluxo:
 * 1. Abre conexão MySQL com a configuração recebida.
 * 2. Lista tabelas (`SHOW TABLES`).
 * 3. Para cada tabela, busca colunas (`DESCRIBE`) e chaves estrangeiras.
 * 4. Retorna um objeto schema usado pelos geradores.
 */
class Introspector {
  /**
   * @param {{ host: string, user: string, password: string, database: string, port?: number }} config
   * Configuração de conexão com banco.
   */
  constructor(config) {
    this.config = config;
  }

  /**
   * Coleta e normaliza o schema do banco.
   *
   * Requisitos:
   * - Banco acessível com credenciais válidas.
   * - Usuário com permissão de leitura de metadados.
   *
   * Comportamento:
   * - Cada tabela vira uma chave no retorno.
   * - Colunas e FKs são convertidas para formato padronizado do projeto.
   *
   * Possíveis erros:
   * - Erro de conexão (host, porta, credenciais).
   * - Erro de consulta SQL (permissão, schema inexistente, tabela inválida).
   * - Interrupção de rede durante introspecção.
   *
   * @returns {Promise<object>} Schema normalizado por tabela.
   */
  async getSchema() {
    const connection = await mysql.createConnection(this.config);
    const [tables] = await connection.query('SHOW TABLES');
    const dbName = this.config.database;
    const tableKey = `Tables_in_${dbName}`;

    const schema = {};

    for (const tableRow of tables) {
      const tableName = tableRow[tableKey];
      const [columns] = await connection.query(`DESCRIBE ${tableName}`);
      const [fks] = await connection.query(
        `
                SELECT 
                    COLUMN_NAME, 
                    REFERENCED_TABLE_NAME, 
                    REFERENCED_COLUMN_NAME 
                FROM 
                    INFORMATION_SCHEMA.KEY_COLUMN_USAGE 
                WHERE 
                    TABLE_SCHEMA = ? AND 
                    TABLE_NAME = ? AND 
                    REFERENCED_TABLE_NAME IS NOT NULL
            `,
        [dbName, tableName],
      );

      schema[tableName] = {
        columns: columns.map((col) => ({
          name: col.Field,
          type: col.Type,
          nullable: col.Null === 'YES',
          key: col.Key,
          default: col.Default,
          extra: col.Extra,
        })),
        foreignKeys: fks.map((fk) => ({
          column: fk.COLUMN_NAME,
          referencedTable: fk.REFERENCED_TABLE_NAME,
          referencedColumn: fk.REFERENCED_COLUMN_NAME,
        })),
      };
    }

    await connection.end();
    return schema;
  }

  /**
   * Exporta dados das tabelas informadas para geração de seed SQL.
   *
   * Requisitos:
   * - As tabelas devem existir no banco atual.
   * - Usuário precisa de permissão de SELECT.
   *
   * @param {string[]} tableNames Tabelas a serem exportadas.
   * @returns {Promise<Record<string, any[]>>} Mapa tabela -> linhas.
   */
  async getDataSnapshot(tableNames = []) {
    const connection = await mysql.createConnection(this.config);
    const snapshot = {};

    try {
      for (const tableName of tableNames) {
        const [rows] = await connection.query(`SELECT * FROM \`${tableName}\``);
        snapshot[tableName] = rows;
      }
    } finally {
      await connection.end();
    }

    return snapshot;
  }
}

module.exports = Introspector;
