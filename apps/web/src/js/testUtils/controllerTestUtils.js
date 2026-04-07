const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadController(relativePath, exportName, extraContext = {}) {
    const filePath = path.resolve(__dirname, '..', relativePath);
    const source = fs.readFileSync(filePath, 'utf8');

    const context = {
        module: { exports: {} },
        exports: {},
        require,
        console,
        setTimeout: (fn) => {
            if (typeof fn === 'function') fn();
            return 0;
        },
        clearTimeout: () => {},
        Promise,
        ...extraContext,
    };

    context.window = context.window || context;
    context.globalThis = context;

    vm.runInNewContext(
        `${source}\nmodule.exports = typeof ${exportName} !== 'undefined' ? ${exportName} : null;`,
        context,
        { filename: filePath },
    );

    return {
        controller: context.module.exports,
        context,
    };
}

function createDocument(elements = {}) {
    return {
        getElementById: jest.fn((id) => elements[id] || null),
        querySelector: jest.fn(() => null),
        querySelectorAll: jest.fn(() => []),
        createElement: jest.fn(() => ({
            style: {},
            className: '',
            innerHTML: '',
            setAttribute: jest.fn(),
            appendChild: jest.fn(),
            addEventListener: jest.fn(),
        })),
    };
}

function createElement(overrides = {}) {
    return {
        value: '',
        innerHTML: '',
        innerText: '',
        textContent: '',
        disabled: false,
        checked: false,
        files: [],
        style: {},
        classList: { add: jest.fn(), remove: jest.fn() },
        setAttribute: jest.fn(),
        appendChild: jest.fn(),
        ...overrides,
    };
}

module.exports = {
    loadController,
    createDocument,
    createElement,
};
