#!/bin/bash

echo "🎯 最终测试: AI Word项目访问测试"
echo "========================================"

# 测试1: 本地Next.js服务器
echo "1. 测试本地Next.js服务器..."
local_status=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000)
echo "   本地服务器状态: $local_status"

# 测试2: HTTPS访问
echo "2. 测试HTTPS访问 (word.qiyuan.icu)..."
https_status=$(timeout 5 curl -s -o /dev/null -w "%{http_code}" https://word.qiyuan.icu 2>/dev/null || echo "超时")
echo "   HTTPS状态: $https_status"

# 测试3: 获取页面标题
echo "3. 获取页面内容..."
if [ "$https_status" = "200" ]; then
    title=$(timeout 5 curl -s https://word.qiyuan.icu | grep -o '<title>[^<]*</title>' | sed 's/<title>//' | sed 's/<\/title>//' 2>/dev/null || echo "无法获取")
    echo "   页面标题: $title"
else
    echo "   ⚠ 无法获取页面内容"
fi

# 测试4: 检查Nginx错误日志
echo "4. 检查Nginx错误..."
nginx_errors=$(tail -5 /var/log/nginx/error.log 2>/dev/null | grep -c "word.qiyuan.icu" || echo "0")
echo "   最近Nginx错误数: $nginx_errors"

echo ""
echo "========================================"
echo "📊 测试结果汇总:"

if [ "$local_status" = "200" ] && [ "$https_status" = "200" ]; then
    echo "✅ ✅ ✅ 双重验证通过！"
    echo ""
    echo "🎉 恭喜！你的AI Word项目已经完全恢复正常！"
    echo ""
    echo "🔗 访问地址: https://word.qiyuan.icu"
    echo "📱 项目名称: AI Word 排版美化助手"
    echo "⚡ 技术栈: Next.js 16.2.3 + React + TypeScript + Tailwind CSS"
    echo ""
    echo "💡 如果还有问题，请尝试:"
    echo "   1. 清除浏览器缓存 (Ctrl+Shift+Delete)"
    echo "   2. 使用无痕模式访问"
    echo "   3. 访问: https://word.qiyuan.icu/?v=1"
else
    echo "⚠ 还有问题需要解决:"
    if [ "$local_status" != "200" ]; then
        echo "   ❌ Next.js本地服务器未响应"
    fi
    if [ "$https_status" != "200" ]; then
        echo "   ❌ HTTPS访问失败"
    fi
fi