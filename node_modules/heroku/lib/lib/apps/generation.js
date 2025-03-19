"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getGenerationByAppId = exports.getGeneration = void 0;
function getGenerationFromGenerationLike(generation) {
    var _a;
    let maybeGeneration = '';
    if (typeof generation === 'string') {
        maybeGeneration = generation;
    }
    else if (generation && 'name' in generation) {
        maybeGeneration = (_a = generation.name) !== null && _a !== void 0 ? _a : '';
    }
    if (/(fir|cedar)/.test(maybeGeneration)) {
        return maybeGeneration;
    }
    // web-1234abcde44-123ab etc. fir
    if (/^web-[0-9a-z]+-[0-9a-z]{5}$/.test(maybeGeneration)) {
        return 'fir';
    }
    // web.n cedar
    if (/^web\.[0-9]+$/.test(maybeGeneration)) {
        return 'cedar';
    }
    return undefined;
}
/**
 * Get the generation of an object
 *
 * @param source The object to get the generation from
 * @returns The generation of the object
 */
function getGeneration(source) {
    if (typeof source === 'object' && 'generation' in source) {
        return getGenerationFromGenerationLike(source.generation);
    }
    return getGenerationFromGenerationLike(source);
}
exports.getGeneration = getGeneration;
/**
 * Get the generation of an app by id or name
 *
 * @param appIdOrName The id or name of the app to get the generation for
 * @param herokuApi The Heroku API client to use
 * @returns The generation of the app
 */
async function getGenerationByAppId(appIdOrName, herokuApi) {
    const { body: app } = await herokuApi.get(`/apps/${appIdOrName}`, {
        headers: { Accept: 'application/vnd.heroku+json; version=3.sdk' },
    });
    return getGeneration(app);
}
exports.getGenerationByAppId = getGenerationByAppId;
