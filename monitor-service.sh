#!/bin/bash

echo "🔧 AI Word项目服务监控"
echo "========================================"

# 检查PM2状态
echo "1. 检查PM2状态..."
pm2 status ai-word 2>/dev/null | grep -A2 "ai-word"

# 检查本地访问
echo "2. 检查本地Next.js服务器..."
local_status=$(timeout 5 curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 2>/dev/null || echo "超时")
echo "   本地状态: $local_status"

# 检查HTTPS访问
echo "3. 检查HTTPS访问..."
https_status=$(timeout 10 curl -s -o /dev/null -w "%{http_code}" https://word.qiyuan.icu 2>/dev/null || echo "超时")
echo "   HTTPS状态: $https_status"

# 检查Nginx
echo "4. 检查Nginx..."
nginx_status=$(systemctl is-active nginx 2>/dev/null || echo "未知")
echo "   Nginx状态: $nginx_status"

# 检查端口
echo "5. 检查端口..."
echo "   3000端口: $(netstat -tln | grep :3000 | wc -l) 个监听"
echo "   443端口: $(netstat -tln | grep :443 | wc -l) 个监听"

echo ""
echo "========================================"
echo "📊 服务状态汇总:"

if [ "$local_status" = "200" ] && [ "$https_status" = "200" ]; then
    echo "✅ 所有服务正常运行！"
    echo ""
    echo "🎉 你的AI Word项目正在稳定运行中！"
    echo "🔗 访问地址: https://word.qiyuan.icu"
else
    echo "⚠ 服务有问题，正在尝试修复..."
    
    # 尝试重启服务
    if [ "$local_status" != "200" ]; then
        echo "   重启Next.js服务器..."
        pm2 restart ai-word 2>/dev/null
        sleep 3
    fi
    
    if [ "$nginx_status" != "active" ]; then
        echo "   重启Nginx..."
        systemctl restart nginx 2>/dev/null
        sleep 2
    fi
    
    echo "   修复完成，请重新访问网站。"
fi

echo ""
echo "💡 维护命令:"
echo "   查看日志: pm2 logs ai-word"
echo "   重启服务: pm2 restart ai-word"
echo "   停止服务: pm2 stop ai-word"
echo "   启动服务: pm2 start ai-word"