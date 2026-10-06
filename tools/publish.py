"""GitHub Pages へ公開する（いまのファイルを1つのコミットとして origin/main に追加して push）

GitHub 側には、手元の Git 履歴（公開しないファイルを含んでいた頃の履歴）を送らず、
現在のファイル構成のスナップショットだけを積み重ねる。
  使い方:  python tools/publish.py "更新内容のメモ"
"""
import subprocess
import sys


def git(*args):
    return subprocess.run(['git', *args], check=True, capture_output=True, text=True).stdout.strip()


msg = sys.argv[1] if len(sys.argv) > 1 else 'Update'
if git('status', '--porcelain'):
    sys.exit('未コミットの変更があります。先に git commit してください。')
tree = git('rev-parse', 'HEAD^{tree}')
# 公開しないファイルが混ざっていないか確認
names = git('ls-tree', '-r', '--name-only', tree).splitlines()
bad = [n for n in names if n.startswith(('assets/recipes/', 'assets/sources/')) or n in ('js/added-recipes.js', 'js/added-recipes-2.js')]
if bad:
    sys.exit('公開しないファイルが含まれています: ' + ', '.join(bad[:5]))
try:
    git('fetch', 'origin', 'main')
    parent = ['-p', git('rev-parse', 'origin/main')]
except subprocess.CalledProcessError:
    parent = []  # 初回
commit = git('commit-tree', tree, *parent, '-m', msg)
git('push', 'origin', f'{commit}:refs/heads/main')
print('公開しました:', commit[:8])
