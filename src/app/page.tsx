'use client';

import { useState, useRef, useEffect } from 'react';
import { Download, Loader2, FileText, Settings, Wand2, AlertCircle, Upload, ImagePlus, X, ChevronDown, ChevronUp, Maximize2, Minimize2, SlidersHorizontal, Copy, Check, Gift, RefreshCw } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import Markdown from 'markdown-to-jsx';
import WelfareVideoPlayer from './welfare-video-player';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type ModelOption = {
  value: string;
  label: string;
  supportsImage: boolean;
};

type NavView = 'beautify' | 'welfare';

const MODELS: ModelOption[] = [
  { value: 'deepseek-v4-flash', label: 'DeepSeek-V4-Flash (默认)', supportsImage: false },
  { value: 'deepseek-v4-pro', label: 'DeepSeek-V4-Pro', supportsImage: false },
  { value: 'kimi-k2.6', label: 'Kimi-K2.6 (多模态)', supportsImage: true },
  { value: 'kimi-k2.5', label: 'Kimi-K2.5 (多模态)', supportsImage: true },
  { value: 'moonshot-v1-8k', label: 'Moonshot-v1-8k', supportsImage: false },
  { value: 'moonshot-v1-32k', label: 'Moonshot-v1-32k', supportsImage: false },
  { value: 'moonshot-v1-128k', label: 'Moonshot-v1-128k', supportsImage: false },
  { value: 'moonshot-v1-8k-vision-preview', label: 'Moonshot-v1-8k-vision-preview (视觉)', supportsImage: true },
  { value: 'moonshot-v1-32k-vision-preview', label: 'Moonshot-v1-32k-vision-preview (视觉)', supportsImage: true },
  { value: 'moonshot-v1-128k-vision-preview', label: 'Moonshot-v1-128k-vision-preview (视觉)', supportsImage: true },
  { value: 'kimi-k2-0905-preview', label: 'Kimi-K2-0905-Preview (将于 2026-05-25 下线)', supportsImage: false },
  { value: 'kimi-k2-0711-preview', label: 'Kimi-K2-0711-Preview (将于 2026-05-25 下线)', supportsImage: false },
  { value: 'kimi-k2-turbo-preview', label: 'Kimi-K2-Turbo-Preview (将于 2026-05-25 下线)', supportsImage: false },
  { value: 'kimi-k2-thinking', label: 'Kimi-K2-Thinking (将于 2026-05-25 下线)', supportsImage: false },
  { value: 'kimi-k2-thinking-turbo', label: 'Kimi-K2-Thinking-Turbo (将于 2026-05-25 下线)', supportsImage: false },
  { value: 'glm-4.7', label: 'GLM-4.7 高智能模型', supportsImage: false },
  { value: 'glm-5.1', label: 'GLM-5.1 最新旗舰', supportsImage: false },
  { value: 'glm-5v-turbo', label: 'GLM-5V-Turbo (多模态)', supportsImage: true },
  { value: 'qwen3.5-flash', label: 'Qwen3.5-Flash (阿里云百炼)', supportsImage: false },
  { value: 'doubao-seed-1-6-flash-250828', label: 'Doubao-Seed-1.6-Flash (豆包多模态)', supportsImage: true },
];

const WRITING_STYLES = [
  { value: '', label: '默认风格' },
  { value: '正式专业', label: '正式专业' },
  { value: '学术严谨', label: '学术严谨' },
  { value: '轻松通俗', label: '轻松通俗' },
  { value: '文艺抒情', label: '文艺抒情' },
  { value: '幽默风趣', label: '幽默风趣' },
  { value: '平实自然', label: '平实自然' },
];

const EDU_LEVELS = [
  { value: '', label: '不限水平' },
  { value: '研究生', label: '研究生' },
  { value: '大学生', label: '大学生' },
  { value: '高中生', label: '高中生' },
  { value: '初中生', label: '初中生' },
  { value: '小学生', label: '小学生' },
];

const PERF_LEVELS = [
  { value: '优秀', label: '优秀' },
  { value: '中等', label: '中等' },
  { value: '差劲', label: '差劲' },
];

const DIAGRAM_MODES = [
  { value: 'none', label: '不生成图示' },
  { value: 'mindmap', label: '自动思维导图' },
  { value: 'flowchart', label: '自动流程图' },
];

const DAILY_WELFARE_VIDEO_URL = process.env.NEXT_PUBLIC_DAILY_WELFARE_VIDEO_URL?.trim() || '/welfare/today.mp4';
const DAILY_WELFARE_SUBTITLE_URL = process.env.NEXT_PUBLIC_DAILY_WELFARE_SUBTITLE_URL?.trim() || '/welfare/today.zh.vtt';

/* const USDT_DONATION_NETWORK = process.env.NEXT_PUBLIC_USDT_DONATION_NETWORK?.trim() || '';
const USDT_DONATION_ADDRESS = process.env.NEXT_PUBLIC_USDT_DONATION_ADDRESS?.trim() || ''; */

let mammothPromise: Promise<typeof import('mammoth/mammoth.browser')> | null = null;
const CHUNK_RELOAD_GUARD_KEY = '__chunk_reload_once__';

type MermaidRenderer = {
  initialize: (config: Record<string, unknown>) => void;
  render: (id: string, text: string) => Promise<{ svg: string }>;
};

let mermaidLoaderPromise: Promise<MermaidRenderer> | null = null;

function loadMermaid(): Promise<MermaidRenderer> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Mermaid 仅可在浏览器中使用'));
  }
  if (mermaidLoaderPromise) {
    return mermaidLoaderPromise;
  }
  mermaidLoaderPromise = import('mermaid')
    .then((module) => {
      const mermaid = (module.default || module) as unknown as MermaidRenderer;
      if (!mermaid?.initialize || !mermaid?.render) {
        throw new Error('Mermaid 模块不可用');
      }
      return mermaid;
    });
  return mermaidLoaderPromise;
}

function MermaidDiagram({ code }: { code: string }) {
  const [svg, setSvg] = useState('');
  const [renderError, setRenderError] = useState('');
  const chartCode = code.trim();

  useEffect(() => {
    if (!chartCode) return;
    let active = true;
    const renderMermaid = async () => {
      try {
        const mermaid = await loadMermaid();
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'loose',
          flowchart: {
            htmlLabels: false,
            useMaxWidth: false,
          },
        });
        const { svg: renderedSvg } = await mermaid.render(`mermaid-${crypto.randomUUID()}`, chartCode);
        if (!active) return;
        setSvg(renderedSvg);
        setRenderError('');
      } catch {
        if (!active) return;
        setSvg('');
        setRenderError('图示渲染失败，请检查 Mermaid 语法后重试。');
      }
    };
    renderMermaid();
    return () => {
      active = false;
    };
  }, [chartCode]);

  if (!chartCode) {
    return null;
  }

  if (renderError) {
    return <div className="my-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{renderError}</div>;
  }
  if (!svg) {
    return <div className="my-3 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-500">图示渲染中...</div>;
  }
  return <div className="mermaid-diagram my-3 overflow-x-auto rounded-md border border-gray-200 bg-white p-2" dangerouslySetInnerHTML={{ __html: svg }} />;
}

function getMammoth() {
  if (!mammothPromise) {
    mammothPromise = import('mammoth/mammoth.browser');
  }
  return mammothPromise;
}

