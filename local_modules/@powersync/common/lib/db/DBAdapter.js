/**
 * Set of generic interfaces to allow PowerSync compatibility with
 * different SQLite DB implementations.
 */
/**
 * Update table operation numbers from SQLite
 */
export var RowUpdateType;
(function (RowUpdateType) {
    RowUpdateType[RowUpdateType["SQLITE_INSERT"] = 18] = "SQLITE_INSERT";
    RowUpdateType[RowUpdateType["SQLITE_DELETE"] = 9] = "SQLITE_DELETE";
    RowUpdateType[RowUpdateType["SQLITE_UPDATE"] = 23] = "SQLITE_UPDATE";
})(RowUpdateType || (RowUpdateType = {}));
export function isBatchedUpdateNotification(update) {
    return 'tables' in update;
}
export function extractTableUpdates(update) {
    return isBatchedUpdateNotification(update) ? update.tables : [update.table];
}
