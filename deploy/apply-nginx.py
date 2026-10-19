#!/usr/bin/env python3
"""把 deploy/nginx.conf 里的 location 块安全地插进站点的 443 server 块。

手改 nginx 站点配置最容易出的两类错：插进了别的 server 块（同机还跑着
其它站点），或者插完没生效（nginx -t 失败后 reload 不执行，线上仍是旧配置）。
这个脚本把两件事都堵住：

1. 用 nginx 自己的词法规则解析配置（引号、转义、注释、正则里的量词），
   只在「listen 443 且 server_name 精确匹配」的唯一 server 块里动手。
   候选块为 0 或大于 1 都直接退出，不猜。
2. 写完跑 `nginx -t` → `nginx -s reload` → 用 `--resolve` 把域名指向 127.0.0.1 探活。
   探活不只看状态码：还要确认首页真的引用了自己 assets 下的文件，并把这个
   文件取回来。任何一步出错（包括 nginx/curl 根本不存在），原子还原备份并
   重新 reload。

用法：
    sudo python3 deploy/apply-nginx.py \
        --config /www/server/panel/vhost/nginx/example.com.conf \
        --server-name example.com --dry-run

    sudo python3 deploy/apply-nginx.py \
        --config /www/server/panel/vhost/nginx/example.com.conf \
        --server-name example.com

    # 只改文件、不碰 nginx（例如在别的机器上生成配置）
    python3 deploy/apply-nginx.py --config ./site.conf --server-name example.com --no-nginx
"""

import argparse
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time

LISTEN_FLAGS = {
    'ssl', 'http2', 'http3', 'quic', 'default_server', 'defaultserver',
    'reuseport', 'so_keepalive', 'proxy_protocol', 'backlog', 'bind',
    'deferred', 'ipv6only', 'spdy', 'setfib', 'fastopen', 'accept_filter',
}

# nginx 会去反斜杠的字符；其它位置的 \ 原样保留（正则里 \. 是有意义的）
SIMPLE_ESCAPES = {'"': '"', "'": "'", '\\': '\\', 't': '\t', 'r': '\r', 'n': '\n'}
UNQUOTED_ESCAPES = {' ', ';', '{', '}', '\t', '\r', '\n'}


class ParseError(Exception):
    pass


class Node:
    __slots__ = ('name', 'args', 'children', 'start', 'end', 'close_pos')

    def __init__(self, name, args, start, end=None):
        self.name = name
        self.args = args
        self.children = []
        self.start = start
        self.end = end
        self.close_pos = None


def unescape(ch, quoted):
    if ch in SIMPLE_ESCAPES:
        return SIMPLE_ESCAPES[ch]
    if not quoted and ch in UNQUOTED_ESCAPES:
        return ch
    return '\\' + ch


def tokenize(text):
    """按 nginx 的规则切词：空白分隔；引号内的 \\ 只对已知转义生效；token 起始的 # 起注释。"""
    i, n = 0, len(text)
    while i < n:
        c = text[i]
        if c in ' \t\r\n':
            i += 1
            continue
        if c == '#':
            while i < n and text[i] != '\n':
                i += 1
            continue
        if c in '{};':
            yield (c, i, c)
            i += 1
            continue
        if c in '"\'':
            quote = c
            start = i
            i += 1
            buf = []
            while i < n:
                if text[i] == '\\' and i + 1 < n:
                    buf.append(unescape(text[i + 1], True))
                    i += 2
                    continue
                if text[i] == quote:
                    i += 1
                    break
                buf.append(text[i])
                i += 1
            else:
                raise ParseError(f'第 {text.count(chr(10), 0, start) + 1} 行引号没有闭合')
            yield ('word', start, ''.join(buf))
            continue
        start = i
        buf = []
        while i < n:
            c = text[i]
            if c in ' \t\r\n{};':
                break
            if c == '\\' and i + 1 < n:
                buf.append(unescape(text[i + 1], False))
                i += 2
                continue
            buf.append(c)
            i += 1
        yield ('word', start, ''.join(buf))


