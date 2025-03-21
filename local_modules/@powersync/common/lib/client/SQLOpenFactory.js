/**
 * Tests if the input is a {@link SQLOpenOptions}
 */
export const isSQLOpenOptions = (test) => {
    // typeof null is `object`, but you cannot use the `in` operator on `null.
    return test && typeof test == 'object' && 'dbFilename' in test;
};
/**
 * Tests if input is a {@link SQLOpenFactory}
 */
export const isSQLOpenFactory = (test) => {
    return typeof test?.openDB == 'function';
};
/**
 * Tests if input is a {@link DBAdapter}
 */
export const isDBAdapter = (test) => {
    return typeof test?.writeTransaction == 'function';
};
