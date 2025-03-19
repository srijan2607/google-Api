"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@oclif/core");
const command_1 = require("@heroku-cli/command");
const git = require("../../lib/ci/git");
const color_1 = require("@heroku-cli/color");
class AppsRename extends command_1.Command {
    async run() {
        const { flags, args } = await this.parse(AppsRename);
        const oldApp = flags.app;
        const newApp = args.newname;
        core_1.ux.action.start(`Renaming ${color_1.default.cyan(oldApp)} to ${color_1.default.green(newApp)}`);
        const appResponse = await this.heroku.patch(`/apps/${oldApp}`, { body: { name: newApp } });
        const app = appResponse.body;
        core_1.ux.action.stop();
        const gitUrl = git.gitUrl(app.name);
        core_1.ux.log(`${app.web_url} | ${gitUrl}`);
        if (!app.web_url.includes('https')) {
            core_1.ux.log('Please note that it may take a few minutes for Heroku to provision a SSL certificate for your application.');
        }
        if (git.inGitRepo()) {
            /**
             * It is possible to have as many git remotes as
             * you want, and they can all point to the same url.
             * The only requirement is that the "name" is unique.
             */
            const remotes = await git.listRemotes();
            const httpsUrl = git.gitUrl(oldApp);
            const sshUrl = git.sshGitUrl(oldApp);
            const targetRemotesBySSHUrl = remotes.get(sshUrl);
            const targetRemotesByHttpsUrl = remotes.get(httpsUrl);
            const doRename = async (remotes, url) => {
                for (const remote of remotes !== null && remotes !== void 0 ? remotes : []) {
                    const { name } = remote;
                    await git.rmRemote(name);
                    await git.createRemote(name, url.replace(oldApp, newApp));
                    core_1.ux.log(`Git remote ${name} updated`);
                }
            };
            await Promise.all([
                doRename(targetRemotesByHttpsUrl, httpsUrl),
                doRename(targetRemotesBySSHUrl, sshUrl),
            ]);
        }
        core_1.ux.warn("Don't forget to update git remotes for all other local checkouts of the app.");
    }
}
exports.default = AppsRename;
AppsRename.description = 'rename an app';
AppsRename.help = 'This will locally update the git remote if it is set to the old app.';
AppsRename.topic = 'apps';
AppsRename.hiddenAliases = ['rename'];
AppsRename.examples = [
    '$ heroku apps:rename --app oldname newname',
];
AppsRename.flags = {
    app: command_1.flags.app({ required: true }),
    remote: command_1.flags.remote(),
};
AppsRename.args = {
    newname: core_1.Args.string({ required: true, description: 'new unique name of the app' }),
};
