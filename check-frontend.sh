#!/bin/bash

echo "🔍 检查前端CSS和JS问题..."
echo "========================================"

# 检查服务器是否运行
echo "1. 检查服务器状态..."
if curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 | grep -q "200"; then
    echo "   ✅ 服务器运行正常 (HTTP 200)"
else
    echo "   ❌ 服务器未运行或返回错误"
    exit 1
fi

# 获取页面HTML
echo "2. 获取页面HTML..."
curl -s http://localhost:3000 > page.html
if [ -s page.html ]; then
    echo "   ✅ 成功获取页面HTML"
else
    echo "   ❌ 无法获取页面HTML"
    exit 1
fi

# 检查CSS链接
echo "3. 检查CSS链接..."
css_count=$(grep -c 'rel="stylesheet"' page.html)
if [ $css_count -gt 0 ]; then
    echo "   ✅ 找到 $css_count 个CSS链接"
    grep 'rel="stylesheet"' page.html | head -5
else
    echo "   ❌ 未找到CSS链接"
fi

# 检查JS脚本
echo "4. 检查JS脚本..."
js_count=$(grep -c '<script' page.html)
if [ $js_count -gt 0 ]; then
    echo "   ✅ 找到 $js_count 个JS脚本"
    grep '<script' page.html | head -5
else
    echo "   ❌ 未找到JS脚本"
fi

# 检查Tailwind类
echo "5. 检查Tailwind CSS类..."
if grep -q 'class=".*bg-.*"' page.html; then
    echo "   ✅ 页面包含Tailwind CSS类"
else
    echo "   ⚠ 未找到明显的Tailwind类"
fi

# 检查错误信息
echo "6. 检查页面错误信息..."
if grep -qi "error\|failed\|not found\|无法加载" page.html; then
    echo "   ⚠ 页面可能包含错误信息"
    grep -i "error\|failed\|not found\|无法加载" page.html | head -3
else
    echo "   ✅ 未发现明显的错误信息"
fi

# 检查资源文件
echo "7. 检查静态资源..."
echo "   - 检查public目录..."
if [ -d "public" ]; then
    echo "     ✅ public目录存在"
    ls -la public/ | head -5
else
    echo "     ❌ public目录不存在"
fi

echo "8. 检查构建输出..."
if [ -d ".next" ]; then
    echo "   ✅ .next目录存在"
    echo "   - 检查静态文件..."
    find .next/static -name "*.css" -o -name "*.js" | head -5
else
    echo "   ❌ .next目录不存在，需要构建"
fi

echo ""
echo "========================================"
echo "📋 建议操作："
echo "1. 如果CSS/JS未加载，尝试清理缓存: rm -rf .next && npm run build"
echo "2. 检查浏览器控制台错误 (F12)"
echo "3. 确保所有依赖已安装: npm install"
echo "4. 检查网络连接和代理设置"

# 清理
rm -f page.html