def parse(text):
    root = []
    stack = [(root, None)]
    current = []
    for kind, pos, value in tokenize(text):
        if kind == 'word':
            current.append((pos, value))
        elif kind == ';':
            if not current:
                raise ParseError(f'第 {text.count(chr(10), 0, pos) + 1} 行有孤立的 ;')
            stack[-1][0].append(
                Node(current[0][1], [v for _, v in current[1:]], current[0][0], pos)
            )
            current = []
        elif kind == '{':
            if not current:
                raise ParseError(f'第 {text.count(chr(10), 0, pos) + 1} 行有孤立的 {{')
            node = Node(current[0][1], [v for _, v in current[1:]], current[0][0])
            stack[-1][0].append(node)
            stack.append((node.children, node))
            current = []
        else:
            if current:
                raise ParseError(f'第 {text.count(chr(10), 0, pos) + 1} 行指令缺少分号')
            if len(stack) == 1:
                raise ParseError(f'第 {text.count(chr(10), 0, pos) + 1} 行多了一个 }}')
            _, node = stack.pop()
            node.close_pos = pos
    if current:
        raise ParseError('文件结尾有没写完的指令')
    if len(stack) != 1:
        raise ParseError('有 { 没有闭合')
    return root


def all_servers(nodes):
    found = []
    for node in nodes:
        if node.name == 'server' and node.close_pos is not None:
            found.append(node)
        elif node.name in ('http', 'stream'):
            found.extend(all_servers(node.children))
    return found


def direct(node, name):
    return [c for c in node.children if c.name == name]


def listen_ports(node):
    ports = []
    for arg in node.args:
        low = arg.lower()
        if low in LISTEN_FLAGS or low.startswith('so_keepalive='):
            continue
        if arg.startswith('unix:'):
            continue
        if arg.startswith('['):
            if ']:' in arg:
                ports.append(arg.rsplit(':', 1)[1])
            continue
        if ':' in arg:
            ports.append(arg.rsplit(':', 1)[1])
        elif arg.isdigit():
            ports.append(arg)
    return ports


def location_key(node):
    """按 nginx 的判定归一化 location：^~ 与无修饰符同属前缀，= 是精确，~ / ~* 各自独立。

    修饰符可以粘着写（`location =/x`）也可以分开写（`location = /x`），
    两种写法在 nginx 里等价，这里也必须等价，否则重复检测会漏。
    """
    if not node.args:
        return ('empty',)
    first = node.args[0]
    mod = None
    rest = first
    for candidate in ('=', '^~', '~*', '~', '@'):
        if first == candidate:
            mod = candidate
            rest = node.args[1] if len(node.args) > 1 else ''
            break
        if first.startswith(candidate) and len(first) > len(candidate):
            mod = candidate
            rest = first[len(candidate):]
            break
    if mod == '@':
        return ('named', rest)
    if mod == '=':
        return ('exact', rest)
    if mod in ('~', '~*'):
        return ('regex', mod, rest)
    if mod == '^~':
        return ('prefix', rest)
    return ('prefix', first)


def line_of(text, pos):
    return text.count('\n', 0, pos) + 1


def has_multiline_string(text):
    """片段里是否有跨行的引号字符串；有就不按行剥注释，原样插入。"""
    i, n = 0, len(text)
    while i < n:
        c = text[i]
        if c == '#':
            while i < n and text[i] != '\n':
                i += 1
            continue
        if c in '"\'':
            quote = c
            i += 1
            while i < n:
                if text[i] == '\\' and i + 1 < n:
                    i += 2
                    continue
                if text[i] == quote:
                    i += 1
                    break
                if text[i] == '\n':
                    return True
                i += 1
            continue
        i += 1
    return False


def strip_comment_lines(text):
    lines = [ln for ln in text.splitlines() if not ln.lstrip().startswith('#')]
    return '\n'.join(lines).strip('\n')


def describe(node, text):
    names = [a for sn in direct(node, 'server_name') for a in sn.args]
    ports = [p for ln in direct(node, 'listen') for p in listen_ports(ln)]
    return f'第 {line_of(text, node.start)} 行  listen={ports} server_name={names}'


def make_backup(path, raw):
    """独占创建备份，绝不覆盖已有文件；保留原权限。"""
    directory = os.path.dirname(path)
    base = os.path.basename(path)
    stamp = time.strftime('%Y%m%d-%H%M%S')
    mode = os.stat(path).st_mode & 0o7777
    for seq in range(1000):
        name = f'{base}.bak.{stamp}.{os.getpid()}.{seq}'
        candidate = os.path.join(directory, name)
        try:
            fd = os.open(candidate, os.O_WRONLY | os.O_CREAT | os.O_EXCL, mode)
        except FileExistsError:
            continue
        try:
            with os.fdopen(fd, 'wb') as fh:
                fh.write(raw)
                fh.flush()
                os.fsync(fh.fileno())
        except BaseException:
            os.unlink(candidate)
            raise
        return candidate
    raise SystemExit('备份文件名连续冲突，放弃写入')


