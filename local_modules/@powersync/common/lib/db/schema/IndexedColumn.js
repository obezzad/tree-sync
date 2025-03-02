import { ColumnType } from './Column.js';
export const DEFAULT_INDEX_COLUMN_OPTIONS = {
    ascending: true
};
export class IndexedColumn {
    options;
    static createAscending(column) {
        return new IndexedColumn({
            name: column,
            ascending: true
        });
    }
    constructor(options) {
        this.options = { ...DEFAULT_INDEX_COLUMN_OPTIONS, ...options };
    }
    get name() {
        return this.options.name;
    }
    get ascending() {
        return this.options.ascending;
    }
    toJSON(table) {
        return {
            name: this.name,
            ascending: this.ascending,
            type: table.columns.find((column) => column.name === this.name)?.type ?? ColumnType.TEXT
        };
    }
}
