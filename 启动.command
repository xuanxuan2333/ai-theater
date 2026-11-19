#!/bin/zsh
# 双击我：起一个本地服务并打开网站
cd "$(dirname "$0")" || exit 1

PORT=8080
while lsof -i :$PORT >/dev/null 2>&1; do PORT=$((PORT+1)); done

PY=$(command -v python3)
if [ -z "$PY" ]; then
  echo "没找到 python3，请先安装 Xcode Command Line Tools 或 Python。"
  echo "按回车键退出…"; read; exit 1
fi

echo "正在启动：http://127.0.0.1:$PORT"
"$PY" -m http.server $PORT >/dev/null 2>&1 &
PID=$!
sleep 1

if ! kill -0 $PID 2>/dev/null; then
  echo "启动失败，端口可能被占用。"
  echo "按回车键退出…"; read; exit 1
fi

open "http://127.0.0.1:$PORT"
echo ""
echo "已启动。关掉这个窗口即停止服务。"
wait $PID