export default function Home() {
  const [activeNav, setActiveNav] = useState<NavView>('beautify');
  const [prompt, setPrompt] = useState('');
  const [content, setContent] = useState('');
  const [model, setModel] = useState(() => {
    const preferred = 'deepseek-v4-flash';
    return MODELS.some((item) => item.value === preferred) ? preferred : MODELS[0].value;
  });
  const [isFetching, setIsFetching] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const isTypingRef = useRef(false);
  const fullTextRef = useRef('');
  const [statusMsg, setStatusMsg] = useState('');
  
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [displayedMarkdown, setDisplayedMarkdown] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPrivacyModalOpen, setIsPrivacyModalOpen] = useState(false);
  const [isAgreementModalOpen, setIsAgreementModalOpen] = useState(false);
  // const [isDonateModalOpen, setIsDonateModalOpen] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  // const [isUsdtCopied, setIsUsdtCopied] = useState(false);
  // const hasUsdtDonationInfo = Boolean(USDT_DONATION_NETWORK && USDT_DONATION_ADDRESS);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(copyFriendlyMarkdown);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text:', err);
    }
  };

  /* const handleCopyUsdtAddress = async () => {
    if (!USDT_DONATION_ADDRESS) return;
    try {
      await navigator.clipboard.writeText(USDT_DONATION_ADDRESS);
      setIsUsdtCopied(true);
      setTimeout(() => setIsUsdtCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy USDT address:', err);
    }
  }; */
  const resultRef = useRef<HTMLDivElement>(null);
  const modalResultRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [isContentOpen, setIsContentOpen] = useState(false);
  const [wordCount, setWordCount] = useState('');
  const [writingStyle, setWritingStyle] = useState('');
  const [eduLevel, setEduLevel] = useState('');
  const [perfLevel, setPerfLevel] = useState('优秀');
  const [addTypos, setAddTypos] = useState(false);
  const [humanTrace, setHumanTrace] = useState(false);
  const [enableEvidenceSupport, setEnableEvidenceSupport] = useState(false);
  const [enableSignatureDate, setEnableSignatureDate] = useState(true);
  const [authorName, setAuthorName] = useState('');
  const [documentDate, setDocumentDate] = useState('');
  const [refinePrompt, setRefinePrompt] = useState('');
  const [diagramMode, setDiagramMode] = useState('none');
  const [welfareRefreshKey, setWelfareRefreshKey] = useState(() => Date.now());
  const [videoLoadError, setVideoLoadError] = useState('');

  const welfareVideoSrc = `${DAILY_WELFARE_VIDEO_URL}${DAILY_WELFARE_VIDEO_URL.includes('?') ? '&' : '?'}t=${welfareRefreshKey}`;
  const welfareSubtitleSrc = `${DAILY_WELFARE_SUBTITLE_URL}${DAILY_WELFARE_SUBTITLE_URL.includes('?') ? '&' : '?'}t=${welfareRefreshKey}`;

  const cleanMarkdown = displayedMarkdown
    .replace(/^```(markdown|html)?\n?/i, '')
    .replace(/\n?```$/i, '')
    .replace(/^html\s*\n/i, '');

  const copyFriendlyMarkdown = cleanMarkdown
    .replace(/<div\s+align=["']center["']>\s*<h1[^>]*>([\s\S]*?)<\/h1>\s*<\/div>/gi, (_, title: string) => `# ${title.replace(/<[^>]+>/g, '').trim()}`)
    .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, (_, title: string) => `# ${title.replace(/<[^>]+>/g, '').trim()}`);

  useEffect(() => {
    const didReload = sessionStorage.getItem(CHUNK_RELOAD_GUARD_KEY) === '1';
    if (didReload) {
      sessionStorage.removeItem(CHUNK_RELOAD_GUARD_KEY);
    }
    const maybeRecoverChunkError = (raw: unknown) => {
      if (didReload) return;
      const message = typeof raw === 'string' ? raw : raw instanceof Error ? raw.message : '';
      const isChunkError = message.includes('ChunkLoadError') || message.includes('Failed to load chunk') || message.includes('/_next/static/chunks/');
      if (!isChunkError) return;
      sessionStorage.setItem(CHUNK_RELOAD_GUARD_KEY, '1');
      const url = new URL(window.location.href);
      url.searchParams.set('_r', Date.now().toString());
      window.location.replace(url.toString());
    };
    const onError = (event: ErrorEvent) => maybeRecoverChunkError(event.message || event.error);
    const onUnhandledRejection = (event: PromiseRejectionEvent) => maybeRecoverChunkError(event.reason);
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onUnhandledRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
    };
  }, []);

  useEffect(() => {
    fetch('/api/admin/visit', {
      method: 'POST',
      keepalive: true,
    }).catch(() => {});
  }, []);

  const extractTitleFromMarkdown = (markdown: string) => {
    const lines = (markdown || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    for (const line of lines) {
      const htmlH1Match = line.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
      if (htmlH1Match) {
        const title = htmlH1Match[1]
          .replace(/<[^>]+>/g, '')
          .replace(/\s+/g, ' ')
          .trim();
        if (title) return title;
      }
      const mdH1Match = line.match(/^#\s+(.+)$/);
      if (mdH1Match) {
        const title = mdH1Match[1].replace(/\s+/g, ' ').trim();
        if (title) return title;
      }
    }
    return 'AI排版美化文档';
  };

  const sanitizeFileName = (name: string) => {
    const sanitized = (name || 'AI排版美化文档')
      .replace(/[\\/:*?"<>|\u0000-\u001F]/g, '')
      .replace(/\.+$/g, '')
      .trim();
    return (sanitized || 'AI排版美化文档').slice(0, 80);
  };

  const getFileNameFromDisposition = (contentDisposition: string | null) => {
    if (!contentDisposition) return null;
    const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
    if (utf8Match?.[1]) {
      try {
        return decodeURIComponent(utf8Match[1]);
      } catch {
        return utf8Match[1];
      }
    }
    const quotedMatch = contentDisposition.match(/filename="([^"]+)"/i);
    if (quotedMatch?.[1]) return quotedMatch[1];
    const plainMatch = contentDisposition.match(/filename=([^;]+)/i);
    if (plainMatch?.[1]) return plainMatch[1].trim();
    return null;
  };

  // Auto scroll to bottom of result when generating or typing
  useEffect(() => {
    if ((isFetching || isTyping) && autoScroll) {
      // Scroll the small preview box
      if (resultRef.current) {
        resultRef.current.scrollTop = resultRef.current.scrollHeight;
      }
      // Scroll the modal preview box
      if (modalResultRef.current) {
        modalResultRef.current.scrollTop = modalResultRef.current.scrollHeight;
      }
      // If modal is open and uses window scroll instead, we need to scroll window
      // But modalResultRef is set on the scrollable container inside the modal.
    }
  }, [displayedMarkdown, isFetching, isTyping, autoScroll]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement;
    // Check if user scrolled up
    // Allow a 50px threshold for bottom detection
    const isAtBottom = target.scrollHeight - target.scrollTop - target.clientHeight < 50;
    setAutoScroll(isAtBottom);
  };
  
  // Typewriter effect interval
  useEffect(() => {
    const intervalId = setInterval(() => {
      setDisplayedMarkdown(prev => {
        const full = fullTextRef.current;
        if (prev.length < full.length) {
          if (!isTypingRef.current) {
            isTypingRef.current = true;
            setIsTyping(true);
          }
          const diff = full.length - prev.length;
          const step = Math.max(1, Math.floor(diff / 10)); // smooth catch up
          return full.slice(0, prev.length + step);
        } else {
          if (isTypingRef.current) {
            isTypingRef.current = false;
            setIsTyping(false);
          }
          return prev;
        }
      });
    }, 30);
    return () => clearInterval(intervalId);
  }, []);
  
  const [uploadedImages, setUploadedImages] = useState<{id: string, base64: string, file: File}[]>([]);
  const hasImages = uploadedImages.length > 0;
  const selectedModelOption = MODELS.find(m => m.value === model);
  const visibleModels = hasImages ? MODELS.filter(m => m.supportsImage) : MODELS;

  useEffect(() => {
    if (!hasImages) return;
    if (selectedModelOption?.supportsImage) return;
    const firstImageModel = MODELS.find(m => m.supportsImage);
    if (firstImageModel) {
      Promise.resolve().then(() => setModel(firstImageModel.value));
    }
  }, [hasImages, selectedModelOption]);

  const readFileAsDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => resolve((event.target?.result as string) || '');
      reader.onerror = () => reject(new Error('图片读取失败'));
      reader.readAsDataURL(file);
    });

  const convertGifToPngDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          URL.revokeObjectURL(objectUrl);
          reject(new Error('图片处理失败'));
          return;
        }
        ctx.drawImage(img, 0, 0);
        const pngDataUrl = canvas.toDataURL('image/png');
        URL.revokeObjectURL(objectUrl);
        resolve(pngDataUrl);
      };
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('GIF 解析失败'));
      };
      img.src = objectUrl;
    });

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    setError(null);

    for (const file of files) {
      try {
        const base64 = file.type === 'image/gif'
          ? await convertGifToPngDataUrl(file)
          : await readFileAsDataUrl(file);
        setUploadedImages(prev => [
          ...prev, 
          { id: `img_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`, base64, file }
        ]);
      } catch {
        setError(`图片处理失败：${file.name}`);
      }
    }

    if (imageInputRef.current) {
      imageInputRef.current.value = '';
    }
  };

  const removeImage = (idToRemove: string) => {
    setUploadedImages(prev => prev.filter(img => img.id !== idToRemove));
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (!file.name.endsWith('.docx')) {
      setError('仅支持 .docx 格式的 Word 文档');
      return;
    }

    setIsUploading(true);
    setError(null);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const mammoth = await getMammoth();
      const result = await mammoth.extractRawText({ arrayBuffer });
      setContent(result.value);
      if (result.messages.length > 0) {
        console.warn('Mammoth messages:', result.messages);
      }
    } catch (err) {
      const e = err as Error;
      setError('读取文档失败：' + e.message);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const executeGenerate = async (payload: Record<string, unknown>, initialMsg: string, typingMsg: string) => {
    setIsFetching(true);
    setError(null);
    setSuccess(false);
    setAutoScroll(true);
    fullTextRef.current = '';
    setDisplayedMarkdown('');
    setStatusMsg(initialMsg);

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || '生成失败，请检查网络或重试');
      }

      if (!response.body) throw new Error('ReadableStream not supported');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let firstTokenReceived = false;
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        if (!firstTokenReceived) {
          firstTokenReceived = true;
          setStatusMsg(typingMsg);
        }
        
        const chunk = decoder.decode(value, { stream: true });
        fullTextRef.current += chunk;
      }

    } catch (err) {
      console.error('Generation Error:', err);
      const e = err as Error;
      
      // Friendly error messages mapping
      let errorMsg = e.message || '发生未知错误';
      if (errorMsg.includes('Failed to fetch') || errorMsg.includes('NetworkError')) {
        errorMsg = '网络连接异常，请检查您的网络设置（若使用移动网络，请尝试切换至 WiFi 或关闭代理）。';
      } else if (errorMsg.includes('timeout') || errorMsg.includes('Timeout')) {
        errorMsg = 'AI 思考时间过长，响应超时，请尝试精简要求或稍后再试。';
      } else if (errorMsg.includes('ReadableStream not supported')) {
        errorMsg = '您的浏览器版本过低，不支持流式生成，请升级浏览器。';
      } else if (errorMsg.includes('balance') || errorMsg.includes('insufficient_quota') || errorMsg.includes('arrears') || errorMsg.includes('1004')) {
        errorMsg = '个人运营者的上游模型余额不足，请稍后再试或联系运营者。';
      } else if (errorMsg.includes('rate_limit') || errorMsg.includes('429') || errorMsg.includes('Too Many Requests')) {
        errorMsg = '当前访问人数过多，请求速率已达上限，请稍后重试。';
      } else if (errorMsg.includes('401') || errorMsg.includes('Invalid Authentication') || errorMsg.includes('Unauthorized')) {
        errorMsg = 'API 密钥无效或未配置，请联系运营者检查后台 API 密钥。';
      }
      
      setError(errorMsg);
    } finally {
      setIsFetching(false);
      setStatusMsg('');
    }
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      setError('请输入排版或生成要求');
      return;
    }

    const payload = {
      prompt,
      content,
      model,
      wordCount,
      writingStyle,
      eduLevel,
      perfLevel,
      addTypos,
      humanTrace,
      enableEvidenceSupport,
      diagramMode,
      enableSignatureDate,
      authorName,
      documentDate,
      images: uploadedImages.map(img => ({ id: img.id, base64: img.base64 }))
    };

    await executeGenerate(
      payload, 
      uploadedImages.length > 0 ? '正在分析图片...' : '正在分析需求...', 
      '正在生成内容...'
    );
  };

  const handleRefine = async (customPrompt?: string) => {
    const instruction = customPrompt || refinePrompt;
    if (!instruction.trim()) return;

    const payload = {
      prompt: "【后期优化/修改要求】：\n" + instruction + "\n\n请严格基于下方提供的【当前已有内容】进行修改和润色，不要偏离原意，保持原文未要求修改的部分基本不变。",
      content: cleanMarkdown, // Use currently generated content as the new base context
      model,
      wordCount,
      writingStyle,
      eduLevel,
      perfLevel,
      addTypos,
      humanTrace,
      enableEvidenceSupport,
      diagramMode,
      enableSignatureDate,
      authorName,
      documentDate,
      images: uploadedImages.map(img => ({ id: img.id, base64: img.base64 }))
    };

    setRefinePrompt('');
    await executeGenerate(
      payload, 
      '正在阅读当前内容并构思优化方案...', 
      '正在润色生成中...'
    );
  };

  const escapeHtml = (value: string) => value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  const normalizeSignatureBlockForDownload = (markdown: string) => {
    if (!enableSignatureDate) return markdown;
    if (/<div\s+align=["']right["']>/i.test(markdown)) return markdown;
    const lines = markdown.split(/\r?\n/);
    let dateLineIndex = -1;
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      if (lines[i].trim()) {
        dateLineIndex = i;
        break;
      }
    }
    if (dateLineIndex <= 0) return markdown;
    const dateLine = lines[dateLineIndex].trim();
    if (!/^\d{4}年\d{1,2}月\d{1,2}日$/.test(dateLine)) return markdown;
    let authorLineIndex = dateLineIndex - 1;
    while (authorLineIndex >= 0 && !lines[authorLineIndex].trim()) {
      authorLineIndex -= 1;
    }
    if (authorLineIndex < 0) return markdown;
    const authorLine = lines[authorLineIndex].trim();
    if (!authorLine || authorLine.length > 30 || /[。！？.!?]$/.test(authorLine)) return markdown;
    const replacement = [
      '<div align="right">',
      `<p class="signature-line">${escapeHtml(authorLine)}</p>`,
      `<p class="signature-line">${escapeHtml(dateLine)}</p>`,
      '</div>'
    ].join('\n');
    return [
      ...lines.slice(0, authorLineIndex),
      replacement,
      ...lines.slice(dateLineIndex + 1)
    ].join('\n');
  };

  const normalizeSvgForCanvas = (svgContent: string) => {
    const parser = new DOMParser();
    const svgDoc = parser.parseFromString(svgContent, 'image/svg+xml');
    const svgEl = svgDoc.documentElement;
    const ns = 'http://www.w3.org/2000/svg';
    const decodeHtmlText = (value: string) => {
      const htmlDoc = parser.parseFromString(`<body>${value}</body>`, 'text/html');
      return htmlDoc.body.textContent || '';
    };
    const charUnits = (char: string) => (/[\u0000-\u00ff]/.test(char) ? 0.56 : 1);
    const wrapByUnits = (line: string, maxUnits: number) => {
      const parts: string[] = [];
      let current = '';
      let units = 0;
      Array.from(line).forEach((char) => {
        const nextUnits = units + charUnits(char);
        if (current && nextUnits > maxUnits) {
          parts.push(current);
          current = char;
          units = charUnits(char);
        } else {
          current += char;
          units = nextUnits;
        }
      });
      if (current) parts.push(current);
      return parts;
    };
    const foreignObjects = Array.from(svgEl.querySelectorAll('foreignObject'));
    foreignObjects.forEach((fo) => {
      const rawXml = Array.from(fo.childNodes).map((node) => new XMLSerializer().serializeToString(node)).join('');
      const plainText = decodeHtmlText(
        rawXml
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/<\/(p|div|li|tr|h\d)>/gi, '\n')
          .replace(/<[^>]+>/g, '')
          .replace(/&nbsp;/gi, ' ')
      );
      const x = Number.parseFloat(fo.getAttribute('x') || '0');
      const y = Number.parseFloat(fo.getAttribute('y') || '0');
      const width = Number.parseFloat(fo.getAttribute('width') || '0');
      const height = Number.parseFloat(fo.getAttribute('height') || '0');
      const maxUnits = Math.max(4, Math.floor((width - 16) / 8.4));
      const normalizedLines = plainText
        .split('\n')
        .map((line) => line.replace(/\s+/g, ' ').trim())
        .filter(Boolean)
        .flatMap((line) => wrapByUnits(line, maxUnits));
      if (normalizedLines.length === 0) {
        fo.remove();
        return;
      }
      const lines = normalizedLines;
      const centerX = x + width / 2;
      const centerY = y + height / 2;
      const lineHeight = 18;
      const startY = centerY - ((lines.length - 1) * lineHeight) / 2;
      const textNode = svgDoc.createElementNS(ns, 'text');
      textNode.setAttribute('x', String(centerX));
      textNode.setAttribute('y', String(startY));
      textNode.setAttribute('text-anchor', 'middle');
      textNode.setAttribute('fill', '#111111');
      textNode.setAttribute('font-size', '14');
      textNode.setAttribute('font-family', 'Microsoft YaHei, PingFang SC, Arial, sans-serif');
      lines.forEach((line, idx) => {
        const tspan = svgDoc.createElementNS(ns, 'tspan');
        tspan.setAttribute('x', String(centerX));
        if (idx > 0) {
          tspan.setAttribute('dy', String(lineHeight));
        }
        tspan.textContent = line;
        textNode.appendChild(tspan);
      });
      fo.replaceWith(textNode);
    });
    const rootWidthAttr = Number((svgEl.getAttribute('width') || '').replace(/[^\d.]/g, ''));
    const rootHeightAttr = Number((svgEl.getAttribute('height') || '').replace(/[^\d.]/g, ''));
    const rootViewBox = svgEl.getAttribute('viewBox')?.trim().split(/\s+/).map(Number) || [];
    const padding = 24;
    if (rootViewBox.length === 4 && rootViewBox.every((num) => Number.isFinite(num))) {
      const [vbX, vbY, vbW, vbH] = rootViewBox;
      svgEl.setAttribute('viewBox', `${vbX - padding} ${vbY - padding} ${vbW + padding * 2} ${vbH + padding * 2}`);
    }
    if (Number.isFinite(rootWidthAttr) && rootWidthAttr > 0) {
      svgEl.setAttribute('width', String(rootWidthAttr + padding * 2));
    }
    if (Number.isFinite(rootHeightAttr) && rootHeightAttr > 0) {
      svgEl.setAttribute('height', String(rootHeightAttr + padding * 2));
    }
    svgEl.querySelectorAll('text,tspan').forEach((node) => {
      const element = node as SVGElement;
      if (!element.getAttribute('fill') || element.getAttribute('fill') === 'currentColor') {
        element.setAttribute('fill', '#111111');
      }
      if (!element.getAttribute('font-family')) {
        element.setAttribute('font-family', 'Microsoft YaHei, PingFang SC, Arial, sans-serif');
      }
    });
    return new XMLSerializer().serializeToString(svgDoc);
  };

  const svgToPngDataUrl = async (svgContent: string) => {
    const normalizedSvg = normalizeSvgForCanvas(svgContent);
    const parser = new DOMParser();
    const svgDoc = parser.parseFromString(normalizedSvg, 'image/svg+xml');
    const svgEl = svgDoc.documentElement;
    const viewBox = svgEl.getAttribute('viewBox')?.trim().split(/\s+/).map(Number) || [];
    const widthAttr = Number((svgEl.getAttribute('width') || '').replace(/[^\d.]/g, ''));
    const heightAttr = Number((svgEl.getAttribute('height') || '').replace(/[^\d.]/g, ''));
    const width = Number.isFinite(widthAttr) && widthAttr > 0 ? widthAttr : (viewBox[2] || 1200);
    const height = Number.isFinite(heightAttr) && heightAttr > 0 ? heightAttr : (viewBox[3] || 800);
    const scale = 2;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.ceil(width * scale));
    canvas.height = Math.max(1, Math.ceil(height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('图示转换失败');
    }
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const { Canvg } = await import('canvg');
    const canvg = Canvg.fromString(ctx, normalizedSvg, { ignoreAnimation: true, ignoreMouse: true });
    await canvg.render();
    return canvas.toDataURL('image/png');
  };

  const convertMermaidBlocksToImages = async (markdown: string) => {
    const codeBlockRegex = /```[ \t]*([^\n`]*)\n([\s\S]*?)```/g;
    if (!codeBlockRegex.test(markdown)) return markdown;
    const mermaid = await loadMermaid();
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'loose',
      flowchart: {
        htmlLabels: false,
        useMaxWidth: false,
      },
    });
    codeBlockRegex.lastIndex = 0;
    let result = '';
    let lastIndex = 0;
    let blockNo = 1;
    while (true) {
      const match = codeBlockRegex.exec(markdown);
      if (!match) break;
      result += markdown.slice(lastIndex, match.index);
      const lang = (match[1] || '').trim().toLowerCase();
      const rawBody = match[2] || '';
      let graphCode = '';
      if (lang === 'mermaid') {
        graphCode = rawBody.trim();
      } else if (!lang && /^mermaid\s*\n/i.test(rawBody)) {
        graphCode = rawBody.replace(/^mermaid\s*\n/i, '').trim();
      }
      if (!graphCode) {
        result += match[0];
      } else {
        const renderCode = `%%{init: {'securityLevel': 'strict', 'theme': 'default', 'flowchart': {'htmlLabels': false, 'useMaxWidth': false}}}%%\n${graphCode}`;
        const { svg } = await mermaid.render(`mermaid-download-${crypto.randomUUID()}-${blockNo}`, renderCode);
        const pngDataUrl = await svgToPngDataUrl(svg);
        result += `![流程图${blockNo}](${pngDataUrl})`;
      }
      lastIndex = codeBlockRegex.lastIndex;
      blockNo += 1;
    }
    result += markdown.slice(lastIndex);
    return result;
  };

  const handleDownload = async () => {
    if (!cleanMarkdown) return;
    setIsDownloading(true);
    setError(null);
    
    try {
      let markdownForDownload = normalizeSignatureBlockForDownload(cleanMarkdown);
      markdownForDownload = await convertMermaidBlocksToImages(markdownForDownload);
      const response = await fetch('/api/download', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          markdown: markdownForDownload,
          images: uploadedImages.map(img => ({ id: img.id, base64: img.base64 }))
        }),
      });

      if (!response.ok) {
        throw new Error('下载失败');
      }

      const blob = await response.blob();
      const serverFileName = getFileNameFromDisposition(response.headers.get('content-disposition'));
      const fallbackFileName = `${sanitizeFileName(extractTitleFromMarkdown(markdownForDownload))}.docx`;
      const finalFileName = sanitizeFileName((serverFileName || fallbackFileName).replace(/\.docx$/i, '')) + '.docx';
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = finalFileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      setSuccess(true);
    } catch (err) {
      console.error('Download Error:', err);
      const e = err as Error;
      
      let errorMsg = e.message || '下载发生未知错误';
      if (errorMsg.includes('Failed to fetch') || errorMsg.includes('NetworkError')) {
        errorMsg = '下载中断，请检查您的网络连接并重试。';
      }
      
      setError(errorMsg);
    } finally {
      setIsDownloading(false);
    }
  };

  const createMarkdownOverrides = (imageClassName: string) => ({
    img: {
      component: ({ alt, src, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) => {
        let resolvedSrc = src;
        const matchedImg = uploadedImages.find(img => img.id === src);
        if (matchedImg) {
          resolvedSrc = matchedImg.base64;
        }
        const ImgElement = 'img';
        return (
          <ImgElement
            alt={alt}
            src={resolvedSrc}
            className={cn("rounded-lg shadow-sm border border-gray-200 object-contain mx-auto", imageClassName)}
            {...props}
          />
        );
      }
    },
    pre: {
      component: ({ children, ...props }: React.HTMLAttributes<HTMLPreElement>) => {
        const firstChild = Array.isArray(children) ? children[0] : children;
        if (firstChild && typeof firstChild === 'object' && 'props' in firstChild) {
          const codeNode = firstChild as React.ReactElement<{ className?: string; children?: React.ReactNode }>;
          const className = codeNode.props.className || '';
          const codeContent = Array.isArray(codeNode.props.children)
            ? codeNode.props.children.join('')
            : String(codeNode.props.children ?? '');
          if (className.includes('language-mermaid')) {
            return <MermaidDiagram code={codeContent} />;
          }
          if (/^mermaid\s*\n/i.test(codeContent)) {
            return <MermaidDiagram code={codeContent.replace(/^mermaid\s*\n/i, '')} />;
          }
        }
        return <pre {...props}>{children}</pre>;
      }
    }
  });

  return (
    <div className="h-screen bg-gray-50/50 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shrink-0 z-10">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 text-indigo-600">
            <Wand2 className="w-6 h-6" />
            <h1 className="text-xl font-bold text-gray-900">AI Word 排版美化助手</h1>
          </div>
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-gray-100 p-1 flex items-center gap-1">
              <button
                type="button"
                onClick={() => setActiveNav('beautify')}
                className={cn(
                  'px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                  activeNav === 'beautify' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                )}
              >
                排版美化
              </button>
              <button
                type="button"
                onClick={() => setActiveNav('welfare')}
                className={cn(
                  'px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                  activeNav === 'welfare' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                )}
              >
                每日福利
              </button>
            </div>
            <div className="px-3 py-1 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 text-sm font-semibold hidden md:block">
              新平台启动，全站免费体验中
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 min-h-0 overflow-y-auto lg:overflow-hidden">
        {activeNav === 'beautify' ? (
        <div className="max-w-[1600px] mx-auto px-4 py-6 h-full flex flex-col lg:flex-row gap-6">
          
          {/* Left Column: Advanced Settings */}
          <div className="w-full lg:w-[25%] lg:h-full lg:overflow-y-auto lg:pr-2 pb-6 space-y-6 custom-scrollbar">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-800 mb-6 flex items-center gap-2">
                <SlidersHorizontal className="w-5 h-5 text-indigo-500" />
                高级参数设置
              </h2>
              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    指定字数 (可选)
                  </label>
                  <input
                    type="number"
                    value={wordCount}
                    onChange={(e) => setWordCount(e.target.value)}
                    placeholder="例如: 1000"
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:ring-1 focus:ring-indigo-500 outline-none bg-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    文笔风格 (可选)
                  </label>
                  <select
                    value={writingStyle}
                    onChange={(e) => setWritingStyle(e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:ring-1 focus:ring-indigo-500 outline-none bg-white"
                  >
                    {WRITING_STYLES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    写作水平角色 (可选)
                  </label>
                  <select
                    value={eduLevel}
                    onChange={(e) => setEduLevel(e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:ring-1 focus:ring-indigo-500 outline-none bg-white"
                  >
                    {EDU_LEVELS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
                {eduLevel && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      水平等级
                    </label>
                    <select
                      value={perfLevel}
                      onChange={(e) => setPerfLevel(e.target.value)}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:ring-1 focus:ring-indigo-500 outline-none bg-white"
                    >
                      {PERF_LEVELS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                  </div>
                )}
                <div className="flex flex-col gap-2 pt-2 border-t border-gray-100">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-800">添加随机错别字</span>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" className="sr-only peer" checked={addTypos} onChange={(e) => setAddTypos(e.target.checked)} />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                    </label>
                  </div>
                  <span className="text-xs text-gray-500">开启后文章中将随机出现1-5个错别字</span>
                </div>
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-800">真人思考痕迹</span>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" className="sr-only peer" checked={humanTrace} onChange={(e) => setHumanTrace(e.target.checked)} />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                    </label>
                  </div>
                  <span className="text-xs text-gray-500">开启后会增加自然推敲、对比与自我修正语气，模拟真人写作过程</span>
                </div>
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-800">数据与案例支撑</span>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" className="sr-only peer" checked={enableEvidenceSupport} onChange={(e) => setEnableEvidenceSupport(e.target.checked)} />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                    </label>
                  </div>
                  <span className="text-xs text-gray-500">开启后会在合适段落插入可核验的来源引用（网址、论文或文章）</span>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    自动图示插入
                  </label>
                  <select
                    value={diagramMode}
                    onChange={(e) => setDiagramMode(e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:ring-1 focus:ring-indigo-500 outline-none bg-white"
                  >
                    {DIAGRAM_MODES.map((mode) => (
                      <option key={mode.value} value={mode.value}>{mode.label}</option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-gray-500">可选在正文关键位置自动插入 Mermaid 图示代码块，便于梳理结构和流程。</p>
                </div>
              </div>
            </div>

            {/* Author & Date Settings Card */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-800 mb-6 flex items-center gap-2">
                <FileText className="w-5 h-5 text-indigo-500" />
                署名与日期
              </h2>
              <div className="space-y-5">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-800">启用署名与日期</span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" checked={enableSignatureDate} onChange={(e) => setEnableSignatureDate(e.target.checked)} />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                  </label>
                </div>
                {enableSignatureDate ? (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        文档署名 / 报告者 (可选)
                      </label>
                      <input
                        type="text"
                        value={authorName}
                        onChange={(e) => setAuthorName(e.target.value)}
                        placeholder="不填写则用 'XXX' 代替"
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:ring-1 focus:ring-indigo-500 outline-none bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        落款日期 (可选)
                      </label>
                      <input
                        type="text"
                        value={documentDate}
                        onChange={(e) => setDocumentDate(e.target.value)}
                        placeholder="不填则自动获取今日日期"
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:ring-1 focus:ring-indigo-500 outline-none bg-white"
                      />
                    </div>
                  </>
                ) : (
                  <div className="text-xs text-gray-500">
                    已关闭：生成内容中将不包含署名与落款日期，涉及时间时仅允许基于已提供资料。
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Middle Column: Inputs */}
          <div className="w-full lg:w-[45%] lg:h-full lg:overflow-y-auto lg:pr-2 pb-6 space-y-6 custom-scrollbar">
            {/* Settings Card */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center gap-2 mb-4 text-gray-800">
              <Settings className="w-5 h-5 text-gray-500" />
              <h2 className="text-lg font-semibold">生成设置</h2>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  选择模型
                </label>
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                >
                  {visibleModels.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}{m.supportsImage ? ' · 支持图片' : ' · 仅纯文本'}
                    </option>
                  ))}
                </select>
                {hasImages && (
                  <p className="mt-2 text-xs text-gray-500">
                    已上传图片：下拉框仅显示支持图片理解的多模态模型。
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  排版/生成要求 <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="例如：请帮我写一份关于AI技术在医疗领域应用的商业计划书，要求排版专业，包含标题、正文、列表和总结..."
                  className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all resize-none"
                  rows={4}
                />
              </div>
            </div>
          </div>

          {/* Content Card */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div 
              className="p-6 cursor-pointer hover:bg-gray-50 transition-colors flex items-center justify-between"
              onClick={() => setIsContentOpen(!isContentOpen)}
            >
              <div className="flex items-center gap-2 text-gray-800">
                <FileText className="w-5 h-5 text-gray-500" />
                <h2 className="text-lg font-semibold">原始内容 (可选)</h2>
                {content && (
                  <span className="ml-2 text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-medium">
                    已填写
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-500 hidden sm:inline-block">
                  如需美化已有文档，请展开粘贴文本或上传
                </span>
                <div className="p-1 rounded-full bg-gray-100 text-gray-500">
                  {isContentOpen ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                </div>
              </div>
            </div>

            {isContentOpen && (
              <div className="px-6 pb-6 border-t border-gray-100 pt-4 bg-gray-50/30">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-sm font-medium text-gray-700">文本内容</div>
                  <div className="flex items-center gap-3">
                    <input 
                      type="file" 
                      ref={fileInputRef}
                      accept=".docx"
                      onChange={handleFileUpload}
                      className="hidden" 
                    />
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        fileInputRef.current?.click();
                      }}
                      disabled={isUploading}
                      className="text-xs flex items-center gap-1 text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-md transition-colors"
                    >
                      {isUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                      上传 Word 提取文字
                    </button>
                  </div>
                </div>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="在此粘贴需要美化或润色的文本内容..."
                  className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all resize-none font-mono text-sm bg-white"
                  rows={8}
                />
              </div>
            )}
          </div>
          {/* Image Upload Section */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex flex-col mb-4 gap-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-gray-800">
                    <ImagePlus className="w-5 h-5 text-gray-500" />
                    <h2 className="text-lg font-semibold">上传图片 (可选)</h2>
                  </div>
                  <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                    上传图片并要求AI插入到文档中
                  </span>
                </div>
                <div className="text-xs text-indigo-600 bg-indigo-50 p-2 rounded-md flex items-start gap-1">
                  <Wand2 className="w-4 h-4 shrink-0" />
                  <span>上传图片后，AI 将会自动分析图片内容并将其插入到文章的相应位置，确保上下文连贯且图文不跑偏。若上传 GIF，将自动提取首帧按静态图处理。</span>
                </div>
              </div>
            
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {uploadedImages.map((img) => (
                <div key={img.id} className="relative group rounded-lg border border-gray-200 overflow-hidden aspect-square bg-gray-50">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img 
                    src={img.base64} 
                    alt="uploaded" 
                    className="w-full h-full object-cover"
                  />
                  <button
                    onClick={() => removeImage(img.id)}
                    className="absolute top-2 right-2 p-1 bg-white/80 hover:bg-red-100 hover:text-red-600 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-4 h-4" />
                  </button>
                  <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[10px] px-2 py-1 truncate">
                    ID: {img.id}
                  </div>
                </div>
              ))}
              
              <button 
                onClick={() => imageInputRef.current?.click()}
                className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 hover:border-indigo-500 hover:bg-indigo-50 transition-colors aspect-square text-gray-500 hover:text-indigo-600"
              >
                <ImagePlus className="w-6 h-6" />
                <span className="text-xs font-medium">添加图片</span>
              </button>
            </div>
            <input
              type="file"
              ref={imageInputRef}
              accept="image/*"
              multiple
              onChange={handleImageUpload}
              className="hidden"
            />
          </div>
        </div>

          {/* Right Column: Actions & Status */}
          <div className="w-full lg:w-[40%] lg:h-full lg:overflow-y-auto lg:pr-2 pb-6 flex flex-col custom-scrollbar">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 flex flex-col min-h-max">
              <h2 className="text-lg font-semibold text-gray-800 mb-4 shrink-0">操作面板</h2>
              
              <button
                onClick={handleGenerate}
                disabled={isFetching || isTyping}
                className={cn(
                  "w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg font-medium text-white transition-all shadow-sm shrink-0",
                  (isFetching || isTyping) 
                    ? "bg-indigo-400 cursor-not-allowed" 
                    : "bg-indigo-600 hover:bg-indigo-700 hover:shadow"
                )}
              >
                {isFetching || isTyping ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    {statusMsg || '正在生成内容...'}
                  </>
                ) : (
                  <>
                    <Wand2 className="w-5 h-5" />
                    开始排版并生成
                  </>
                )}
              </button>

              <div className="text-xs text-gray-500 text-center mt-3 shrink-0">
                点击开始排版并生成即表示您同意本站的
                <button onClick={() => setIsAgreementModalOpen(true)} className="text-indigo-600 hover:underline mx-1">《用户协议》</button>
                与
                <button onClick={() => setIsPrivacyModalOpen(true)} className="text-indigo-600 hover:underline ml-1">《隐私政策》</button>
              </div>

              {/* Generated Content View */}
              {(displayedMarkdown || isFetching || isTyping) && (
                <div className="mt-6 border border-gray-200 rounded-lg overflow-hidden bg-gray-50 flex flex-col flex-1 min-h-[300px] transition-all">
                  <div className="bg-gray-100 border-b border-gray-200 px-3 py-2 flex items-center justify-between shrink-0">
                    <span className="text-xs font-medium text-gray-600">生成预览</span>
                    <button 
                      onClick={() => setIsModalOpen(true)}
                      className="text-gray-500 hover:text-indigo-600 p-1 rounded hover:bg-gray-200 transition-colors"
                      title="全屏查看"
                    >
                      <Maximize2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div 
                    ref={resultRef}
                    onScroll={handleScroll}
                    className="p-4 overflow-y-auto flex-1 text-sm prose prose-sm prose-indigo max-w-none custom-scrollbar bg-white"
                  >
                    {displayedMarkdown ? (
                      <Markdown
                        options={{
                          overrides: createMarkdownOverrides('max-h-64')
                        }}
                      >
                        {cleanMarkdown}
                      </Markdown>
                    ) : (
                      <div className="text-gray-400 flex items-center justify-center h-full w-full gap-2 animate-pulse">
                        <Loader2 className="w-4 h-4 animate-spin" /> {statusMsg || '正在思考中...'}
                      </div>
                    )}
                  </div>
                  <div className="bg-white border-t border-gray-200 p-3 shrink-0">
                  <button
                    onClick={handleDownload}
                    disabled={isFetching || isTyping || isDownloading || !displayedMarkdown}
                    className={cn(
                      "w-full flex items-center justify-center gap-2 py-2 px-4 rounded-md font-medium transition-all text-sm",
                      (isFetching || isTyping || !displayedMarkdown || isDownloading)
                        ? "bg-gray-100 text-gray-400 cursor-not-allowed" 
                        : "bg-green-600 text-white hover:bg-green-700 shadow-sm"
                    )}
                  >
                    {isDownloading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Download className="w-4 h-4" />
                    )}
                    下载 Word 文档
                  </button>
                </div>
              </div>
            )}

            {/* Refinement Panel */}
            {(!isFetching && !isTyping && displayedMarkdown) && (
              <div className="mt-4 bg-indigo-50/50 rounded-xl border border-indigo-100 p-5 shrink-0 transition-all">
                <h3 className="text-sm font-semibold text-indigo-900 mb-3 flex items-center gap-2">
                  <Wand2 className="w-4 h-4" />
                  对结果不满意？继续润色优化
                </h3>
                <div className="flex flex-wrap gap-2 mb-4">
                  <button onClick={() => handleRefine('请帮我自动润色一下这篇文章，使其更加通顺流畅、用词更专业准确。')} className="text-xs bg-white border border-indigo-200 text-indigo-600 px-3 py-1.5 rounded-full hover:bg-indigo-100 hover:border-indigo-300 transition-colors">自动润色</button>
                  <button onClick={() => handleRefine('请帮我扩写当前内容，增加更多的细节和生动的描述，使其更加丰富。')} className="text-xs bg-white border border-indigo-200 text-indigo-600 px-3 py-1.5 rounded-full hover:bg-indigo-100 hover:border-indigo-300 transition-colors">丰富扩写</button>
                  <button onClick={() => handleRefine('请帮我精简当前内容，去除冗余词句，保留核心信息即可。')} className="text-xs bg-white border border-indigo-200 text-indigo-600 px-3 py-1.5 rounded-full hover:bg-indigo-100 hover:border-indigo-300 transition-colors">精简缩写</button>
                  <button onClick={() => handleRefine('请帮我调整这篇文章的语气，使其显得更加正式和严谨。')} className="text-xs bg-white border border-indigo-200 text-indigo-600 px-3 py-1.5 rounded-full hover:bg-indigo-100 hover:border-indigo-300 transition-colors">更正式</button>
                </div>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    value={refinePrompt}
                    onChange={(e) => setRefinePrompt(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleRefine()}
                    placeholder="或输入具体修改要求，如：把第二段改得更幽默..." 
                    className="flex-1 rounded-lg border border-indigo-200 px-3 py-2 text-sm focus:ring-1 focus:ring-indigo-500 outline-none bg-white"
                  />
                  <button 
                    onClick={() => handleRefine()}
                    disabled={!refinePrompt.trim()}
                    className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                  >
                    重新生成
                  </button>
                </div>
              </div>
            )}

            {/* Status Messages */}
              <div className="mt-6 space-y-4 shrink-0">
                {error && (
                  <div className="p-4 bg-red-50 border border-red-100 rounded-lg flex items-start gap-3 text-red-700">
                    <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                    <p className="text-sm">{error}</p>
                  </div>
                )}
                
                {success && (
                  <div className="p-4 bg-green-50 border border-green-100 rounded-lg flex items-start gap-3 text-green-700">
                    <Download className="w-5 h-5 shrink-0 mt-0.5" />
                    <p className="text-sm">生成成功！Word文档已开始下载。</p>
                  </div>
                )}

                <div className="pt-6 border-t border-gray-100 pb-4">
                  <h3 className="text-sm font-medium text-gray-900 mb-2">使用说明与免责声明</h3>
                  <ul className="text-sm text-gray-600 space-y-2 list-disc list-inside pl-1 mb-4">
                    <li><strong>直接生成：</strong>在左侧输入具体要求，点击生成即可获取完整排版的Word文档。</li>
                    <li><strong>排版美化：</strong>将已有内容粘贴到左侧文本框，并在要求中说明想要的排版风格。</li>
                    <li>由于 AI 生成速度视内容长度而定，请耐心等待。</li>
                  </ul>
                  <div className="p-3 bg-amber-50 border border-amber-100 rounded-md">
                    <p className="text-xs text-amber-800 leading-relaxed text-justify">
                      <strong>个人运营提示：</strong>本工具为个人独立运营，依赖上游商业模型接口。高峰期可能会遇到请求响应较长或达到并发速率限制的情况，请耐心等待或稍后再试；若页面提示“余额不足”等错误，则为个人运营者的上游 API 额度已耗尽，敬请谅解。
                    </p>
                    {/* <div className="mt-3 p-3 bg-indigo-50 border border-indigo-100 rounded-md flex items-start gap-2 cursor-pointer hover:bg-indigo-100 transition-colors" onClick={() => setIsDonateModalOpen(true)}>
                      <Heart className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
                      <p className="text-xs text-indigo-700 leading-relaxed">
                        如果觉得该工具好用，欢迎向我捐赠。若您使用 USDT，可直接参考下方网络与地址进行捐助。您的支持将用于维持服务器的稳定运行和上游大模型 API 余额的充值，让好工具走得更远。同时也欢迎大家提出宝贵的意见！
                      </p>
                    </div> */}
                    {/* <div className="mt-3 p-3 bg-indigo-50 border border-indigo-100 rounded-md">
                      <p className="text-xs text-indigo-700 leading-relaxed">
                        新平台启动，全站免费体验中。
                      </p>
                    </div> */}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        ) : (
          <div className="max-w-5xl mx-auto px-4 py-8">
            <div className="bg-white rounded-xl shadow-sm border border-amber-200 p-6 md:p-8">
              <div className="flex items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-2 text-amber-800">
                  <Gift className="w-5 h-5" />
                  <h2 className="text-xl font-semibold text-gray-900">每日视频</h2>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setVideoLoadError('');
                    setWelfareRefreshKey(Date.now());
                  }}
                  className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm text-amber-700 hover:bg-amber-100 transition-colors"
                >
                  <RefreshCw className="w-4 h-4" />
                  刷新片源
                </button>
              </div>
              <p className="text-sm text-gray-600 mb-4">
                每日视频会自动更新，点击播放即可观看当日内容。
              </p>
              <WelfareVideoPlayer
                refreshKey={welfareRefreshKey}
                videoSrc={welfareVideoSrc}
                subtitleSrc={welfareSubtitleSrc}
                onLoadedData={() => setVideoLoadError('')}
                onError={() => setVideoLoadError('视频暂时无法播放，请点击“刷新片源”重试，或稍后再试。')}
                className="w-full rounded-lg border border-amber-200 bg-black"
              />
              {videoLoadError && (
                <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {videoLoadError}
                </p>
              )}
              <p className="mt-3 text-xs text-amber-700">
                如未显示字幕，请确认字幕文件已就位后点击“刷新片源”重试。
              </p>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 shrink-0 py-4">
        <div className="max-w-7xl mx-auto px-4 text-center text-sm text-gray-500 flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-6">
          <p>violet运营</p>
          <p className="hidden sm:block">|</p>
          <div className="flex items-center gap-4">
            <button onClick={() => setIsAgreementModalOpen(true)} className="hover:text-indigo-600 transition-colors">用户协议</button>
            <button onClick={() => setIsPrivacyModalOpen(true)} className="hover:text-indigo-600 transition-colors">隐私政策</button>
          </div>
        </div>
      </footer>

      {/* Donate Modal
      {isDonateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-800 text-lg flex items-center gap-2">
                <Heart className="w-5 h-5 text-red-500 fill-current" />
                支持与捐助
              </h3>
              <button 
                onClick={() => setIsDonateModalOpen(false)}
                className="p-2 bg-gray-100 hover:bg-gray-200 rounded-full text-gray-600 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 text-center">
              <p className="text-sm text-gray-600 mb-6 leading-relaxed">
                感谢您的支持！所有捐助资金将全部用于购买上游 AI 模型（如 Kimi / 智谱）的 Token 额度，以及维持本站服务器的稳定运转。后续是否接入 ChatGPT、Gemini 等模型，将视 USD / USDT 预算情况决定。
              </p>
              <div className="flex flex-col items-center gap-4">
                <div className="flex justify-center gap-6 w-full">
                  <div className="flex flex-col items-center gap-2">
                    <img src="/wechatpay.jpg" alt="微信赞赏码" className="w-36 h-36 rounded-xl object-contain border border-gray-200 shadow-sm" />
                    <span className="text-xs text-gray-500 font-medium">微信赞赏</span>
                  </div>
                  <div className="flex flex-col items-center gap-2">
                    <img src="/alipay.jpg" alt="支付宝收款码" className="w-36 h-36 rounded-xl object-contain border border-gray-200 shadow-sm" />
                    <span className="text-xs text-gray-500 font-medium">支付宝收款</span>
                  </div>
                </div>
                {hasUsdtDonationInfo ? (
                  <div className="w-full rounded-lg border border-indigo-100 bg-indigo-50 px-4 py-3 text-left space-y-2">
                    <p className="text-xs text-indigo-700 leading-relaxed">
                      USDT 捐助信息如下，请务必核对网络与地址，建议先小额测试后再正式转账。
                    </p>
                    <div className="text-xs text-indigo-800">
                      网络：<span className="font-semibold">{USDT_DONATION_NETWORK}</span>
                    </div>
                    <div className="text-xs text-indigo-800 break-all">
                      地址：<span className="font-mono">{USDT_DONATION_ADDRESS}</span>
                    </div>
                    <button
                      onClick={handleCopyUsdtAddress}
                      className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 transition-colors"
                    >
                      {isUsdtCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      {isUsdtCopied ? '地址已复制' : '复制地址'}
                    </button>
                  </div>
                ) : (
                  <div className="w-full rounded-lg border border-indigo-100 bg-indigo-50 px-4 py-3 text-left">
                    <p className="text-xs text-indigo-700 leading-relaxed">
                      USDT 捐助通道准备中：你可以先联系我获取最新地址与网络信息。
                    </p>
                  </div>
                )}
              </div>
            </div>
            <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-center">
              <button
                onClick={() => setIsDonateModalOpen(false)}
                className="w-full py-2 px-6 rounded-lg font-medium bg-gray-200 text-gray-700 hover:bg-gray-300 transition-all"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )} */}

      {/* Privacy Policy Modal */}
      {isPrivacyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-800 text-lg">隐私政策</h3>
              <button 
                onClick={() => setIsPrivacyModalOpen(false)}
                className="p-2 bg-gray-100 hover:bg-gray-200 rounded-full text-gray-600 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1 prose prose-sm max-w-none text-gray-600 custom-scrollbar">
              <h4>1. 数据收集与流转</h4>
              <p>根据《中华人民共和国个人信息保护法》及《中华人民共和国数据安全法》的相关规定，本工具作为一个前端中间件平台，承诺**不在本地或云端数据库中保存、记录、或截留您上传的任何文本或图片内容**。您输入的所有排版要求、文本以及图片，将通过加密传输协议（HTTPS）直接发送至上游的 AI 服务提供商（如智谱 AI、月之暗面等）的 API 接口进行实时推理与生成。</p>
              <h4>2. 上游数据安全与隐私边界</h4>
              <p>本平台不控制上游 AI 厂商的数据处理行为。您的数据安全和隐私保护受限于所选模型提供商（Zhipu AI、Moonshot AI 等）的用户协议与隐私政策。本平台强烈建议您**不要在使用本工具时上传任何包含国家机密、商业机密、敏感个人隐私信息（如身份证、银行卡等）的内容**。</p>
              <h4>3. 模型训练声明</h4>
              <p>本平台自身**绝对不会**利用您上传的任何数据进行模型训练或微调。关于上游 AI 厂商是否会利用您的 API 请求数据进行模型迭代，请参阅其官方声明。一般情况下，API 接入商会承诺不对企业接口数据进行训练，但请以官方最新政策为准。</p>
              <h4>4. 政策更新与联系我们</h4>
              <p>我们保留随时更新本政策的权利。如您对本隐私政策或您的数据安全有任何疑问，请通过其他渠道与我们联系。</p>
            </div>
          </div>
        </div>
      )}

      {/* User Agreement Modal */}
      {isAgreementModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-800 text-lg">用户协议</h3>
              <button 
                onClick={() => setIsAgreementModalOpen(false)}
                className="p-2 bg-gray-100 hover:bg-gray-200 rounded-full text-gray-600 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1 prose prose-sm max-w-none text-gray-600 custom-scrollbar">
              <h4>1. 服务说明</h4>
              <p>“AI Word 排版美化助手”为您提供基于人工智能的文档生成与排版美化服务。您应合法、合规地使用本工具，不得利用本工具生成违反国家法律法规、危害国家安全、破坏社会稳定、侵犯他人合法权益的内容。</p>
              <h4>2. 知识产权与版权风险申明</h4>
              <p>本平台不主动使用未经授权的特定字体、模板或受版权保护的图片进行内容生成。但请注意，由于 AI 模型的特性，生成的文本或内容可能偶有雷同，或者模型在训练时可能受到未知数据的干扰。<strong>用户需自行对使用本工具生成的文档负责，并承担因商用等目的引发的任何版权、著作权纠纷的直接或间接法律责任。</strong></p>
              <h4>3. 服务的可用性与免责声明</h4>
              <p>由于网络环境、第三方 AI 接口稳定性等不可抗力因素，本服务不保证 100% 的持续可用性。因服务中断、数据丢失导致的任何直接或间接损失，本平台不承担赔偿责任。</p>
              <h4>4. 违规行为处理</h4>
              <p>若发现用户恶意利用本平台生成涉黄、涉暴、涉政等违法违规内容，我们有权立即停止为其提供服务，并配合有关部门的调查。</p>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Modal for Markdown Preview */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl h-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-800">文档预览</h3>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="p-2 bg-gray-100 hover:bg-gray-200 rounded-full text-gray-600 transition-colors"
              >
                <Minimize2 className="w-4 h-4" />
              </button>
            </div>
            <div 
              ref={modalResultRef}
              onScroll={handleScroll}
              className="overflow-y-auto flex-1 max-w-none custom-scrollbar word-preview-container"
            >
              {displayedMarkdown ? (
                <div className="word-preview-page prose prose-base">
                  <Markdown
                    options={{
                      overrides: createMarkdownOverrides('max-h-96')
                    }}
                  >
                    {cleanMarkdown}
                  </Markdown>
                </div>
              ) : null}
            </div>
            <div className="p-4 border-t border-gray-100 bg-gray-50 flex flex-col sm:flex-row justify-end gap-3">
              {(!isFetching && !isTyping && displayedMarkdown) && (
                <button
                  onClick={handleCopy}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 py-2 px-6 rounded-lg font-medium bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 shadow-sm transition-all"
                >
                  {isCopied ? <Check className="w-5 h-5 text-green-600" /> : <Copy className="w-5 h-5" />}
                  {isCopied ? '已复制' : '复制内容'}
                </button>
              )}
              <button
                onClick={() => {
                  setIsModalOpen(false);
                  handleDownload();
                }}
                className="w-full sm:w-auto flex items-center justify-center gap-2 py-2 px-6 rounded-lg font-medium bg-green-600 text-white hover:bg-green-700 shadow-sm transition-all"
              >
                <Download className="w-5 h-5" />
                下载 Word 文档
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
