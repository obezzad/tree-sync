import { Column, ColumnsType, ColumnType, ExtractColumnValueType } from './Column.js';
import { Index } from './Index.js';
import { TableV2 } from './TableV2.js';
export interface TableOptions {
    /**
     * The synced table name, matching sync rules
     */
    name: string;
    columns: Column[];
    indexes?: Index[];
    localOnly?: boolean;
    insertOnly?: boolean;
    viewName?: string;
}
export type RowType<T extends TableV2<any>> = {
    [K in keyof T['columnMap']]: ExtractColumnValueType<T['columnMap'][K]>;
} & {
    id: string;
};
export type IndexShorthand = Record<string, string[]>;
export interface TableV2Options {
    indexes?: IndexShorthand;
    localOnly?: boolean;
    insertOnly?: boolean;
    viewName?: string;
}
export declare const DEFAULT_TABLE_OPTIONS: {
    indexes: never[];
    insertOnly: boolean;
    localOnly: boolean;
};
export declare const InvalidSQLCharacters: RegExp;
export declare class Table<Columns extends ColumnsType = ColumnsType> {
    protected options: TableOptions;
    protected _mappedColumns: Columns;
    static createLocalOnly(options: TableOptions): Table<ColumnsType>;
    static createInsertOnly(options: TableOptions): Table<ColumnsType>;
    /**
     * Create a table.
     * @deprecated This was only only included for TableV2 and is no longer necessary.
     * Prefer to use new Table() directly.
     *
     * TODO remove in the next major release.
     */
    static createTable(name: string, table: Table): Table<ColumnsType>;
    /**
     * Creates a new Table instance.
     *
     * This constructor supports two different versions:
     * 1. New constructor: Using a Columns object and an optional TableV2Options object
     * 2. Deprecated constructor: Using a TableOptions object (will be removed in the next major release)
     *
     * @constructor
     * @param {Columns | TableOptions} optionsOrColumns - Either a Columns object (for V2 syntax) or a TableOptions object (for V1 syntax)
     * @param {TableV2Options} [v2Options] - Optional configuration options for V2 syntax
     *
     * @example
     * ```javascript
     * // New Constructor
     * const table = new Table(
     *   {
     *     name: column.text,
     *     age: column.integer
     *   },
     *   { indexes: { nameIndex: ['name'] } }
     * );
     *```
     *
     *
     * @example
     * ```javascript
     * // Deprecated Constructor
     * const table = new Table({
     *   name: 'users',
     *   columns: [
     *     new Column({ name: 'name', type: ColumnType.TEXT }),
     *     new Column({ name: 'age', type: ColumnType.INTEGER })
     *   ]
     * });
     *```
     */
    constructor(columns: Columns, options?: TableV2Options);
    /**
     * @deprecated This constructor will be removed in the next major release.
     * Use the new constructor shown below instead as this does not show types.
     * @example
     * <caption>Use this instead</caption>
     * ```javascript
     *   const table = new Table(
     *     {
     *      name: column.text,
     *      age: column.integer
     *     },
     *     { indexes: { nameIndex: ['name'] } }
     *   );
     *```
     */
    constructor(options: TableOptions);
    private isTableV1;
    private initTableV1;
    private initTableV2;
    get name(): string;
    get viewNameOverride(): string | undefined;
    get viewName(): string;
    get columns(): Column[];
    get columnMap(): Columns;
    get indexes(): Index[];
    get localOnly(): boolean;
    get insertOnly(): boolean;
    get internalName(): string;
    get validName(): boolean;
    validate(): void;
    toJSON(): {
        name: string;
        view_name: string;
        local_only: boolean;
        insert_only: boolean;
        columns: {
            name: string;
            type: ColumnType | undefined;
        }[];
        indexes: {
            name: string;
            columns: {
                name: string;
                ascending: boolean | undefined;
                type: ColumnType;
            }[];
        }[];
    };
}
