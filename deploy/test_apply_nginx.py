#!/usr/bin/env python3
"""apply-nginx.py 的回归测试。

跑：python3 deploy/test_apply_nginx.py

不用 pytest：这个脚本要能在只装了 python3 的服务器上跑起来自检。
所有写文件用例都用 --no-nginx，不会碰本机的 nginx。
"""

import importlib.util
import os
import shutil
import stat
import subprocess
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPT = os.path.join(HERE, 'apply-nginx.py')

_spec = importlib.util.spec_from_file_location('apply_nginx', SCRIPT)
mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(mod)

SNIPPET = """\
# 片段里的注释不该进配置
location = /app { return 301 /app/$is_args$args; }
location = /app/healthz { proxy_pass http://127.0.0.1:3020/api/health; }
location ^~ /app/api/ { proxy_pass http://127.0.0.1:3020/api/; }
location ^~ /app/assets/ {
    root /var/www;
    try_files $uri =404;
    # 嵌套块里的注释也要能解析
    location ~* \\.(php|py)$ { return 404; }
}
location /app/ {
    root /var/www;
    try_files $uri $uri/ /app/index.html;
}
"""

SITE = """\
http {
    server {
        listen 80;
        server_name example.com;
        return 301 https://$host$request_uri;
    }

    server {
        listen 443 ssl http2;
        listen [::]:443 ssl;
        server_name example.com www.example.com;
        ssl_certificate /etc/ssl/example.pem;

        # 同机已上线的站点
        location /console/ {
            alias /var/www/console/;
            try_files $uri $uri/ /console/index.html;
        }
        location ~ .*\\.(js|css)?$ {
            expires 30d;
        }
    }
}
"""


