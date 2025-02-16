import { Table } from './Table.js';
/**
 * A schema is a collection of tables. It is used to define the structure of a database.
 */
export class Schema {
    /*
      Only available when constructing with mapped typed definition columns
    */
    types;
    props;
    tables;
    constructor(tables) {
        if (Array.isArray(tables)) {
            /*
              We need to validate that the tables have a name here because a user could pass in an array
              of Tables that don't have a name because they are using the V2 syntax.
              Therefore, 'convertToClassicTables' won't be called on the tables resulting in a runtime error.
            */
            for (const table of tables) {
                if (table.name === '') {
                    throw new Error("It appears you are trying to create a new Schema with an array instead of an object. Passing in an object instead of an array into 'new Schema()' may resolve your issue.");
                }
            }
            this.tables = tables;
        }
        else {
            this.props = tables;
            this.tables = this.convertToClassicTables(this.props);
        }
    }
    validate() {
        for (const table of this.tables) {
            table.validate();
        }
    }
    toJSON() {
        return {
            // This is required because "name" field is not present in TableV2
            tables: this.tables.map((t) => t.toJSON())
        };
    }
    convertToClassicTables(props) {
        return Object.entries(props).map(([name, table]) => {
            const convertedTable = new Table({
                name,
                columns: table.columns,
                indexes: table.indexes,
                localOnly: table.localOnly,
                insertOnly: table.insertOnly,
                viewName: table.viewNameOverride || name
            });
            return convertedTable;
        });
    }
}
