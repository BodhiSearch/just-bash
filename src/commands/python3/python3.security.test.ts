import { describe, expect, it } from "vitest";
import { Bash } from "../../Bash.js";

// Note: These tests use Pyodide which downloads ~30MB on first run.
// The first test will be slow, subsequent tests reuse the cached instance.

/**
 * Security tests for the Python/Pyodide sandbox.
 * These tests verify that the sandbox properly restricts dangerous operations.
 */
describe("python3 security", () => {
  describe("blocked module imports", () => {
    it(
      "should block import js (sandbox escape vector)",
      { timeout: 60000 },
      async () => {
        const env = new Bash({ python: true });
        const result = await env.exec('python3 -c "import js"');
        expect(result.stderr).toContain("ImportError");
        expect(result.stderr).toContain("blocked");
        expect(result.exitCode).toBe(1);
      },
    );

    it("should block import js.globalThis", async () => {
      const env = new Bash({ python: true });
      const result = await env.exec('python3 -c "from js import globalThis"');
      expect(result.stderr).toContain("ImportError");
      expect(result.stderr).toContain("blocked");
      expect(result.exitCode).toBe(1);
    });

    it("should block import pyodide.ffi", async () => {
      const env = new Bash({ python: true });
      const result = await env.exec('python3 -c "import pyodide.ffi"');
      expect(result.stderr).toContain("ImportError");
      expect(result.stderr).toContain("blocked");
      expect(result.exitCode).toBe(1);
    });

    it("should block from pyodide.ffi import create_proxy", async () => {
      const env = new Bash({ python: true });
      const result = await env.exec(
        'python3 -c "from pyodide.ffi import create_proxy"',
      );
      expect(result.stderr).toContain("ImportError");
      expect(result.stderr).toContain("blocked");
      expect(result.exitCode).toBe(1);
    });

    it("should block import pyodide (sandbox escape via ffi)", async () => {
      const env = new Bash({ python: true });
      const result = await env.exec('python3 -c "import pyodide"');
      expect(result.stderr).toContain("ImportError");
      expect(result.stderr).toContain("blocked");
      expect(result.exitCode).toBe(1);
    });

    it("should block import pyodide_js (exposes _original_* via globals)", async () => {
      const env = new Bash({ python: true });
      const result = await env.exec('python3 -c "import pyodide_js"');
      expect(result.stderr).toContain("ImportError");
      expect(result.stderr).toContain("blocked");
      expect(result.exitCode).toBe(1);
    });

    it("should block pyodide_js.globals access to _original_import", async () => {
      const env = new Bash({ python: true });
      await env.exec(`cat > /tmp/test_pyodide_js.py << 'EOF'
try:
    import pyodide_js
    orig = pyodide_js.globals.get('_original_import')
    if orig:
        js = orig('js')
        print('VULNERABLE: accessed _original_import via pyodide_js.globals')
    else:
        print('VULNERABLE: pyodide_js imported')
except ImportError as e:
    if 'blocked' in str(e):
        print('SECURE: pyodide_js blocked')
    else:
        print(f'ERROR: {e}')
EOF`);
      const result = await env.exec("python3 /tmp/test_pyodide_js.py");
      expect(result.stdout).toContain("SECURE");
      expect(result.stdout).not.toContain("VULNERABLE");
      expect(result.exitCode).toBe(0);
    });
  });

  describe("hidden original function references", () => {
    it("should not expose _original_import (critical sandbox escape)", async () => {
      const env = new Bash({ python: true });
      await env.exec(`cat > /tmp/test_import.py << 'EOF'
try:
    # If _original_import is accessible, attacker can bypass import blocking
    js = _original_import('js')
    print('VULNERABLE: _original_import accessible')
except NameError:
    print('SECURE: _original_import not accessible')
EOF`);
      const result = await env.exec("python3 /tmp/test_import.py");
      expect(result.stdout).toContain("SECURE");
      expect(result.stdout).not.toContain("VULNERABLE");
      expect(result.exitCode).toBe(0);
    });

    it("should not expose _jb_original_open on builtins", async () => {
      const env = new Bash({ python: true });
      const result = await env.exec(
        "python3 -c \"import builtins; print(hasattr(builtins, '_jb_original_open'))\"",
      );
      expect(result.stdout).toBe("False\n");
      expect(result.exitCode).toBe(0);
    });

    it("should not expose _jb_original_listdir on os", async () => {
      const env = new Bash({ python: true });
      const result = await env.exec(
        "python3 -c \"import os; print(hasattr(os, '_jb_original_listdir'))\"",
      );
      expect(result.stdout).toBe("False\n");
      expect(result.exitCode).toBe(0);
    });

    it("should not expose _jb_original_exists on os.path", async () => {
      const env = new Bash({ python: true });
      const result = await env.exec(
        "python3 -c \"import os; print(hasattr(os.path, '_jb_original_exists'))\"",
      );
      expect(result.stdout).toBe("False\n");
      expect(result.exitCode).toBe(0);
    });

    it("should not expose _jb_original_stat on os", async () => {
      const env = new Bash({ python: true });
      const result = await env.exec(
        "python3 -c \"import os; print(hasattr(os, '_jb_original_stat'))\"",
      );
      expect(result.stdout).toBe("False\n");
      expect(result.exitCode).toBe(0);
    });

    it("should not expose _jb_original_chdir on os", async () => {
      const env = new Bash({ python: true });
      const result = await env.exec(
        "python3 -c \"import os; print(hasattr(os, '_jb_original_chdir'))\"",
      );
      expect(result.stdout).toBe("False\n");
      expect(result.exitCode).toBe(0);
    });
  });

  describe("importlib bypass attempts", () => {
    it("should block importlib.import_module('js')", async () => {
      const env = new Bash({ python: true });
      await env.exec(`cat > /tmp/test_importlib_js.py << 'EOF'
try:
    import importlib
    importlib.import_module('js')
    print('VULNERABLE: importlib.import_module bypassed sandbox')
except ImportError as e:
    if 'blocked' in str(e):
        print('SECURE: importlib.import_module blocked')
    else:
        print(f'ERROR: {e}')
EOF`);
      const result = await env.exec("python3 /tmp/test_importlib_js.py");
      expect(result.stdout).toContain("SECURE");
      expect(result.stdout).not.toContain("VULNERABLE");
      expect(result.exitCode).toBe(0);
    });

    it("should block importlib.import_module('pyodide')", async () => {
      const env = new Bash({ python: true });
      await env.exec(`cat > /tmp/test_importlib_pyodide.py << 'EOF'
try:
    import importlib
    importlib.import_module('pyodide')
    print('VULNERABLE: importlib.import_module bypassed sandbox')
except ImportError as e:
    if 'blocked' in str(e):
        print('SECURE: importlib.import_module blocked')
    else:
        print(f'ERROR: {e}')
EOF`);
      const result = await env.exec("python3 /tmp/test_importlib_pyodide.py");
      expect(result.stdout).toContain("SECURE");
      expect(result.stdout).not.toContain("VULNERABLE");
      expect(result.exitCode).toBe(0);
    });

    it("should block importlib.util.find_spec('js')", async () => {
      const env = new Bash({ python: true });
      await env.exec(`cat > /tmp/test_find_spec.py << 'EOF'
try:
    import importlib.util
    spec = importlib.util.find_spec('js')
    print('VULNERABLE: find_spec bypassed sandbox')
except ImportError as e:
    if 'blocked' in str(e):
        print('SECURE: find_spec blocked')
    else:
        print(f'ERROR: {e}')
EOF`);
      const result = await env.exec("python3 /tmp/test_find_spec.py");
      expect(result.stdout).toContain("SECURE");
      expect(result.stdout).not.toContain("VULNERABLE");
      expect(result.exitCode).toBe(0);
    });

    it("should still block 'import js' even after sys.modules insertion", async () => {
      const env = new Bash({ python: true });
      await env.exec(`cat > /tmp/test_sysmodules.py << 'EOF'
import sys
import types
# Even if attacker manages to insert a fake module into sys.modules,
# builtins.__import__ still blocks the import statement
fake_js = types.ModuleType('js')
sys.modules['js'] = fake_js
try:
    import js
    print('VULNERABLE: import js succeeded after sys.modules insertion')
except ImportError as e:
    if 'blocked' in str(e):
        print('SECURE: import js still blocked by __import__ hook')
    else:
        print(f'ERROR: {e}')
EOF`);
      const result = await env.exec("python3 /tmp/test_sysmodules.py");
      expect(result.stdout).toContain("SECURE");
      expect(result.stdout).not.toContain("VULNERABLE");
      expect(result.exitCode).toBe(0);
    });

    it("should allow importlib.import_module('json') (legitimate use)", async () => {
      const env = new Bash({ python: true });
      const result = await env.exec(
        "python3 -c \"import importlib; m = importlib.import_module('json'); print(m.dumps({'ok': True}))\"",
      );
      expect(result.stdout).toContain('{"ok": true}');
      expect(result.exitCode).toBe(0);
    });
  });

  describe("introspection bypass attempts", () => {
    it("should block __kwdefaults__ access on __import__ (critical bypass)", async () => {
      const env = new Bash({ python: true });
      await env.exec(`cat > /tmp/test_kwdefaults.py << 'EOF'
import builtins
try:
    # Old vulnerability: __kwdefaults__ exposed the original __import__
    kwdefaults = builtins.__import__.__kwdefaults__
    if kwdefaults and '_orig' in kwdefaults:
        # Could bypass import blocking via kwdefaults['_orig']('js')
        print(f'VULNERABLE: __kwdefaults__ exposed: {list(kwdefaults.keys())}')
    else:
        print('SECURE: __kwdefaults__ not exploitable')
except AttributeError as e:
    print(f'SECURE: __kwdefaults__ access blocked')
EOF`);
      const result = await env.exec("python3 /tmp/test_kwdefaults.py");
      expect(result.stdout).toContain("SECURE");
      expect(result.stdout).not.toContain("VULNERABLE");
      expect(result.exitCode).toBe(0);
    });

    it("should block __closure__ access on __import__", async () => {
      const env = new Bash({ python: true });
      await env.exec(`cat > /tmp/test_closure.py << 'EOF'
import builtins
try:
    closure = builtins.__import__.__closure__
    print(f'VULNERABLE: __closure__ accessible: {closure}')
except AttributeError as e:
    print(f'SECURE: __closure__ access blocked')
EOF`);
      const result = await env.exec("python3 /tmp/test_closure.py");
      expect(result.stdout).toContain("SECURE");
      expect(result.stdout).not.toContain("VULNERABLE");
      expect(result.exitCode).toBe(0);
    });

    it("should block __globals__ access on __import__", async () => {
      const env = new Bash({ python: true });
      await env.exec(`cat > /tmp/test_globals.py << 'EOF'
import builtins
try:
    g = builtins.__import__.__globals__
    print('VULNERABLE')
except AttributeError:
    print('SECURE')
EOF`);
      const result = await env.exec("python3 /tmp/test_globals.py");
      expect(result.stdout).toContain("SECURE");
      expect(result.exitCode).toBe(0);
    });

    it("should block __closure__ access on builtins.open", async () => {
      const env = new Bash({ python: true });
      await env.exec(`cat > /tmp/test_open_closure.py << 'EOF'
import builtins
try:
    closure = builtins.open.__closure__
    print(f'VULNERABLE: closure={closure}')
except AttributeError:
    print('SECURE: __closure__ blocked')
EOF`);
      const result = await env.exec("python3 /tmp/test_open_closure.py");
      expect(result.stdout).toContain("SECURE");
      expect(result.exitCode).toBe(0);
    });

    it("should block __closure__ access on os.listdir", async () => {
      const env = new Bash({ python: true });
      await env.exec(`cat > /tmp/test_listdir_closure.py << 'EOF'
import os
try:
    closure = os.listdir.__closure__
    print(f'VULNERABLE: closure={closure}')
except AttributeError:
    print('SECURE: __closure__ blocked')
EOF`);
      const result = await env.exec("python3 /tmp/test_listdir_closure.py");
      expect(result.stdout).toContain("SECURE");
      expect(result.exitCode).toBe(0);
    });

    it("should redirect shutil.copy to /host and block introspection", async () => {
      const env = new Bash({ python: true });
      await env.exec('echo "shutil test" > /tmp/shutil_src.txt');
      await env.exec(`cat > /tmp/test_shutil.py << 'EOF'
import shutil
# Test that shutil.copy works with redirect
shutil.copy('/tmp/shutil_src.txt', '/tmp/shutil_dst.txt')
with open('/tmp/shutil_dst.txt') as f:
    print(f'COPY_OK: {f.read().strip()}')
# Test that introspection is blocked
try:
    closure = shutil.copy.__closure__
    print(f'VULNERABLE: closure={closure}')
except AttributeError:
    print('SECURE: __closure__ blocked')
EOF`);
      const result = await env.exec("python3 /tmp/test_shutil.py");
      expect(result.stdout).toContain("COPY_OK: shutil test");
      expect(result.stdout).toContain("SECURE");
      expect(result.exitCode).toBe(0);
    });

    it("should redirect pathlib.Path operations to /host", async () => {
      const env = new Bash({ python: true });
      await env.exec('echo "pathlib test content" > /tmp/pathlib_test.txt');
      await env.exec(`cat > /tmp/test_pathlib.py << 'EOF'
from pathlib import Path

# Test Path.read_text()
p = Path('/tmp/pathlib_test.txt')
content = p.read_text().strip()
print(f'READ_OK: {content}')

# Test Path.exists()
if p.exists():
    print('EXISTS_OK')

# Test Path.is_file()
if p.is_file():
    print('IS_FILE_OK')

# Test Path.write_text()
p2 = Path('/tmp/pathlib_write.txt')
p2.write_text('written by pathlib')
print(f'WRITE_OK: {p2.read_text().strip()}')

# Test Path.iterdir() - paths should not have /host prefix
tmp = Path('/tmp')
files = [f.name for f in tmp.iterdir() if f.name.startswith('pathlib')]
print(f'ITERDIR_OK: {sorted(files)}')
EOF`);
      const result = await env.exec("python3 /tmp/test_pathlib.py");
      expect(result.stdout).toContain("READ_OK: pathlib test content");
      expect(result.stdout).toContain("EXISTS_OK");
      expect(result.stdout).toContain("IS_FILE_OK");
      expect(result.stdout).toContain("WRITE_OK: written by pathlib");
      expect(result.stdout).toContain("ITERDIR_OK:");
      expect(result.exitCode).toBe(0);
    });
  });

  describe("file operation redirects", () => {
    it("should redirect glob.glob to /host", async () => {
      const env = new Bash({ python: true });
      await env.exec('echo "test content" > /tmp/test_glob.txt');
      const result = await env.exec(`python3 -c "
import glob
files = glob.glob('/tmp/test_glob.txt')
print(files)
"`);
      // The glob should find the file via /host redirection
      expect(result.stdout).toContain("test_glob.txt");
      expect(result.exitCode).toBe(0);
    });

    it("should redirect os.walk to /host", async () => {
      const env = new Bash({ python: true });
      await env.exec("mkdir -p /tmp/test_walk_dir");
      await env.exec('echo "content1" > /tmp/test_walk_dir/file1.txt');
      await env.exec(`cat > /tmp/test_walk.py << 'EOF'
import os
for root, dirs, files in os.walk('/tmp/test_walk_dir'):
    print(f'root={root}, files={files}')
EOF`);
      const result = await env.exec("python3 /tmp/test_walk.py");
      expect(result.stdout).toContain("root=/tmp/test_walk_dir");
      expect(result.stdout).toContain("file1.txt");
      expect(result.exitCode).toBe(0);
    });

    it("should redirect os.scandir to /host", async () => {
      const env = new Bash({ python: true });
      await env.exec("mkdir -p /tmp/test_scandir");
      await env.exec('echo "content" > /tmp/test_scandir/scanfile.txt');
      const result = await env.exec(`python3 -c "
import os
entries = list(os.scandir('/tmp/test_scandir'))
print([e.name for e in entries])
"`);
      expect(result.stdout).toContain("scanfile.txt");
      expect(result.exitCode).toBe(0);
    });

    it("should redirect io.open to /host", async () => {
      const env = new Bash({ python: true });
      await env.exec('echo "io.open test content" > /tmp/test_io_open.txt');
      await env.exec(`cat > /tmp/test_io.py << 'EOF'
import io
with io.open('/tmp/test_io_open.txt', 'r') as f:
    print(f.read())
EOF`);
      const result = await env.exec("python3 /tmp/test_io.py");
      expect(result.stdout).toContain("io.open test content");
      expect(result.exitCode).toBe(0);
    });
  });

  describe("legitimate operations still work", () => {
    it("should allow normal file operations", async () => {
      const env = new Bash({ python: true });
      await env.exec('echo "allowed content" > /tmp/allowed_file.txt');
      await env.exec(`cat > /tmp/test_read.py << 'EOF'
with open('/tmp/allowed_file.txt', 'r') as f:
    print(f.read())
EOF`);
      const result = await env.exec("python3 /tmp/test_read.py");
      expect(result.stdout).toContain("allowed content");
      expect(result.exitCode).toBe(0);
    });

    it("should allow normal imports", async () => {
      const env = new Bash({ python: true });
      const result = await env.exec(
        "python3 -c \"import json; print(json.dumps({'a': 1}))\"",
      );
      expect(result.stdout).toBe('{"a": 1}\n');
      expect(result.exitCode).toBe(0);
    });

    it("should allow list comprehensions and lambdas", async () => {
      const env = new Bash({ python: true });
      const result = await env.exec(
        'python3 -c "print(list(map(lambda x: x*2, [1,2,3])))"',
      );
      expect(result.stdout).toBe("[2, 4, 6]\n");
      expect(result.exitCode).toBe(0);
    });

    it("should allow os.getcwd and os.chdir", async () => {
      const env = new Bash({ python: true });
      await env.exec("mkdir -p /tmp/test_chdir_dir");
      const result = await env.exec(`python3 -c "
import os
os.chdir('/tmp/test_chdir_dir')
print(os.getcwd())
"`);
      expect(result.stdout).toBe("/tmp/test_chdir_dir\n");
      expect(result.exitCode).toBe(0);
    });
  });

  describe("sandbox init variable isolation", () => {
    it("should not expose _jb_blocked_set on builtins", async () => {
      const env = new Bash({ python: true });
      const result = await env.exec(
        "python3 -c \"import builtins; print(hasattr(builtins, '_jb_blocked_set'))\"",
      );
      expect(result.stdout).toBe("False\n");
      expect(result.exitCode).toBe(0);
    });

    it("should not expose _orig_import_module in __main__ globals", async () => {
      const env = new Bash({ python: true });
      await env.exec(`cat > /tmp/test_leaked_globals.py << 'EOF'
try:
    val = _orig_import_module
    print(f'VULNERABLE: _orig_import_module={val}')
except NameError:
    print('SECURE: _orig_import_module not in globals')
EOF`);
      const result = await env.exec("python3 /tmp/test_leaked_globals.py");
      expect(result.stdout).toContain("SECURE");
      expect(result.stdout).not.toContain("VULNERABLE");
      expect(result.exitCode).toBe(0);
    });
  });

  describe("gc object-discovery blocking", () => {
    it("should return empty from gc.get_objects()", async () => {
      const env = new Bash({ python: true });
      const result = await env.exec(
        'python3 -c "import gc; print(len(gc.get_objects()))"',
      );
      expect(result.stdout).toBe("0\n");
      expect(result.exitCode).toBe(0);
    });

    it("should return empty from gc.get_referrers()", async () => {
      const env = new Bash({ python: true });
      const result = await env.exec(
        'python3 -c "import gc; x = []; print(len(gc.get_referrers(x)))"',
      );
      expect(result.stdout).toBe("0\n");
      expect(result.exitCode).toBe(0);
    });

    it("should not find js module via gc.get_objects()", async () => {
      const env = new Bash({ python: true });
      await env.exec(`cat > /tmp/test_gc_escape.py << 'EOF'
import gc
objs = gc.get_objects()
js_modules = [o for o in objs if hasattr(o, '__name__') and getattr(o, '__name__', '') == 'js']
if js_modules:
    print('VULNERABLE: found js module via gc')
else:
    print('SECURE: gc.get_objects() cannot find js module')
EOF`);
      const result = await env.exec("python3 /tmp/test_gc_escape.py");
      expect(result.stdout).toContain("SECURE");
      expect(result.stdout).not.toContain("VULNERABLE");
      expect(result.exitCode).toBe(0);
    });
  });

  describe("_pyodide module blocking", () => {
    it("should block import _pyodide", async () => {
      const env = new Bash({ python: true });
      const result = await env.exec('python3 -c "import _pyodide"');
      expect(result.stderr).toContain("ImportError");
      expect(result.stderr).toContain("blocked");
      expect(result.exitCode).toBe(1);
    });

    it("should block import _pyodide._base", async () => {
      const env = new Bash({ python: true });
      const result = await env.exec('python3 -c "import _pyodide._base"');
      expect(result.stderr).toContain("ImportError");
      expect(result.stderr).toContain("blocked");
      expect(result.exitCode).toBe(1);
    });

    it("should block import _pyodide_core (underscore not dot)", async () => {
      const env = new Bash({ python: true });
      const result = await env.exec('python3 -c "import _pyodide_core"');
      expect(result.stderr).toContain("ImportError");
      expect(result.stderr).toContain("blocked");
      expect(result.exitCode).toBe(1);
    });

    it("should not have _pyodide_core in sys.modules after scrub", async () => {
      const env = new Bash({ python: true });
      const result = await env.exec(
        "python3 -c \"import sys; print(sys.modules.get('_pyodide_core', 'CLEAN'))\"",
      );
      expect(result.stdout).toBe("CLEAN\n");
      expect(result.exitCode).toBe(0);
    });

    it("should block _pyodide_core escape via create_proxy", async () => {
      const env = new Bash({ python: true });
      await env.exec(`cat > /tmp/test_pyodide_core.py << 'EOF'
import sys
core = sys.modules.get('_pyodide_core')
if core:
    try:
        p = core.create_proxy(lambda: 'hello')
        print('VULNERABLE: _pyodide_core.create_proxy works, returned', type(p))
    except Exception as e:
        print(f'PARTIAL: _pyodide_core in sys.modules but create_proxy failed: {e}')
else:
    print('SECURE: _pyodide_core not in sys.modules')
EOF`);
      const result = await env.exec("python3 /tmp/test_pyodide_core.py");
      expect(result.stdout).toContain("SECURE");
      expect(result.stdout).not.toContain("VULNERABLE");
      expect(result.exitCode).toBe(0);
    });
  });

  describe("_jb_http_bridge blocking", () => {
    it("should block import _jb_http_bridge", async () => {
      const env = new Bash({ python: true });
      const result = await env.exec('python3 -c "import _jb_http_bridge"');
      expect(result.stderr).toContain("ImportError");
      expect(result.stderr).toContain("blocked");
      expect(result.exitCode).toBe(1);
    });

    it("should block constructor chain escape via _jb_http_bridge", async () => {
      const env = new Bash({ python: true });
      await env.exec(`cat > /tmp/test_bridge_escape.py << 'EOF'
try:
    import _jb_http_bridge
    ctor = _jb_http_bridge.constructor
    func_ctor = ctor.constructor
    fn = func_ctor('return globalThis')
    print('VULNERABLE: escaped via _jb_http_bridge.constructor chain')
except ImportError as e:
    if 'blocked' in str(e):
        print('SECURE: _jb_http_bridge import blocked')
    else:
        print(f'ERROR: {e}')
except Exception as e:
    print(f'BLOCKED_LATE: {type(e).__name__}: {e}')
EOF`);
      const result = await env.exec("python3 /tmp/test_bridge_escape.py");
      expect(result.stdout).toContain("SECURE");
      expect(result.stdout).not.toContain("VULNERABLE");
      expect(result.exitCode).toBe(0);
    });

    it("should still allow jb_http module to work", async () => {
      const env = new Bash({ python: true });
      await env.exec(`cat > /tmp/test_jb_http_works.py << 'EOF'
import jb_http
try:
    resp = jb_http.get('http://example.com')
    print('HTTP_OK:', resp.status_code)
except Exception as e:
    msg = str(e)
    if 'not available' in msg:
        print('BROKEN: bridge not available')
    elif 'Network' in msg or 'not configured' in msg:
        print('OK: bridge works, network not configured')
    else:
        print('OK: bridge works, got error:', msg[:80])
EOF`);
      const result = await env.exec("python3 /tmp/test_jb_http_works.py");
      expect(result.stdout).toContain("OK");
      expect(result.stdout).not.toContain("BROKEN");
      expect(result.exitCode).toBe(0);
    });
  });

  describe("sys.settrace / sys.setprofile blocking", () => {
    it("should neuter sys.settrace to prevent frame inspection", async () => {
      const env = new Bash({ python: true });
      await env.exec(`cat > /tmp/test_settrace.py << 'EOF'
import sys

stolen_import = None
def trace_fn(frame, event, arg):
    global stolen_import
    if event == 'call' and stolen_import is None:
        for k, v in frame.f_locals.items():
            if k == 'orig_import' and callable(v):
                stolen_import = v
                sys.settrace(None)
                return None
    return trace_fn

sys.settrace(trace_fn)
import json
sys.settrace(None)

if stolen_import:
    print('VULNERABLE: stole orig_import via settrace')
else:
    print('SECURE: settrace neutered, no frame leak')
EOF`);
      const result = await env.exec("python3 /tmp/test_settrace.py");
      expect(result.stdout).toContain("SECURE");
      expect(result.stdout).not.toContain("VULNERABLE");
      expect(result.exitCode).toBe(0);
    });

    it("should neuter sys.setprofile to prevent frame inspection", async () => {
      const env = new Bash({ python: true });
      await env.exec(`cat > /tmp/test_setprofile.py << 'EOF'
import sys

stolen = None
def profile_fn(frame, event, arg):
    global stolen
    if stolen is None:
        for k, v in frame.f_locals.items():
            if k == 'orig_import' and callable(v):
                stolen = v
                return
    return

sys.setprofile(profile_fn)
import json
sys.setprofile(None)

if stolen:
    print('VULNERABLE: stole orig_import via setprofile')
else:
    print('SECURE: setprofile neutered')
EOF`);
      const result = await env.exec("python3 /tmp/test_setprofile.py");
      expect(result.stdout).toContain("SECURE");
      expect(result.stdout).not.toContain("VULNERABLE");
      expect(result.exitCode).toBe(0);
    });

    it("should strip traceback frames to prevent orig_import leak", async () => {
      const env = new Bash({ python: true });
      await env.exec(`cat > /tmp/test_tb_leak.py << 'EOF'
import sys

stolen = None
try:
    import js
except ImportError as e:
    tb = e.__traceback__
    while tb:
        frame = tb.tb_frame
        if 'orig_import' in frame.f_locals:
            stolen = frame.f_locals['orig_import']
            break
        tb = tb.tb_next

if stolen:
    print('VULNERABLE: stole orig_import via traceback')
else:
    print('SECURE: traceback stripped, no frame leak')
EOF`);
      const result = await env.exec("python3 /tmp/test_tb_leak.py");
      expect(result.stdout).toContain("SECURE");
      expect(result.stdout).not.toContain("VULNERABLE");
      expect(result.exitCode).toBe(0);
    });

    it("should block full settrace+meta_path exploit chain", async () => {
      const env = new Bash({ python: true });
      await env.exec(`cat > /tmp/test_full_exploit.py << 'EOF'
import sys

# Step 1: Try to steal orig_import via settrace
stolen = None
def trace_fn(frame, event, arg):
    global stolen
    if event == 'call' and stolen is None:
        for k, v in frame.f_locals.items():
            if k == 'orig_import' and callable(v):
                stolen = v
                return None
    return trace_fn

sys.settrace(trace_fn)
import json
sys.settrace(None)

if stolen:
    # Step 2: Remove BlockingFinder
    for f in list(sys.meta_path):
        if 'Blocking' in type(f).__name__:
            sys.meta_path.remove(f)
    try:
        js = stolen('js')
        print('VULNERABLE: full exploit chain succeeded')
    except Exception as e:
        print(f'PARTIAL: stole import but load failed: {e}')
else:
    print('SECURE: settrace neutered, exploit chain broken')
EOF`);
      const result = await env.exec("python3 /tmp/test_full_exploit.py");
      expect(result.stdout).toContain("SECURE");
      expect(result.stdout).not.toContain("VULNERABLE");
      expect(result.exitCode).toBe(0);
    });
  });

  describe("importlib._bootstrap patching", () => {
    it("should block _bootstrap.__import__ direct access", async () => {
      const env = new Bash({ python: true });
      await env.exec(`cat > /tmp/test_bootstrap_import.py << 'EOF'
import sys
b = sys.modules.get('importlib._bootstrap')
orig = b.__import__
for f in list(sys.meta_path):
    if 'Blocking' in type(f).__name__:
        sys.meta_path.remove(f)
try:
    js = orig('js')
    print('VULNERABLE: _bootstrap.__import__ bypassed sandbox')
except ImportError as e:
    if 'blocked' in str(e):
        print('SECURE: _bootstrap.__import__ is patched')
    else:
        print(f'ERROR: {e}')
EOF`);
      const result = await env.exec("python3 /tmp/test_bootstrap_import.py");
      expect(result.stdout).toContain("SECURE");
      expect(result.stdout).not.toContain("VULNERABLE");
      expect(result.exitCode).toBe(0);
    });

    it("should block closure-chain orig_import even with meta_path removed", async () => {
      const env = new Bash({ python: true });
      await env.exec(`cat > /tmp/test_closure_chain.py << 'EOF'
import builtins, sys
imp = builtins.__import__
cls = type(imp)
call_fn = cls.__call__
try:
    inner = call_fn.__closure__[0].cell_contents
    orig_import = inner.__closure__[1].cell_contents
except Exception:
    print('SECURE: closure chain inaccessible')
    exit()

for f in list(sys.meta_path):
    if 'Blocking' in type(f).__name__:
        sys.meta_path.remove(f)
try:
    js = orig_import('js')
    print('VULNERABLE: closure chain bypass succeeded')
except ImportError as e:
    if 'blocked' in str(e):
        print('SECURE: _find_and_load blocks even with orig_import')
    else:
        print(f'ERROR: {e}')
EOF`);
      const result = await env.exec("python3 /tmp/test_closure_chain.py");
      expect(result.stdout).toContain("SECURE");
      expect(result.stdout).not.toContain("VULNERABLE");
      expect(result.exitCode).toBe(0);
    });

    it("should block import even with sys.meta_path fully replaced", async () => {
      const env = new Bash({ python: true });
      await env.exec(`cat > /tmp/test_metapath_replace.py << 'EOF'
import builtins, sys
imp = builtins.__import__
cls = type(imp)
try:
    inner = cls.__call__.__closure__[0].cell_contents
    orig_import = inner.__closure__[1].cell_contents
except Exception:
    print('SECURE: closure chain inaccessible')
    exit()

# Find JsFinder and replace meta_path entirely
jsfinder = None
for f in sys.meta_path:
    if type(f).__name__ == 'JsFinder':
        jsfinder = f
if jsfinder:
    sys.meta_path = [jsfinder]
    try:
        js = orig_import('js')
        print('VULNERABLE: meta_path replacement bypassed')
    except ImportError as e:
        if 'blocked' in str(e):
            print('SECURE: _find_and_load blocks even with meta_path replaced')
        else:
            print(f'ERROR: {e}')
else:
    print('SECURE: no JsFinder found')
EOF`);
      const result = await env.exec("python3 /tmp/test_metapath_replace.py");
      expect(result.stdout).toContain("SECURE");
      expect(result.stdout).not.toContain("VULNERABLE");
      expect(result.exitCode).toBe(0);
    });
  });

  describe("sys.modules direct access", () => {
    it("should not have 'js' in sys.modules after scrub", async () => {
      const env = new Bash({ python: true });
      const result = await env.exec(
        "python3 -c \"import sys; print(sys.modules.get('js', 'CLEAN'))\"",
      );
      expect(result.stdout).toBe("CLEAN\n");
      expect(result.exitCode).toBe(0);
    });

    it("should still block 'import js' even after sys.modules['js'] = fake", async () => {
      const env = new Bash({ python: true });
      await env.exec(`cat > /tmp/test_sysmod_direct.py << 'EOF'
import sys
import types
# Attacker inserts fake module directly into sys.modules
fake = types.ModuleType('js')
sys.modules['js'] = fake
try:
    import js
    print('VULNERABLE: import js succeeded via sys.modules injection')
except ImportError as e:
    if 'blocked' in str(e):
        print('SECURE: import js blocked despite sys.modules injection')
    else:
        print(f'ERROR: {e}')
EOF`);
      const result = await env.exec("python3 /tmp/test_sysmod_direct.py");
      expect(result.stdout).toContain("SECURE");
      expect(result.stdout).not.toContain("VULNERABLE");
      expect(result.exitCode).toBe(0);
    });
  });

  describe("__subclasses__() probing", () => {
    it("should not yield classes that can instantiate a JS escape", async () => {
      const env = new Bash({ python: true });
      await env.exec(`cat > /tmp/test_subclasses.py << 'EOF'
# Probe object.__subclasses__() for JsProxy-like classes
found_escape = False
for cls in object.__subclasses__():
    name = cls.__name__
    # Look for JsProxy or similar Pyodide FFI classes
    if 'JsProxy' in name or 'Js' in name:
        try:
            # Try to instantiate and use it to access JS
            instance = cls.__new__(cls)
            # Try common escape patterns
            if hasattr(instance, 'globalThis'):
                found_escape = True
                print(f'VULNERABLE: {name} has globalThis')
                break
            if hasattr(instance, 'eval'):
                found_escape = True
                print(f'VULNERABLE: {name} has eval')
                break
        except Exception:
            pass  # Class can't be instantiated without args, that's fine
if not found_escape:
    print('SECURE: no exploitable JsProxy subclass found')
EOF`);
      const result = await env.exec("python3 /tmp/test_subclasses.py");
      expect(result.stdout).toContain("SECURE");
      expect(result.stdout).not.toContain("VULNERABLE");
      expect(result.exitCode).toBe(0);
    });
  });

  describe("sys._getframe() / inspect introspection", () => {
    it("should not allow sys._getframe() to enable sandbox escape", async () => {
      const env = new Bash({ python: true });
      await env.exec(`cat > /tmp/test_getframe.py << 'EOF'
import sys
# Even if orig_import is visible in some frame (due to deeper import
# machinery patching), it should not be usable for sandbox escape
# because _find_and_load is also patched at the lowest level.
stolen = None
try:
    f = sys._getframe(0)
    while f is not None:
        if 'orig_import' in f.f_locals and callable(f.f_locals['orig_import']):
            stolen = f.f_locals['orig_import']
            break
        f = f.f_back
except Exception:
    pass

if stolen:
    # Even with orig_import, try the full exploit chain
    for finder in list(sys.meta_path):
        if 'Blocking' in type(finder).__name__:
            sys.meta_path.remove(finder)
    try:
        js = stolen('js')
        print('VULNERABLE: _getframe exploit succeeded')
    except ImportError as e:
        if 'blocked' in str(e):
            print('SECURE: _find_and_load blocks even with stolen orig_import')
        else:
            print(f'ERROR: {e}')
else:
    print('SECURE: orig_import not found in frames')
EOF`);
      const result = await env.exec("python3 /tmp/test_getframe.py");
      expect(result.stdout).toContain("SECURE");
      expect(result.stdout).not.toContain("VULNERABLE");
      expect(result.exitCode).toBe(0);
    });

    it("should not leak original function via inspect on builtins.open", async () => {
      const env = new Bash({ python: true });
      await env.exec(`cat > /tmp/test_inspect_open.py << 'EOF'
import builtins
try:
    import inspect
    members = inspect.getmembers(builtins.open)
    # Look for leaked original function references
    leaked = [n for n, v in members if 'orig' in str(n).lower() or 'closure' in str(n).lower()]
    if leaked:
        print(f'VULNERABLE: leaked members: {leaked}')
    else:
        print('SECURE: no leaked members on builtins.open')
except (TypeError, AttributeError):
    print('SECURE: inspect.getmembers blocked')
EOF`);
      const result = await env.exec("python3 /tmp/test_inspect_open.py");
      expect(result.stdout).toContain("SECURE");
      expect(result.stdout).not.toContain("VULNERABLE");
      expect(result.exitCode).toBe(0);
    });

    it("should block __dict__ access on __import__ wrapper", async () => {
      const env = new Bash({ python: true });
      await env.exec(`cat > /tmp/test_import_dict.py << 'EOF'
import builtins
try:
    d = type(builtins.__import__).__dict__
    # Even if we get the dict, it shouldn't expose internals
    leaked = [k for k in d if 'orig' in k.lower() or 'import' in k.lower() or 'blocked' in k.lower()]
    if leaked:
        print(f'INFO: type dict keys with import/orig/blocked: {leaked}')
    else:
        print('SECURE: no leaked internals in type dict')
except (AttributeError, TypeError):
    print('SECURE: type dict access blocked')
EOF`);
      const result = await env.exec("python3 /tmp/test_import_dict.py");
      // Should be SECURE either way - either blocked or no leaked internals
      expect(result.stdout).toContain("SECURE");
      expect(result.exitCode).toBe(0);
    });
  });

  describe("ctypes blocking", () => {
    it("should block import ctypes", async () => {
      const env = new Bash({ python: true });
      const result = await env.exec('python3 -c "import ctypes"');
      expect(result.stderr).toContain("ImportError");
      expect(result.stderr).toContain("blocked");
      expect(result.exitCode).toBe(1);
    });

    it("should block import _ctypes", async () => {
      const env = new Bash({ python: true });
      const result = await env.exec('python3 -c "import _ctypes"');
      expect(result.stderr).toContain("ImportError");
      expect(result.stderr).toContain("blocked");
      expect(result.exitCode).toBe(1);
    });
  });

  describe("_jb_scrub_modules removal", () => {
    it("should not expose _jb_scrub_modules on builtins", async () => {
      const env = new Bash({ python: true });
      const result = await env.exec(
        "python3 -c \"import builtins; print(hasattr(builtins, '_jb_scrub_modules'))\"",
      );
      expect(result.stdout).toBe("False\n");
      expect(result.exitCode).toBe(0);
    });
  });

  describe("meta_path resilience", () => {
    it("should still block 'import js' after sys.meta_path.clear()", async () => {
      const env = new Bash({ python: true });
      await env.exec(`cat > /tmp/test_meta_path_clear.py << 'EOF'
import sys
sys.meta_path.clear()
try:
    import js
    print('VULNERABLE: import js succeeded after meta_path.clear()')
except ImportError as e:
    if 'blocked' in str(e):
        print('SECURE: import js still blocked by __import__ hook')
    else:
        print(f'ERROR: {e}')
EOF`);
      const result = await env.exec("python3 /tmp/test_meta_path_clear.py");
      expect(result.stdout).toContain("SECURE");
      expect(result.stdout).not.toContain("VULNERABLE");
      expect(result.exitCode).toBe(0);
    });
  });
});
