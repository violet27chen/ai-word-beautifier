#!/usr/bin/env python3
"""
检查网站资源引用情况
"""

import requests
from bs4 import BeautifulSoup
import sys

def check_resources(url):
    print(f"检查网站资源: {url}")
    print("=" * 60)
    
    try:
        # 获取页面内容
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # 检查CSS引用
        print("\n📁 CSS文件引用:")
        css_links = soup.find_all('link', rel='stylesheet')
        if css_links:
            for link in css_links:
                href = link.get('href', '')
                print(f"  ✅ {href}")
        else:
            print("  ❌ 未找到CSS引用")
        
        # 检查JS引用
        print("\n📁 JavaScript文件引用:")
        js_scripts = soup.find_all('script', src=True)
        if js_scripts:
            for script in js_scripts[:10]:  # 只显示前10个
                src = script.get('src', '')
                print(f"  ✅ {src}")
        else:
            print("  ❌ 未找到JS引用")
        
        # 检查图片引用
        print("\n📁 图片引用:")
        images = soup.find_all('img', src=True)
        if images:
            for img in images[:5]:  # 只显示前5个
                src = img.get('src', '')
                print(f"  ✅ {src}")
        else:
            print("  ❌ 未找到图片引用")
        
        # 检查外部资源
        print("\n🌐 外部资源引用:")
        external_resources = []
        for tag in soup.find_all(['link', 'script', 'img']):
            src = tag.get('src') or tag.get('href') or ''
            if src and (src.startswith('http://') or src.startswith('https://')):
                external_resources.append(src)
        
        if external_resources:
            for resource in external_resources[:5]:  # 只显示前5个
                print(f"  🌍 {resource}")
        else:
            print("  ✅ 未发现外部资源引用")
        
        # 检查页面标题
        title = soup.find('title')
        if title:
            print(f"\n📄 页面标题: {title.text}")
        
        # 检查meta标签
        print("\n🔍 Meta标签:")
        metas = soup.find_all('meta')
        important_metas = ['viewport', 'description', 'keywords', 'author']
        for meta in metas:
            name = meta.get('name') or meta.get('property') or ''
            content = meta.get('content', '')
            if name in important_metas or 'og:' in name or 'twitter:' in name:
                print(f"  📌 {name}: {content[:50]}...")
        
        print("\n" + "=" * 60)
        print("✅ 资源检查完成")
        
    except Exception as e:
        print(f"❌ 检查失败: {e}")
        return False
    
    return True

if __name__ == "__main__":
    url = "http://localhost:3000"
    if len(sys.argv) > 1:
        url = sys.argv[1]
    
    check_resources(url)