class Base(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp(prefix='apply-nginx-test-')
        self.addCleanup(shutil.rmtree, self.dir, True)

    def write(self, name, text, mode=None):
        path = os.path.join(self.dir, name)
        with open(path, 'w', encoding='utf-8', newline='') as fh:
            fh.write(text)
        if mode is not None:
            os.chmod(path, mode)
        return path

    def run_script(self, *args):
        return subprocess.run(
            [sys.executable, SCRIPT, *args],
            capture_output=True, text=True, cwd=self.dir,
        )

    def apply(self, site_text=SITE, snippet_text=SNIPPET, extra=()):
        site = self.write('site.conf', site_text)
        snippet = self.write('snippet.conf', snippet_text)
        result = self.run_script(
            '--config', site, '--server-name', 'example.com',
            '--snippet', snippet, '--no-nginx', *extra,
        )
        return result, site

    def read(self, path):
        with open(path, encoding='utf-8') as fh:
            return fh.read()


class KeyNormalization(unittest.TestCase):
    def key(self, text):
        return mod.location_key(mod.parse(text)[0])

    def test_modifier_before_and_attached_are_equal(self):
        self.assertEqual(self.key('location ^~ /x { }'), self.key('location ^~/x { }'))
        self.assertEqual(self.key('location = /x { }'), self.key('location =/x { }'))

    def test_caret_tilde_is_a_plain_prefix(self):
        # nginx 里 ^~ 只影响正则搜索，不改变它匹配哪一批 URI
        self.assertEqual(self.key('location ^~ /x { }'), self.key('location /x { }'))

    def test_exact_and_prefix_differ(self):
        self.assertNotEqual(self.key('location = /x { }'), self.key('location /x { }'))

    def test_case_insensitive_regex_is_distinct(self):
        self.assertNotEqual(self.key('location ~ /x { }'), self.key('location ~* /x { }'))

    def test_regex_backslash_is_preserved(self):
        node = mod.parse(r'location ~ ^/x\.env$ { }')[0]
        self.assertEqual(node.args[1], r'^/x\.env$')
        self.assertNotEqual(self.key(r'location ~ ^/x\.env$ { }'),
                            self.key(r'location ~ ^/xXenv$ { }'))

    def test_quoted_arguments_lose_only_their_quotes(self):
        node = mod.parse('location "/a b" { }')[0]
        self.assertEqual(node.args[0], '/a b')


class Parser(unittest.TestCase):
    def test_unbalanced_braces(self):
        with self.assertRaises(mod.ParseError):
            mod.parse('server { listen 443;')

    def test_extra_closing_brace(self):
        with self.assertRaises(mod.ParseError):
            mod.parse('server { } }')

    def test_comment_at_token_start(self):
        nodes = mod.parse('# location /x { }\nserver { listen 443; }')
        self.assertEqual([n.name for n in nodes], ['server'])

    def test_hash_inside_quote_is_not_a_comment(self):
        node = mod.parse('set $a "x#y";')[0]
        self.assertEqual(node.args[1], 'x#y')

    def test_ipv6_listen(self):
        node = mod.parse('listen [::]:443 ssl;')[0]
        self.assertEqual(mod.listen_ports(node), ['443'])

    def test_named_port_and_flags(self):
        node = mod.parse('listen 0.0.0.0:443 ssl default_server;')[0]
        self.assertEqual(mod.listen_ports(node), ['443'])


class Insertion(Base):
    def test_inserts_into_the_443_block(self):
        result, site = self.apply()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        text = self.read(site)
        at_api = text.index('location ^~ /app/api/')
        at_443 = text.index('listen 443')
        at_close = text.rindex('}')
        self.assertGreater(at_api, at_443)
        self.assertLess(at_api, at_close)

    def test_snippet_comments_are_not_copied(self):
        result, site = self.apply()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        text = self.read(site)
        self.assertNotIn('片段里的注释', text)
        # 嵌套块保持完整
        self.assertIn('location ~* \\.(php|py)$', text)

    def test_backup_keeps_original_content(self):
        site = self.write('site.conf', SITE)
        snippet = self.write('snippet.conf', SNIPPET)
        before = self.read(site)
        result = self.run_script('--config', site, '--server-name', 'example.com',
                                 '--snippet', snippet, '--no-nginx')
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        backups = [n for n in os.listdir(self.dir) if '.bak.' in n]
        self.assertEqual(len(backups), 1, backups)
        with open(os.path.join(self.dir, backups[0]), encoding='utf-8') as fh:
            self.assertEqual(fh.read(), before)

    def test_write_preserves_mode(self):
        site = self.write('site.conf', SITE, mode=0o640)
        snippet = self.write('snippet.conf', SNIPPET)
        self.run_script('--config', site, '--server-name', 'example.com',
                        '--snippet', snippet, '--no-nginx')
        self.assertEqual(stat.S_IMODE(os.stat(site).st_mode), 0o640)

    def test_crlf_config_is_handled(self):
        result, site = self.apply(SITE.replace('\n', '\r\n'))
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn('location ^~ /app/api/', self.read(site))

    def test_dry_run_does_not_write(self):
        site = self.write('site.conf', SITE)
        snippet = self.write('snippet.conf', SNIPPET)
        before = self.read(site)
        result = self.run_script('--config', site, '--server-name', 'example.com',
                                 '--snippet', snippet, '--dry-run')
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(self.read(site), before)
        self.assertEqual([n for n in os.listdir(self.dir) if '.bak.' in n], [])


class Refusals(Base):
    def test_no_matching_server(self):
        result, site = self.apply()
        self.assertEqual(result.returncode, 0)
        snippet = os.path.join(self.dir, 'snippet.conf')
        result = self.run_script('--config', site, '--server-name', 'other.com',
                                 '--snippet', snippet, '--no-nginx')
        self.assertEqual(result.returncode, 2)
        self.assertIn('没有找到', result.stdout + result.stderr)

    def test_two_matching_servers(self):
        doubled = """\
http {
    server { listen 443 ssl; server_name example.com; }
    server { listen 443 ssl; server_name example.com; }
}
"""
        result, site = self.apply(doubled)
        self.assertEqual(result.returncode, 2, result.stdout)
        self.assertIn('不自动选择', result.stdout + result.stderr)

    def test_matching_port_but_wrong_name_does_not_count(self):
        site_text = """\
http {
    server { listen 443 ssl; server_name other.com; }
    server { listen 8443 ssl; server_name example.com; }
}
"""
        result, site = self.apply(site_text)
        self.assertEqual(result.returncode, 2, result.stdout + result.stderr)
        self.assertIn('没有找到', result.stdout + result.stderr)

    def test_custom_port(self):
        site_text = """\
http {
    server { listen 8080; server_name example.com; }
}
"""
        site = self.write('site.conf', site_text)
        snippet = self.write('snippet.conf', SNIPPET)
        result = self.run_script('--config', site, '--server-name', 'example.com',
                                 '--snippet', snippet, '--port', '8080', '--no-nginx')
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn('location ^~ /app/api/', self.read(site))

    def test_duplicate_prefix_with_caret_tilde(self):
        site_text = SITE.replace(
            'location /console/ {',
            'location ^~ /app/assets/ { root /var/www; }\n        location /console/ {',
        )
        result, site = self.apply(site_text)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('已经有同名 location', result.stdout + result.stderr)

    def test_duplicate_exact_with_different_spacing(self):
        site_text = SITE.replace(
            'location /console/ {',
            'location =/app { return 301 /app/; }\n        location /console/ {',
        )
        result, site = self.apply(site_text)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('已经有同名 location', result.stdout + result.stderr)

    def test_comment_mentioning_location_is_not_a_conflict(self):
        site_text = SITE.replace(
            '        # 同机已上线的站点',
            '        # 这里以后要加 location ^~ /app/api/',
        )
        result, site = self.apply(site_text)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_snippet_duplicates_itself(self):
        snippet = 'location /x { }\nlocation ^~ /x { }\n'
        result, _ = self.apply(SNIPPET, snippet)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('片段里自己就有重复', result.stdout + result.stderr)

    def test_snippet_without_locations(self):
        result, _ = self.apply(SNIPPET, 'add_header X-Test 1;\n')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('没有 location', result.stdout + result.stderr)

    def test_comments_only_snippet(self):
        result, _ = self.apply(SNIPPET, '# 只有注释\n# 还有一行\n')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('空的', result.stdout + result.stderr)

    def test_multiline_string_snippet_is_refused(self):
        snippet = 'location /x { add_header X-A "line1\nline2"; }\n'
        result, _ = self.apply(SNIPPET, snippet)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('跨行', result.stdout + result.stderr)

    def test_missing_config_file(self):
        snippet = self.write('snippet.conf', SNIPPET)
        result = self.run_script('--config', os.path.join(self.dir, 'nope.conf'),
                                 '--server-name', 'example.com', '--snippet', snippet,
                                 '--no-nginx')
        self.assertNotEqual(result.returncode, 0)


class RealSnippet(unittest.TestCase):
    """仓库里那份 nginx.conf 至少要能被解析，且自身的 location 不重复。"""

    def test_repository_snippet_parses(self):
        path = os.path.join(HERE, 'nginx.conf')
        with open(path, encoding='utf-8') as fh:
            text = fh.read()
        nodes = mod.parse(mod.strip_comment_lines(text))
        locations = [n for n in nodes if n.name == 'location']
        self.assertGreaterEqual(len(locations), 5)
        keys = [mod.location_key(n) for n in locations]
        self.assertEqual(len(set(keys)), len(keys), keys)


if __name__ == '__main__':
    unittest.main(verbosity=2)
