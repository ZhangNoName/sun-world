#!/usr/bin/env python3
"""AST architecture lint for the entire backend src tree; does not execute application code."""

import ast
from dataclasses import dataclass
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DYNAMIC_IMPORTERS = {'importlib.import_module', 'importlib.__import__', 'builtins.__import__'}


def import_target(node):
    return node.args[0] if node.args else next((item.value for item in node.keywords if item.arg == 'name'), None)


@dataclass(frozen=True)
class Violation:
    path: str
    line: int
    code: str


class Boundary:
    def __init__(self, source_root):
        self.root = Path(source_root)
        self.trees, self.paths, self.bindings, self.exports = {}, {}, {}, {}
        self.errors = set()
        files = sorted(self.root.rglob('*.py'))
        for directory in ('modules', 'core'):
            if not any(path.is_relative_to(self.root / directory) for path in files):
                self.errors.add(Violation(directory, 1, 'SOURCE_TREE_REQUIRED'))
        for path in files:
            relative = path.relative_to(self.root)
            module = '.'.join(('src', *relative.with_suffix('').parts))
            if module.endswith('.__init__'):
                module = module[:-9]
            if module in self.paths:
                self.errors.add(Violation(str(relative), 1, 'DUPLICATE_CANONICAL_MODULE'))
                continue
            self.paths[module] = path
            try:
                self.trees[module] = ast.parse(path.read_bytes(), filename=str(relative))
            except (SyntaxError, ValueError, UnicodeError):
                self.error(module, 1, 'INVALID_AST')
        for module, tree in self.trees.items():
            self.bindings[module] = self.declarations(module, tree.body)

    def error(self, module, line, code):
        self.errors.add(Violation(str(self.paths[module].relative_to(self.root)), line, code))

    def exists(self, module):
        if not module.startswith('src.') and module != 'src':
            return True  # External dependencies are not imported or probed.
        path = self.root.joinpath(*module.split('.')[1:])
        return path.with_suffix('.py').is_file() or path.is_dir()

    def absolute(self, module, node):
        if not node.level:
            return node.module or ''
        package = module if self.paths[module].name == '__init__.py' else module.rpartition('.')[0]
        parts = package.split('.')
        keep = len(parts) - node.level + 1
        if keep < 1:
            self.error(module, node.lineno, 'RELATIVE_OUTSIDE_SRC')
            return ''
        return '.'.join(parts[:keep] + ([node.module] if node.module else []))

    def declarations(self, module, statements):
        result = {}
        for node in statements:
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                result[node.name] = ('value', module + '.' + node.name)
            elif isinstance(node, ast.Import):
                for alias in node.names:
                    result[alias.asname or alias.name.split('.')[0]] = (
                        'module', alias.name if alias.asname else alias.name.split('.')[0])
            elif isinstance(node, ast.ImportFrom):
                target = self.absolute(module, node)
                for alias in node.names:
                    result[alias.asname or alias.name] = ('from', target, alias.name)
            elif isinstance(node, (ast.Assign, ast.AnnAssign)):
                targets = node.targets if isinstance(node, ast.Assign) else [node.target]
                for target in targets:
                    if isinstance(target, ast.Name):
                        result[target.id] = ('expression', node.value)
            elif not isinstance(node, (ast.Lambda, ast.expr)):
                # Conditional imports and TYPE_CHECKING are declarations too.
                for field in ('body', 'orelse', 'finalbody'):
                    nested = getattr(node, field, ())
                    if isinstance(nested, list):
                        result.update(self.declarations(module, nested))
                for handler in getattr(node, 'handlers', ()):
                    result.update(self.declarations(module, handler.body))
        return result

    def binding(self, module, name, visited=frozenset()):
        key = (module, name)
        if key in visited:
            return None
        visited = visited | {key}
        spec = self.bindings.get(module, {}).get(name)
        if spec is None:
            candidate = module + '.' + name
            return ('module', candidate) if self.exists(candidate) else None
        if spec[0] == 'from':
            target, member = spec[1:]
            if target.startswith('src'):
                return self.binding(target, member, visited)
            return ('external', target + '.' + member)
        if spec[0] == 'expression':
            return self.expression(module, spec[1], {}, visited)
        return spec

    def expression(self, module, node, scope, visited=frozenset()):
        if isinstance(node, ast.Name):
            if node.id in scope:
                return scope[node.id]
            if node.id in ('getattr', '__import__'):
                return ('value', 'builtins.' + node.id)
            return self.binding(module, node.id, visited)
        if isinstance(node, ast.Attribute):
            base = self.expression(module, node.value, scope, visited)
            if base:
                if base[0] == 'module' and base[1].startswith('src'):
                    return self.binding(base[1], node.attr, visited)
                return (base[0] if base[0] == 'module' and base[1] == 'src' else 'value',
                        base[1] + '.' + node.attr)
        if isinstance(node, ast.Call):
            function = self.expression(module, node.func, scope, visited)
            if function == ('value', 'builtins.getattr') and len(node.args) >= 2:
                name = node.args[1]
                if isinstance(name, ast.Constant) and type(name.value) is str:
                    return self.expression(module, ast.Attribute(value=node.args[0], attr=name.value), scope, visited)
            if function and function[1] in DYNAMIC_IMPORTERS:
                target = import_target(node)
                if isinstance(target, ast.Constant) and type(target.value) is str:
                    return ('module', target.value)
                return None
        # A computed alias cannot prove a facade export exists or is not a module.
        if isinstance(node, (ast.Constant, ast.List, ast.Tuple, ast.Dict, ast.Set, ast.Call,
                             ast.BinOp, ast.UnaryOp, ast.Subscript, ast.ListComp, ast.DictComp)):
            return ('value', '')
        return None

    def facade(self, module):
        if module in self.exports:
            return self.exports[module]
        self.exports[module] = frozenset()
        tree = self.trees.get(module)
        if tree is None:
            return frozenset()
        assignments = [node for node in tree.body
                       if isinstance(node, (ast.Assign, ast.AnnAssign, ast.AugAssign))
                       and any(isinstance(target, ast.Name) and target.id == '__all__'
                               for target in (node.targets if isinstance(node, ast.Assign) else [node.target]))]
        if len(assignments) != 1:
            self.error(module, 1, 'FACADE_ALL_REQUIRED')
            return frozenset()
        node = assignments[0]
        value = node.value
        if isinstance(node, ast.Assign) and len(node.targets) != 1:
            self.error(module, node.lineno, 'FACADE_ALL_STATIC')
        # A facade's __all__ is a declaration, not a runtime container. Reject
        # every other reference, including alias escape, before mutation occurs.
        declaration = node.targets[0] if isinstance(node, ast.Assign) else node.target
        if any(isinstance(reference, ast.Name) and reference.id == '__all__'
               and reference is not declaration for reference in ast.walk(tree)):
            self.error(module, node.lineno, 'FACADE_ALL_STATIC')
        if not isinstance(value, (ast.List, ast.Tuple)) or any(
                not isinstance(item, ast.Constant) or type(item.value) is not str
                or not item.value.isidentifier() or item.value.startswith('_') for item in value.elts):
            self.error(module, node.lineno, 'FACADE_ALL_STATIC')
            return frozenset()
        names = [item.value for item in value.elts]
        if len(names) != len(set(names)):
            self.error(module, node.lineno, 'FACADE_ALL_DUPLICATE')
        for name in names:
            symbol = self.binding(module, name)
            if symbol is None or symbol[0] != 'value':
                self.error(module, node.lineno, 'FACADE_EXPORT_NOT_VALUE')
        self.exports[module] = frozenset(names)
        return self.exports[module]

    def target(self, source, target, line, member=None):
        parts = target.split('.')
        if parts[0] in ('modules', 'core'):
            self.error(source, line, 'LOCAL_NAMESPACE_REQUIRED')
        owner = source.split('.')[2] if source.startswith('src.modules.') else None
        if not self.exists(target):
            self.error(source, line, 'UNKNOWN_MODULE')
        restricted = (source == 'src.core' or source.startswith('src.core.')
                      or source == 'src.modules' or source.startswith('src.modules.'))
        if target in ('src.module_composition', 'module_composition') or target.startswith('src.module_composition.'):
            if restricted or target == 'module_composition':
                self.error(source, line, 'COMPOSITION_BACKFLOW')
            return
        # This exact module is the sole private assembly entrypoint. The target
        # existence check above applies to it too; similarly named files do not qualify.
        if source == 'src.module_composition':
            return
        if target == 'src.modules' or target.startswith('src.modules.'):
            other = parts[2] if len(parts) >= 3 else None
            if source == 'src.core' or source.startswith('src.core.'):
                self.error(source, line, 'CORE_BUSINESS_IMPORT')
            elif owner is None or other != owner:
                if owner == 'ai' and other == 'agent_runtime':
                    self.error(source, line, 'AI_RUNTIME_BACKFLOW')
                if len(parts) != 4 or parts[3] != 'public':
                    self.error(source, line, 'PRIVATE_MODULE_IMPORT')
                elif target not in self.trees:
                    self.error(source, line, 'FACADE_MISSING')
                elif member is not None and (member == '*' or member not in self.facade(target)):
                    self.error(source, line, 'NON_PUBLIC_EXPORT')

    def access(self, source, path, line):
        if path == 'src.module_composition' or path.startswith('src.module_composition.'):
            self.target(source, 'src.module_composition', line)
        if path == 'src.modules':
            self.target(source, path, line)
            return
        if not path.startswith('src.modules.'):
            return
        parts = path.split('.')
        owner = source.split('.')[2] if source.startswith('src.modules.') else None
        if parts[2] == owner:
            return
        if len(parts) < 4 or parts[3] != 'public':
            self.target(source, '.'.join(parts[:4]), line)
        else:
            self.target(source, '.'.join(parts[:4]), line, parts[4] if len(parts) > 4 else None)

    def run(self):
        for module in self.trees:
            if module.startswith('src.modules.') and len(module.split('.')) == 4 and module.endswith('.public'):
                self.facade(module)
        for module, tree in self.trees.items():
            Imports(self, module).visit(tree)
        return sorted(self.errors, key=lambda item: (item.path, item.line, item.code))


