import { CrudBatch } from './CrudBatch.js';
export class CrudTransaction extends CrudBatch {
    crud;
    complete;
    transactionId;
    constructor(
    /**
     * List of client-side changes.
     */
    crud, 
    /**
     * Call to remove the changes from the local queue, once successfully uploaded.
     */
    complete, 
    /**
     * If null, this contains a list of changes recorded without an explicit transaction associated.
     */
    transactionId) {
        super(crud, false, complete);
        this.crud = crud;
        this.complete = complete;
        this.transactionId = transactionId;
    }
}
