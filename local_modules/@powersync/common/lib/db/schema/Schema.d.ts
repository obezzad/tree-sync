import { RowType, Table } from './Table.js';
type SchemaType = Record<string, Table<any>>;
export type SchemaTableType<S extends SchemaType> = {
    [K in keyof S]: RowType<S[K]>;
};
/**
 * A schema is a collection of tables. It is used to define the structure of a database.
 */
export declare class Schema<S extends SchemaType = SchemaType> {
    readonly types: SchemaTableType<S>;
    readonly props: S;
    readonly tables: Table[];
    constructor(tables: Table[] | S);
    validate(): void;
    toJSON(): {
        tables: {
            name: string;
            view_name: string;
            local_only: boolean;
            insert_only: boolean;
            columns: {
                name: string;
                type: import("./Column.js").ColumnType | undefined;
            }[];
            indexes: {
                name: string;
                columns: {
                    name: string;
                    ascending: boolean | undefined;
                    type: import("./Column.js").ColumnType;
                }[];
            }[];
        }[];
    };
    private convertToClassicTables;
}
export {};