class Imports(ast.NodeVisitor):
    def __init__(self, boundary, module):
        self.boundary, self.module = boundary, module
        self.scope = {}
        self.parents = []

    def visit(self, node):
        self.parents.append(node)
        result = super().visit(node)
        self.parents.pop()
        return result

    def visit_Import(self, node):
        for alias in node.names:
            self.boundary.target(self.module, alias.name, node.lineno)
            self.scope[alias.asname or alias.name.split('.')[0]] = (
                'module', alias.name if alias.asname else alias.name.split('.')[0])

    def visit_ImportFrom(self, node):
        target = self.boundary.absolute(self.module, node)
        if not target:
            return
        for alias in node.names:
            # Local stars can leak already-loaded package namespaces without a
            # statically declared alias. No runtime namespace simulation here.
            if alias.name == '*' and (target == 'src' or target.startswith('src.')):
                self.boundary.error(self.module, node.lineno, 'LOCAL_STAR_IMPORT')
            self.boundary.target(self.module, target, node.lineno, alias.name)
            if target == 'src' and alias.name in ('modules', 'module_composition'):
                self.boundary.target(self.module, target + '.' + alias.name, node.lineno)
            symbol = self.boundary.binding(target, alias.name) if target.startswith('src') else ('value', target + '.' + alias.name)
            self.scope[alias.asname or alias.name] = symbol

    def visit_Assign(self, node):
        self.visit(node.value)
        symbol = self.boundary.expression(self.module, node.value, self.scope)
        for target in node.targets:
            if isinstance(target, ast.Name):
                self.scope[target.id] = symbol

    def visit_AnnAssign(self, node):
        self.visit(node.annotation)
        if node.value is not None:
            self.visit(node.value)
            if isinstance(node.target, ast.Name):
                self.scope[node.target.id] = self.boundary.expression(self.module, node.value, self.scope)

    def visit_FunctionDef(self, node):
        for decorator in node.decorator_list:
            self.visit(decorator)
        self.visit(node.args)
        if node.returns:
            self.visit(node.returns)
        previous = self.scope
        self.scope = dict(previous)
        # Python closures resolve imports/aliases declared later in the enclosing
        # function as well. Pre-bind those static locals before visiting children;
        # the sequential visitor still updates subsequent rebinding normally.
        locals_ = self.boundary.declarations(self.module, node.body)
        self.scope.update({name: None for name in locals_})
        for name, spec in locals_.items():
            if spec[0] in ('module', 'value'):
                self.scope[name] = spec
            elif spec[0] == 'from':
                self.scope[name] = (self.boundary.binding(spec[1], spec[2]) if spec[1].startswith('src')
                                    else ('value', spec[1] + '.' + spec[2]))
        aliases = {name: spec[1] for name, spec in locals_.items() if spec[0] == 'expression'}
        for _ in range(len(aliases) + 1):
            resolved = {name: self.boundary.expression(self.module, value, self.scope)
                        for name, value in aliases.items()}
            if all(self.scope[name] == value for name, value in resolved.items()):
                break
            self.scope.update(resolved)
        for argument in (*node.args.posonlyargs, *node.args.args, *node.args.kwonlyargs,
                         *([node.args.vararg] if node.args.vararg else []),
                         *([node.args.kwarg] if node.args.kwarg else [])):
            self.scope[argument.arg] = None
        for statement in node.body:
            self.visit(statement)
        self.scope = previous

    visit_AsyncFunctionDef = visit_FunctionDef

    def visit_ClassDef(self, node):
        previous = self.scope
        self.scope = dict(previous)
        self.generic_visit(node)
        self.scope = previous

    def qualified(self, node):
        if isinstance(node, ast.Name):
            return self.boundary.expression(self.module, node, self.scope)
        if isinstance(node, ast.Attribute):
            base = self.qualified(node.value)
            if base and base[0] == 'module':
                return ('module', base[1] + '.' + node.attr)
        return self.boundary.expression(self.module, node, self.scope)

    def visit_Attribute(self, node):
        parent = self.parents[-2] if len(self.parents) > 1 else None
        if not (isinstance(parent, ast.Attribute) and parent.value is node):
            symbol = self.qualified(node)
            if symbol and symbol[0] == 'module':
                self.boundary.access(self.module, symbol[1], node.lineno)
        self.generic_visit(node)

    def visit_Call(self, node):
        function = self.boundary.expression(self.module, node.func, self.scope)
        if function and function[1] in DYNAMIC_IMPORTERS:
            name = import_target(node)
            if (not isinstance(name, ast.Constant) or type(name.value) is not str
                    or name.value.startswith('.')
                    or name.value.split('.')[0] in ('src', 'modules', 'core', 'module_composition')):
                self.boundary.error(self.module, node.lineno, 'DYNAMIC_IMPORT')
        if function == ('value', 'builtins.getattr') and len(node.args) >= 2:
            base = self.qualified(node.args[0])
            if (base and base[0] == 'module' and base[1] in ('importlib', 'builtins')
                    and (not isinstance(node.args[1], ast.Constant) or type(node.args[1].value) is not str)):
                self.boundary.error(self.module, node.lineno, 'DYNAMIC_IMPORT')
            if base and base[0] == 'module' and base[1].startswith('src'):
                name = node.args[1]
                if isinstance(name, ast.Constant) and type(name.value) is str:
                    self.boundary.access(self.module, base[1] + '.' + name.value, node.lineno)
                else:
                    self.boundary.error(self.module, node.lineno, 'DYNAMIC_MODULE_ATTRIBUTE')
        self.generic_visit(node)


def check_sources(source_root):
    return Boundary(source_root).run()


def main():
    errors = check_sources(ROOT / 'apps/api/src')
    for error in errors:
        print(f'{error.path}:{error.line}: {error.code}')
    if errors:
        print(f'Module import boundary failed: {len(errors)} violations')
        return 1
    print('Module import boundary passed (entire src AST; no application imports)')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
