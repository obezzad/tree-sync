import { IndexedColumn } from './IndexedColumn.js';
export const DEFAULT_INDEX_OPTIONS = {
    columns: []
};
export class Index {
    options;
    static createAscending(options, columnNames) {
        return new Index({
            ...options,
            columns: columnNames.map((name) => IndexedColumn.createAscending(name))
        });
    }
    constructor(options) {
        this.options = options;
        this.options = { ...DEFAULT_INDEX_OPTIONS, ...options };
    }
    get name() {
        return this.options.name;
    }
    get columns() {
        return this.options.columns ?? [];
    }
    toJSON(table) {
        return {
            name: this.name,
            columns: this.columns.map((c) => c.toJSON(table))
        };
    }
}