def write_atomic(path, content, stat):
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(path), prefix='.nginx-', suffix='.tmp')
    try:
        with os.fdopen(fd, 'wb') as fh:
            fh.write(content)
            fh.flush()
            os.fsync(fh.fileno())
        os.chmod(tmp, stat.st_mode & 0o7777)
        if os.geteuid() == 0:
            os.chown(tmp, stat.st_uid, stat.st_gid)
        os.replace(tmp, path)
    except BaseException:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise
    dfd = os.open(os.path.dirname(path), os.O_RDONLY)
    try:
        os.fsync(dfd)
    finally:
        os.close(dfd)


def run(cmd, timeout):
    return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)


def fetch(url, host=None, port='443', timeout=10):
    """带 --resolve 打到 127.0.0.1：验的是本机这份配置，不依赖公网 DNS 和 CDN。

    返回 (状态码, 响应体)。curl 自身失败时状态码为空串。
    """
    cmd = ['curl', '-k', '-s', '--max-time', str(timeout), '-w', '\n%{http_code}']
    if host:
        cmd += ['--resolve', f'{host}:{port}:127.0.0.1']
    proc = subprocess.run(cmd + [url], capture_output=True, text=True, timeout=timeout + 5)
    if proc.returncode != 0:
        return '', ''
    body, _, code = proc.stdout.rpartition('\n')
    return code.strip(), body


