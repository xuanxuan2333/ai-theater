#!/bin/zsh
# 双击我：把最新代码推到 GitHub（第一次会引导你建仓库）
cd "$(dirname "$0")" || exit 1

REPO="ai-theater"
USER="xuanxuan2333"
REMOTE="git@github.com:$USER/$REPO.git"
PAGES="https://github.com/$USER/$REPO/settings/pages"

if ! git ls-remote "$REMOTE" >/dev/null 2>&1; then
  echo "还没有这个远程仓库：$USER/$REPO"
  echo ""
  echo "第 1 步：即将打开的页面里，仓库名填 $REPO，选 Public，"
  echo "         下面的 README / .gitignore / license 一个都不要勾，点 Create repository。"
  echo "第 2 步：回来再双击我一次。"
  echo ""
  open "https://github.com/new?name=$REPO&visibility=public"
  echo "按回车键退出…"
  read
  exit 0
fi

git branch -M main 2>/dev/null
git remote get-url origin >/dev/null 2>&1 || git remote add origin "$REMOTE"
git add -A
git commit -m "update: $(date '+%Y-%m-%d %H:%M')" --allow-empty >/dev/null
git push -u origin main || { echo "推送失败，检查网络或 SSH key"; read; exit 1; }

echo ""
echo "✅ 已推送。"
echo "如果这是第一次，还需要开一次 Pages："
echo "  Settings → Pages → Source 选 Deploy from a branch → main / (root) → Save"
echo "地址：https://$USER.github.io/$REPO/"
open "$PAGES"
echo ""
echo "按回车键退出…"
read
