const mysql = require('mysql2/promise');

class Introspector {
    constructor(config) {
        this.config = config;
    }

    async getSchema() {
        const connection = await mysql.createConnection(this.config);
        const [tables] = await connection.query('SHOW TABLES');
        const dbName = this.config.database;
        const tableKey = `Tables_in_${dbName}`;

        const schema = {};

        for (const tableRow of tables) {
            const tableName = tableRow[tableKey];
            const [columns] = await connection.query(`DESCRIBE ${tableName}`);
            const [fks] = await connection.query(`
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
            `, [dbName, tableName]);

            schema[tableName] = {
                columns: columns.map(col => ({
                    name: col.Field,
                    type: col.Type,
                    nullable: col.Null === 'YES',
                    key: col.Key,
                    default: col.Default,
                    extra: col.Extra
                })),
                foreignKeys: fks.map(fk => ({
                    column: fk.COLUMN_NAME,
                    referencedTable: fk.REFERENCED_TABLE_NAME,
                    referencedColumn: fk.REFERENCED_COLUMN_NAME
                }))
            };
        }

        await connection.end();
        return schema;
    }
}

module.exports = Introspector;
