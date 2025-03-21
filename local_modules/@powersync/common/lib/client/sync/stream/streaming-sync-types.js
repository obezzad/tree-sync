export function isStreamingSyncData(line) {
    return line.data != null;
}
export function isStreamingKeepalive(line) {
    return line.token_expires_in != null;
}
export function isStreamingSyncCheckpoint(line) {
    return line.checkpoint != null;
}
export function isStreamingSyncCheckpointComplete(line) {
    return line.checkpoint_complete != null;
}
export function isStreamingSyncCheckpointDiff(line) {
    return line.checkpoint_diff != null;
}
export function isContinueCheckpointRequest(request) {
    return (Array.isArray(request.buckets) &&
        typeof request.checkpoint_token == 'string');
}
export function isSyncNewCheckpointRequest(request) {
    return typeof request.request_checkpoint == 'object';
}
