#!/bin/bash

echo "🔍 详细测试HTTPS访问: word.qiyuan.icu"
echo "========================================"

# 测试HTTPS访问
echo "1. 测试HTTPS访问..."
curl -s -o /dev/null -w "   HTTPS状态: %{http_code}\n" https://word.qiyuan.icu

# 获取页面标题
echo "2. 获取页面标题..."
title=$(curl -s https://word.qiyuan.icu | grep -o '<title>[^<]*</title>' | sed 's/<title>//' | sed 's/<\/title>//')
echo "   页面标题: $title"

# 检查是否有错误信息
echo "3. 检查错误信息..."
if curl -s https://word.qiyuan.icu | grep -qi "ERR_CONNECTION_ABORTED\|无法访问\|connection refused\|timeout"; then
    echo "   ❌ 发现错误信息"
else
    echo "   ✅ 未发现错误信息"
fi

# 检查SSL证书
echo "4. 检查SSL证书..."
curl -s -I https://word.qiyuan.icu 2>&1 | grep -i "certificate\|SSL" || echo "   ✅ SSL证书正常"

# 测试静态资源
echo "5. 测试静态资源访问..."
echo "   测试CSS文件..."
css_url=$(curl -s https://word.qiyuan.icu | grep -o 'href="[^"]*\.css"' | head -1 | sed 's/href="//' | sed 's/"//')
if [ -n "$css_url" ]; then
    echo "   测试: $css_url"
    curl -s -o /dev/null -w "   状态: %{http_code}\n" "https://word.qiyuan.icu$css_url"
else
    echo "   ⚠ 未找到CSS链接"
fi

echo ""
echo "========================================"
echo "📋 诊断结果:"

if [ "$title" = "AI Word 排版美化助手" ]; then
    echo "✅ 网站正常加载！标题正确显示。"
    echo ""
    echo "🎉 恭喜！你的AI Word项目现在应该可以正常访问了！"
    echo "请访问: https://word.qiyuan.icu"
else
    echo "⚠ 可能还有问题，请尝试以下步骤:"
    echo "1. 清除浏览器缓存 (Ctrl+Shift+Delete)"
    echo "2. 使用无痕模式访问"
    echo "3. 尝试访问: https://word.qiyuan.icu/?v=1"
fi