def main():
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--config', required=True, help='站点配置文件')
    parser.add_argument('--server-name', required=True, help='要改写的 server_name')
    parser.add_argument('--snippet', default=os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                                          'nginx.conf'),
                        help='包含 location 块的文件，默认同目录 nginx.conf')
    parser.add_argument('--port', default='443', help='server 块监听的端口，默认 443')
    parser.add_argument('--probe-path', default='/rbac/', help='改完后探活的路径')
    parser.add_argument('--probe-expect', default=None,
                        help='首页里必须出现的字符串，默认 <probe-path>/assets/')
    parser.add_argument('--dry-run', action='store_true', help='只解析和打印，不写文件')
    parser.add_argument('--no-nginx', action='store_true',
                        help='跳过 nginx -t / reload / 探活，只改文件（不会有任何回滚保护）')
    args = parser.parse_args()

    path = os.path.realpath(args.config)
    try:
        with open(path, 'rb') as fh:
            raw = fh.read()
    except PermissionError:
        raise SystemExit(f'没有权限读 {path}，请用 sudo 运行')
    try:
        text = raw.decode('utf-8')
    except UnicodeDecodeError:
        raise SystemExit('配置文件不是 UTF-8，先别自动改，手工处理')

    with open(args.snippet, encoding='utf-8') as fh:
        raw_snippet = fh.read()
    if has_multiline_string(raw_snippet):
        raise SystemExit('片段里有跨行的引号字符串，按行剥注释会改坏内容，请手工合并')
    snippet = strip_comment_lines(raw_snippet)
    if not snippet:
        raise SystemExit('片段是空的（或只有注释），什么都没做')

    try:
        servers = all_servers(parse(text))
        snippet_nodes = parse(snippet)
    except ParseError as exc:
        raise SystemExit(f'配置解析失败（未做任何修改）：{exc}')

    snippet_locs = [n for n in snippet_nodes if n.name == 'location']
    if not snippet_locs:
        raise SystemExit('片段里没有 location 块，什么都没做')

    keys = [location_key(loc) for loc in snippet_locs]
    if len(set(keys)) != len(keys):
        dup = sorted({k for k in keys if keys.count(k) > 1})
        raise SystemExit(f'片段里自己就有重复的 location：{dup}')

    candidates = []
    for node in servers:
        names = [a.lower() for sn in direct(node, 'server_name') for a in sn.args]
        ports = [p for ln in direct(node, 'listen') for p in listen_ports(ln)]
        if args.port in ports and args.server_name.lower() in names:
            candidates.append(node)

    if not candidates:
        print(f'没有找到同时满足 listen {args.port} 和 server_name={args.server_name} 的 server 块：')
        for node in servers:
            print('  ' + describe(node, text))
        raise SystemExit(2)
    if len(candidates) > 1:
        print(f'找到 {len(candidates)} 个候选 server 块，不自动选择：')
        for node in candidates:
            print('  ' + describe(node, text))
        raise SystemExit(2)

    target = candidates[0]
    if direct(target, 'return'):
        raise SystemExit('选中的 server 块里有 server 级 return，插 location 不会生效，请手工确认')

    existing = {}
    for loc in direct(target, 'location'):
        existing.setdefault(location_key(loc), line_of(text, loc.start))
    for key in keys:
        if key in existing:
            raise SystemExit(f'第 {existing[key]} 行已经有同名 location（{key}），什么都没做')

    insert_at = target.close_pos
    if insert_at is None:
        raise SystemExit('选中的 server 块没有闭合位置，配置可能损坏')

    new_text = text[:insert_at] + '\n' + snippet + '\n' + text[insert_at:]
    print(f'目标：{path}')
    print(f'选中的 server 块：第 {line_of(text, target.start)} 行起，插到第 {line_of(text, insert_at)} 行前')

    if args.dry_run:
        print('--dry-run：没有写入。片段首行：' + snippet.splitlines()[0].strip())
        return 0

    if not args.no_nginx:
        missing = [b for b in ('nginx', 'curl') if shutil.which(b) is None]
        if missing:
            raise SystemExit(f'找不到 {"/".join(missing)}，没有改动任何文件；'
                             '先把它们放进 PATH，或加 --no-nginx 只改文件')

    stat = os.stat(path)
    if os.geteuid() != 0 and stat.st_uid != os.geteuid():
        raise SystemExit('配置文件不属于当前用户，写入会改变属主；请用 sudo')

    backup = make_backup(path, raw)
    print(f'备份：{backup}')

    def rollback(why):
        print(f'回滚：{why}')
        try:
            write_atomic(path, raw, stat)
        except BaseException as exc:
            print(f'!! 还原磁盘失败：{exc}')
            print(f'!! 手工恢复：sudo cp -p {backup} {path}')
            return 1
        if args.no_nginx:
            print('磁盘已还原（--no-nginx，nginx 未动）。')
            return 1
        try:
            check = run(['nginx', '-t'], 30)
            reloaded = run(['nginx', '-s', 'reload'], 30) if check.returncode == 0 else None
        except BaseException as exc:
            print(f'!! 磁盘已还原，但重新 reload 失败：{exc}')
            print('!! 线上可能仍是新配置，立刻手工执行：sudo nginx -t && sudo nginx -s reload')
            return 1
        if check.returncode != 0 or reloaded is None or reloaded.returncode != 0:
            print('!! 磁盘已还原，但 reload 没成功；线上可能仍在跑新配置。')
            print('!! 手工执行：sudo nginx -t && sudo nginx -s reload')
            return 1
        print('已还原到修改前的配置，并重新 reload，线上行为不变。')
        return 1

    write_atomic(path, new_text.encode('utf-8'), stat)
    print('已写入。')

    if args.no_nginx:
        print('--no-nginx：跳过 nginx -t / reload / 探活；这份配置还没有被 nginx 验证过。')
        return 0

    try:
        check = run(['nginx', '-t'], 30)
        if check.returncode != 0:
            print(check.stdout)
            print(check.stderr)
            return rollback('nginx -t 没通过')

        reloaded = run(['nginx', '-s', 'reload'], 30)
        if reloaded.returncode != 0:
            print(reloaded.stderr)
            return rollback('nginx reload 失败')

        scheme = 'http' if args.port == '80' else 'https'
        suffix = '' if args.port in ('80', '443') else f':{args.port}'
        base = f'{scheme}://{args.server_name}{suffix}'
        expect = args.probe_expect or args.probe_path.rstrip('/') + '/assets/'

        code = ''
        body = ''
        deadline = time.time() + 10
        while time.time() < deadline:
            code, body = fetch(f'{base}{args.probe_path}', args.server_name, args.port)
            if code == '200' and body:
                break
            time.sleep(0.5)
        print(f'本地探活 {base}{args.probe_path} -> {code or "无响应"}')

        if code != '200':
            return rollback(f'{args.probe_path} 返回 {code or "无响应"}')
        if expect not in body:
            return rollback(f'页面里没有 {expect}，可能被外层 location 截走了')

        match = re.search(re.escape(expect) + r'[^"\'<>\s]+', body)
        if match:
            asset_code, asset_body = fetch(f'{base}{match.group(0)}',
                                           args.server_name, args.port, 15)
            print(f'本地探活资源 {match.group(0)} -> {asset_code or "无响应"}')
            if asset_code != '200':
                return rollback(f'首页引用的资源返回 {asset_code or "无响应"}')
            if match.group(0).endswith('.js') and len(asset_body) < 1000:
                return rollback('首页引用的 JS 内容异常')
        else:
            print('提示：首页里没有找到带文件名的 assets 引用，跳过资源校验')
    except BaseException as exc:
        return rollback(f'{type(exc).__name__}: {exc}')

    print('完成。到公网再验一遍：')
    print(f'  curl -I {base}{args.probe_path}')
    print(f'  curl -fsS {base}{args.probe_path.rstrip("/")}/healthz')
    return 0


if __name__ == '__main__':
    sys.exit(main())
