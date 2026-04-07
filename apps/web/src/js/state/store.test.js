const fs = require('fs');
const path = require('path');
const vm = require('vm');

describe('AppState readiness gating', () => {
    function loadStore(extraContext = {}) {
        const filePath = path.resolve(__dirname, '../state/store.js');
        const source = fs.readFileSync(filePath, 'utf8');
        const context = {
            module: { exports: {} },
            exports: {},
            require,
            console,
            DEFAULT_PRICING_DATA: {},
            window: {},
            ...extraContext,
        };
        context.globalThis = context;

        vm.runInNewContext(`${source}\nmodule.exports = AppState;`, context, { filename: filePath });
        return context.module.exports;
    }

    it('does not require projects for salesperson readiness', () => {
        const store = loadStore();
        store.loggedInUser = { _apiRole: 'SALESPERSON' };
        ['users', 'businesses', 'tasks', 'notifications', 'systemLogs', 'categories', 'settings', 'pricing']
            .forEach((key) => store.markLoaded(key));

        expect(store.isAllLoaded()).toBe(true);
    });

    it('still requires projects for team leaders and managers', () => {
        const store = loadStore();
        store.loggedInUser = { _apiRole: 'TEAM_LEADER' };
        ['users', 'businesses', 'tasks', 'notifications', 'systemLogs', 'categories', 'settings', 'pricing']
            .forEach((key) => store.markLoaded(key));

        expect(store.isAllLoaded()).toBe(false);
        store.markLoaded('projects');
        expect(store.isAllLoaded()).toBe(true);
    });
});
