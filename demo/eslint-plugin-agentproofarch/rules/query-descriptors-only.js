const QUERY_HOOKS = new Set(['useQuery', 'useQueries', 'useMutation']);

/**
 * Canonical descriptor sources. A hook argument is only accepted when it
 * originates from one of these modules — not from *any* import. Matching is
 * exact-or-suffix so relative specifiers at any nesting depth resolve:
 *   - `#core/client/*`     — the descriptor factories themselves
 *   - `.../api.js`         — the web binding site (bound `actions`)
 *   - `.../core/index.js`  — an island core's public seam (re-exported descriptors)
 * Importing a look-alike descriptor from any other module (a local `./q.js`, a
 * re-export module) no longer passes.
 */
const DEFAULT_DESCRIPTOR_MODULES = [
  '#core/client/index.js',
  '#core/client/queries.js',
  '/api.js',
  '/api.ts',
  '/core/index.js',
  '/core/index.ts',
];

const isDescriptorModule = (source, allowed) =>
  typeof source === 'string' && allowed.some((spec) => source === spec || source.endsWith(spec));

const keyName = (key) => {
  if (key.type === 'Identifier') return key.name;
  if (key.type === 'Literal') return String(key.value);
  return null;
};

const rootIdentifier = (node) => {
  switch (node.type) {
    case 'Identifier':
      return node;
    case 'MemberExpression':
      return rootIdentifier(node.object);
    case 'CallExpression':
      return rootIdentifier(node.callee);
    case 'ChainExpression':
      return rootIdentifier(node.expression);
    case 'TSNonNullExpression':
      return rootIdentifier(node.expression);
    default:
      return null;
  }
};

const findVariable = (scope, name) => {
  let current = scope;
  while (current) {
    const found = current.variables.find((variable) => variable.name === name);
    if (found) return found;
    current = current.upper;
  }
  return null;
};

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'useQuery/useQueries/useMutation arguments must originate from an imported action descriptor, never an inline object literal.',
    },
    schema: [
      {
        type: 'object',
        properties: {
          descriptorModules: { type: 'array', items: { type: 'string' } },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      inlineObject:
        'The {{hook}} argument must originate from an imported action descriptor (e.g. actions.todos or actions.todos(...)), never an inline object literal. Spread a descriptor to add callbacks: {{hook}}({ ...actions.foo, onSuccess }).',
      notImported:
        'The {{hook}} argument must originate from an imported action descriptor, not `{{name}}`.',
      foreignModule:
        'The {{hook}} argument must come from a canonical descriptor module (#core/client, the web api.ts binding, or an island core/index.ts), not `{{name}}` imported from "{{module}}".',
    },
  },
  create(context) {
    const sourceCode = context.sourceCode;
    const allowed = context.options[0]?.descriptorModules ?? DEFAULT_DESCRIPTOR_MODULES;
    const descriptorNames = new Set();

    const importSourceOf = (identifierNode) => {
      const variable = findVariable(sourceCode.getScope(identifierNode), identifierNode.name);
      if (!variable) return null;
      for (const def of variable.defs) {
        if (def.type === 'ImportBinding' && def.parent?.type === 'ImportDeclaration') {
          return def.parent.source.value;
        }
      }
      return null;
    };

    const isFromImport = (node) => {
      const root = rootIdentifier(node);
      if (!root) return false;
      if (descriptorNames.has(root.name)) return true;
      const variable = findVariable(sourceCode.getScope(root), root.name);
      if (!variable) return false;
      for (const def of variable.defs) {
        if (def.type === 'ImportBinding') {
          const decl = def.parent;
          return (
            decl?.type === 'ImportDeclaration' && isDescriptorModule(decl.source.value, allowed)
          );
        }
        if (
          def.type === 'Variable' &&
          def.node.type === 'VariableDeclarator' &&
          def.node.init
        ) {
          const initRoot = rootIdentifier(def.node.init);
          if (initRoot && descriptorNames.has(initRoot.name)) return true;
        }
      }
      return false;
    };

    const checkOrigin = (node, hook) => {
      if (isFromImport(node)) return;
      const root = rootIdentifier(node);
      const module = root ? importSourceOf(root) : null;
      if (root && module !== null) {
        context.report({
          node,
          messageId: 'foreignModule',
          data: { hook, name: root.name, module },
        });
        return;
      }
      context.report({
        node,
        messageId: 'notImported',
        data: { hook, name: root ? root.name : 'expression' },
      });
    };

    const validate = (node, hook) => {
      if (node.type === 'SpreadElement') {
        checkOrigin(node.argument, hook);
        return;
      }
      if (node.type === 'ObjectExpression') {
        const spreadsDescriptor = node.properties.some(
          (property) => property.type === 'SpreadElement' && isFromImport(property.argument),
        );
        if (!spreadsDescriptor) {
          context.report({ node, messageId: 'inlineObject', data: { hook } });
        }
        return;
      }
      checkOrigin(node, hook);
    };

    return {
      ImportDeclaration(node) {
        if (!isDescriptorModule(node.source.value, allowed)) return;
        for (const specifier of node.specifiers) descriptorNames.add(specifier.local.name);
      },
      CallExpression(node) {
        if (node.callee.type !== 'Identifier') return;
        const hook = node.callee.name;
        if (!QUERY_HOOKS.has(hook)) return;
        const arg = node.arguments[0];
        if (!arg) return;
        if (hook === 'useQueries' && arg.type === 'ObjectExpression') {
          const queries = arg.properties.find(
            (property) =>
              property.type === 'Property' &&
              !property.computed &&
              keyName(property.key) === 'queries',
          );
          if (queries && queries.value.type === 'ArrayExpression') {
            for (const element of queries.value.elements) {
              if (element) validate(element, hook);
            }
            return;
          }
        }
        validate(arg, hook);
      },
    };
  },
};
