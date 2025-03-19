declare function createArchive(ref: string): Promise<any>;
declare function githubRepository(): Promise<any>;
declare function readCommit(commit: string): Promise<{
    branch: string | undefined;
    ref: string | undefined;
    message: string | undefined;
}>;
declare function sshGitUrl(app: string): string;
declare function gitUrl(app?: string): string;
/**
 * Lists remotes by their url and returns an
 * array of objects containing the name and kind
 *
 * @return A map of remotes whose key is the url
 * and value is an array of objects containing
 * the 'name' (heroku, heroku-dev, etc.) and 'kind' (fetch, push, etc.)
 */
declare function listRemotes(): Promise<Map<string, {
    name: string;
    kind: string;
}[]>>;
declare function inGitRepo(): true | undefined;
declare function rmRemote(remote: string): Promise<void>;
declare function createRemote(remote: string, url: string): Promise<string | null>;
export { createArchive, githubRepository, readCommit, sshGitUrl, gitUrl, createRemote, listRemotes, rmRemote, inGitRepo, };
