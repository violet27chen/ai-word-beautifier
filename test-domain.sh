#!/bin/bash

echo "🔍 测试域名访问: word.qiyuan.icu"
echo "========================================"

# 测试HTTPS访问
echo "1. 测试HTTPS访问..."
curl -s -o /dev/null -w "HTTPS状态: %{http_code}\n" https://word.qiyuan.icu

# 获取页面内容
echo "2. 获取页面内容..."
curl -s https://word.qiyuan.icu > domain-page.html

# 检查CSS
echo "3. 检查CSS资源..."
css_count=$(grep -c 'rel="stylesheet"' domain-page.html)
echo "   找到 $css_count 个CSS链接:"
grep 'href="[^"]*\.css"' domain-page.html | head -3

# 检查JS
echo "4. 检查JS资源..."
js_count=$(grep -c '<script' domain-page.html)
echo "   找到 $js_count 个JS脚本"

# 检查静态资源路径
echo "5. 检查资源路径..."
echo "   - Next.js静态资源:"
grep -o '/_next/static/[^"]*' domain-page.html | head -3

# 检查Tailwind类
echo "6. 检查Tailwind CSS..."
if grep -q 'class=".*bg-.*"' domain-page.html; then
    echo "   ✅ 页面包含Tailwind CSS类"
else
    echo "   ❌ 未找到Tailwind类"
fi

# 检查错误
echo "7. 检查页面错误..."
if grep -qi "error\|failed\|无法加载\|404" domain-page.html; then
    echo "   ⚠ 页面可能包含错误:"
    grep -i "error\|failed\|无法加载\|404" domain-page.html | head -2
else
    echo "   ✅ 未发现明显错误"
fi

# 测试静态资源访问
echo "8. 测试静态资源访问..."
css_url=$(grep -o 'href="[^"]*\.css"' domain-page.html | head -1 | sed 's/href="//' | sed 's/"//')
if [ -n "$css_url" ]; then
    echo "   测试CSS文件: $css_url"
    curl -s -o /dev/null -w "   状态: %{http_code}\n" "https://word.qiyuan.icu$css_url"
fi

echo ""
echo "========================================"
echo "📋 诊断结果:"

# 判断问题
if [ $css_count -eq 0 ]; then
    echo "❌ 问题: CSS未加载"
    echo "   可能原因: Nginx静态资源配置错误"
elif [ $js_count -eq 0 ]; then
    echo "❌ 问题: JS未加载"
    echo "   可能原因: Nginx代理配置错误"
elif grep -q "localhost:3000" domain-page.html; then
    echo "⚠ 警告: 页面包含localhost引用"
    echo "   可能原因: Next.js配置需要调整"
else
    echo "✅ 页面资源看起来正常"
fi

# 清理
rm -f domain-page.html