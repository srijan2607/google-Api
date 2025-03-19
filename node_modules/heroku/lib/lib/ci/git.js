"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.inGitRepo = exports.rmRemote = exports.listRemotes = exports.createRemote = exports.gitUrl = exports.sshGitUrl = exports.readCommit = exports.githubRepository = exports.createArchive = void 0;
const tslib_1 = require("tslib");
const fs = require("fs-extra");
const command_1 = require("@heroku-cli/command");
const gh = require('github-url-to-object');
const spawn = require('child_process').spawn;
const tmp = require('tmp');
const NOT_A_GIT_REPOSITORY = 'not a git repository';
const RUN_IN_A_GIT_REPOSITORY = 'Please run this command from the directory containing your project\'s git repo';
const NOT_ON_A_BRANCH = 'not a symbolic ref';
const CHECKOUT_A_BRANCH = 'Please checkout a branch before running this command';
function runGit(...args) {
    const git = spawn('git', args);
    return new Promise((resolve, reject) => {
        git.on('exit', (exitCode) => {
            if (exitCode === 0) {
                // not all git commands write data to stdout
                resolve(exitCode.toString(10));
                return;
            }
            const error = (git.stderr.read() || 'unknown error').toString().trim();
            if (error.toLowerCase().includes(NOT_A_GIT_REPOSITORY)) {
                reject(RUN_IN_A_GIT_REPOSITORY);
                return;
            }
            if (error.includes(NOT_ON_A_BRANCH)) {
                reject(CHECKOUT_A_BRANCH);
                return;
            }
            reject(new Error(`Error while running 'git ${args.join(' ')}' (${error})`));
        });
        git.stdout.on('data', (data) => resolve(data.toString().trim()));
    });
}
async function getRef(branch) {
    return runGit('rev-parse', branch || 'HEAD');
}
async function getBranch(symbolicRef) {
    return runGit('symbolic-ref', '--short', symbolicRef);
}
async function getCommitTitle(ref) {
    return runGit('log', ref || '', '-1', '--pretty=format:%s');
}
async function createArchive(ref) {
    const tar = spawn('git', ['archive', '--format', 'tar.gz', ref]);
    const file = tmp.fileSync({ postfix: '.tar.gz' });
    const write = tar.stdout.pipe(fs.createWriteStream(file.name));
    return new Promise((resolve, reject) => {
        write.on('close', () => resolve(file.name));
        write.on('error', reject);
    });
}
exports.createArchive = createArchive;
async function githubRepository() {
    const remote = await runGit('remote', 'get-url', 'origin');
    const repository = gh(remote);
    if (repository === null) {
        throw new Error('Not a GitHub repository');
    }
    return repository;
}
exports.githubRepository = githubRepository;
async function readCommit(commit) {
    const branch = await getBranch('HEAD');
    const ref = await getRef(commit);
    const message = await getCommitTitle(ref);
    return Promise.resolve({
        branch,
        ref,
        message,
    });
}
exports.readCommit = readCommit;
function sshGitUrl(app) {
    return `git@${command_1.vars.gitHost}:${app}.git`;
}
exports.sshGitUrl = sshGitUrl;
function gitUrl(app) {
    return `https://${command_1.vars.httpGitHost}/${app}.git`;
}
exports.gitUrl = gitUrl;
/**
 * Lists remotes by their url and returns an
 * array of objects containing the name and kind
 *
 * @return A map of remotes whose key is the url
 * and value is an array of objects containing
 * the 'name' (heroku, heroku-dev, etc.) and 'kind' (fetch, push, etc.)
 */
async function listRemotes() {
    const gitRemotes = await runGit('remote', '-v');
    const lines = gitRemotes.trim().split('\n');
    const remotes = lines.map(line => line.trim().split(/\s+/)).map(([name, url, kind]) => ({ name, url, kind }));
    const remotesByUrl = new Map();
    remotes.forEach(remote => {
        var _a;
        const { url } = remote, nameAndKind = tslib_1.__rest(remote, ["url"]);
        const entry = (_a = remotesByUrl.get(url)) !== null && _a !== void 0 ? _a : [];
        entry.push(nameAndKind);
        remotesByUrl.set(url, entry);
    });
    return remotesByUrl;
}
exports.listRemotes = listRemotes;
function inGitRepo() {
    try {
        fs.lstatSync('.git');
        return true;
    }
    catch (error) {
        if (error.code !== 'ENOENT')
            throw error;
    }
}
exports.inGitRepo = inGitRepo;
async function rmRemote(remote) {
    await runGit('remote', 'rm', remote);
}
exports.rmRemote = rmRemote;
async function hasGitRemote(remote) {
    const remotes = await runGit('remote');
    return remotes.split('\n').find(r => r === remote);
}
async function createRemote(remote, url) {
    const exists = await hasGitRemote(remote);
    if (!exists) {
        return runGit('remote', 'add', remote, url);
    }
    return null;
}
exports.createRemote = createRemote;
