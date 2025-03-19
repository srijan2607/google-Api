"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const color_1 = require("@heroku-cli/color");
const command_1 = require("@heroku-cli/command");
const core_1 = require("@oclif/core");
const confirmCommand_1 = require("../../lib/confirmCommand");
const git = require("../../lib/ci/git");
class Destroy extends command_1.Command {
    async run() {
        var _a, _b;
        const { flags, args } = await this.parse(Destroy);
        const app = args.app || flags.app;
        if (!app)
            throw new Error('No app specified.\nUSAGE: heroku apps:destroy APPNAME');
        // this appears to report errors if app not found
        await this.heroku.get(`/apps/${app}`);
        await (0, confirmCommand_1.default)(app, flags.confirm, `WARNING: This will delete ${color_1.default.app(app)} including all add-ons.`);
        core_1.ux.action.start(`Destroying ${color_1.default.app(app)} (including all add-ons)`);
        await this.heroku.delete(`/apps/${app}`);
        /**
         * It is possible to have as many git remotes as
         * you want, and they can all point to the same url.
         * The only requirement is that the "name" is unique.
         */
        if (git.inGitRepo()) {
            // delete git remotes pointing to this app
            const remotes = await git.listRemotes();
            await Promise.all([
                (_a = remotes.get(git.gitUrl(app))) === null || _a === void 0 ? void 0 : _a.map(({ name }) => git.rmRemote(name)),
                (_b = remotes.get(git.sshGitUrl(app))) === null || _b === void 0 ? void 0 : _b.map(({ name }) => git.rmRemote(name)),
            ]);
        }
        core_1.ux.action.stop();
    }
}
exports.default = Destroy;
Destroy.description = 'permanently destroy an app';
Destroy.help = 'This will also destroy all add-ons on the app.';
Destroy.hiddenAliases = ['destroy', 'apps:delete'];
Destroy.flags = {
    app: command_1.flags.app(),
    remote: command_1.flags.remote(),
    confirm: command_1.flags.string({ char: 'c' }),
};
Destroy.args = {
    app: core_1.Args.string({ hidden: true }),
};
