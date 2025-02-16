import { OpType } from './OpType.js';
export class OplogEntry {
    op_id;
    op;
    checksum;
    subkey;
    object_type;
    object_id;
    data;
    static fromRow(row) {
        return new OplogEntry(row.op_id, OpType.fromJSON(row.op), row.checksum, typeof row.subkey == 'string' ? row.subkey : JSON.stringify(row.subkey), row.object_type, row.object_id, row.data);
    }
    constructor(op_id, op, checksum, subkey, object_type, object_id, data) {
        this.op_id = op_id;
        this.op = op;
        this.checksum = checksum;
        this.subkey = subkey;
        this.object_type = object_type;
        this.object_id = object_id;
        this.data = data;
    }
    toJSON() {
        return {
            op_id: this.op_id,
            op: this.op.toJSON(),
            object_type: this.object_type,
            object_id: this.object_id,
            checksum: this.checksum,
            data: this.data,
            subkey: JSON.stringify(this.subkey)
        };
    }
}
