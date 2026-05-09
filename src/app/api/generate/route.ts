import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { trackAdminEvent } from '@/lib/admin-metrics';
import { saveImage } from '@/lib/image-store';

export const maxDuration = 300; // Allow 5 mins for large models + vision

class MimoOpenAI extends OpenAI {
  private mimoApiKey: string;

  constructor(options: ConstructorParameters<typeof OpenAI>[0] & { mimoApiKey: string }) {
    const { mimoApiKey, ...rest } = options;
    super(rest);
    this.mimoApiKey = mimoApiKey;
  }

  protected async prepareRequest(request: RequestInit) {
    const headers = new Headers(request.headers as HeadersInit);
    headers.delete('Authorization');
    if (this.mimoApiKey) {
      headers.set('api-key', this.mimoApiKey);
    }
    request.headers = headers;
  }
}

type EvidenceItem = {
  title: string;
  url: string;
  publishedAt?: string;
  source?: string;
};

function normalizeUrl(url: string): string {
  let fixed = url.trim();
  fixed = fixed.replace(/[，。；！？、）〕》>"'`]+$/g, '');
  if (fixed.startsWith('ttps://')) fixed = `h${fixed}`;
  if (fixed.startsWith('ttp://')) fixed = `h${fixed}`;
  fixed = fixed.replace(/^https?:\/(?!\/)/, (prefix) => `${prefix}/`);
  if (/\.ht$/i.test(fixed)) fixed = `${fixed}m`;
  return fixed;
}

function isPlaceholderUrl(url: string): boolean {
  const normalized = normalizeUrl(url).toLowerCase();
  if (!/^https?:\/\//.test(normalized)) return false;
  const host = normalized.replace(/^https?:\/\//, '').split('/')[0];
  const blockedHosts = new Set([
    'example.com',
    'www.example.com',
    'example.org',
    'www.example.org',
    'example.net',
    'www.example.net',
    'test.com',
    'www.test.com',
    'demo.com',
    'www.demo.com',
    'sample.com',
    'www.sample.com',
    'placeholder.com',
    'www.placeholder.com',
    'yourdomain.com',
    'www.yourdomain.com',
    'your-site.com',
    'www.your-site.com',
    'yourwebsite.com',
    'www.yourwebsite.com',
    'localhost',
    '127.0.0.1',
    '0.0.0.0',
  ]);
  if (blockedHosts.has(host)) return true;
  return /example|placeholder|your-?site|your-?domain|demo|sample/.test(normalized);
}

function normalizeReferenceUrlContent(content: string): string {
  const withCodeUrl = content.replace(/`([^`\n]+)`/g, (full, raw) => {
    if (!/^https?:\/\//i.test(raw) && !/^(ttps?:\/\/)/i.test(raw)) return full;
    const fixed = normalizeUrl(raw);
    if (isPlaceholderUrl(fixed)) return '';
    return `\`${fixed}\``;
  });
  return withCodeUrl
    .replace(/(https?:\/\/[^\s`]+|ttps?:\/\/[^\s`]+)/g, (raw) => {
      const fixed = normalizeUrl(raw);
      return isPlaceholderUrl(fixed) ? '' : fixed;
    })
    .replace(/``/g, '');
}

function getValidUrls(content: string): string[] {
  const matched = content.match(/(https?:\/\/[^\s`]+|ttps?:\/\/[^\s`]+)/g) || [];
  return matched
    .map((raw) => normalizeUrl(raw))
    .filter((url) => /^https?:\/\//i.test(url) && !isPlaceholderUrl(url));
}

function sanitizeReferenceSection(sectionText: string): string {
  return sectionText
    .split('\n')
    .map((line) => {
      const match = line.match(/^(\s*)\[(\d+)\]\s*(.+)\s*$/);
      if (!match) return line;
      const prefix = match[1];
      const no = match[2];
      const cleaned = normalizeReferenceUrlContent(match[3]);
      if (!cleaned) return '';
      if (getValidUrls(cleaned).length === 0) return '';
      return `${prefix}[${no}] ${cleaned}`;
    })
    .filter((line, idx, arr) => {
      if (line.trim() !== '') return true;
      const prev = arr[idx - 1];
      const next = arr[idx + 1];
      return Boolean(prev?.trim()) && Boolean(next?.trim());
    })
    .join('\n');
}

function createStreamingCitationNormalizer() {
  let inReferenceSection = false;
  let nextCitationNo = 1;
  const oldToNew = new Map<number, number>();
  let pending = '';

  const mapCitationNo = (rawNo: string): string => {
    const oldNo = Number(rawNo);
    if (Number.isNaN(oldNo)) return rawNo;
    if (!oldToNew.has(oldNo)) {
      oldToNew.set(oldNo, nextCitationNo);
      nextCitationNo += 1;
    }
    return String(oldToNew.get(oldNo));
  };

  const transform = (text: string): string => {
    const marker = text.search(/(^|\n)##\s*参考资料\s*($|\n)/);
    let output = text;
    if (marker >= 0) {
      const bodyPart = text.slice(0, marker).replace(/\[(\d+)\]/g, (_, n) => `[${mapCitationNo(n)}]`);
      const mappedRefPart = text.slice(marker).replace(/(^|\n)\s*\[(\d+)\]/g, (_, prefix, n) => `${prefix}[${mapCitationNo(n)}]`);
      const refPart = sanitizeReferenceSection(mappedRefPart);
      inReferenceSection = true;
      output = `${bodyPart}${refPart}`;
    } else if (inReferenceSection) {
      const mappedRefChunk = text.replace(/(^|\n)\s*\[(\d+)\]/g, (_, prefix, n) => `${prefix}[${mapCitationNo(n)}]`);
      output = sanitizeReferenceSection(mappedRefChunk);
    } else {
      output = text.replace(/\[(\d+)\]/g, (_, n) => `[${mapCitationNo(n)}]`);
    }
    return normalizeReferenceUrlContent(output);
  };

  const push = (chunk: string): string => {
    const merged = pending + chunk;
    const safeTailLen = 32;
    if (merged.length <= safeTailLen) {
      pending = merged;
      return '';
    }
    const flushPart = merged.slice(0, -safeTailLen);
    pending = merged.slice(-safeTailLen);
    return transform(flushPart);
  };

  const flush = (): string => {
    if (!pending) return '';
    const output = transform(pending);
    pending = '';
    return output;
  };

  return { push, flush };
}

let tavilyKeyCursor = 0;
let mimoKeyCursor = 0;

type MimoKeyEntry = { key: string; baseURL: string };

function getMimoKeyEntries(): MimoKeyEntry[] {
  const entries: MimoKeyEntry[] = [];
  const seen = new Set<string>();
  const defaults: Array<{ keyEnv: string; urlEnv: string; fallbackURL: string }> = [
    { keyEnv: 'MIMO_API_KEY', urlEnv: 'MIMO_BASE_URL', fallbackURL: 'https://token-plan-cn.xiaomimimo.com/v1' },
    { keyEnv: 'MIMO_API_KEY_2', urlEnv: 'MIMO_BASE_URL_2', fallbackURL: 'https://token-plan-sgp.xiaomimimo.com/v1' },
    { keyEnv: 'MIMO_API_KEY_3', urlEnv: 'MIMO_BASE_URL_3', fallbackURL: 'https://token-plan-sgp.xiaomimimo.com/v1' },
  ];
  for (const { keyEnv, urlEnv, fallbackURL } of defaults) {
    const key = (process.env[keyEnv] || '').trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const baseURL = (process.env[urlEnv] || '').trim() || fallbackURL;
    entries.push({ key, baseURL });
  }
  return entries;
}

function createMimoClient(): MimoOpenAI {
  const entries = getMimoKeyEntries();
  if (entries.length === 0) {
    return new MimoOpenAI({
      apiKey: '',
      mimoApiKey: '',
      baseURL: 'https://token-plan-cn.xiaomimimo.com/v1',
    });
  }
  const idx = mimoKeyCursor % entries.length;
  mimoKeyCursor = (mimoKeyCursor + 1) % entries.length;
  const { key, baseURL } = entries[idx];
  return new MimoOpenAI({
    apiKey: key,
    mimoApiKey: key,
    baseURL,
  });
}

function getTavilyApiKeys(): string[] {
  const keyList = [
    process.env.TAVILY_API_KEY?.trim() || '',
    process.env.TAVILY_API_KEY_2?.trim() || '',
    process.env.TAVILY_API_KEY_3?.trim() || '',
    ...(process.env.TAVILY_API_KEYS?.split(',').map((item) => item.trim()) || []),
  ].filter(Boolean);
  return Array.from(new Set(keyList));
}

function getRoundRobinOrderedKeys(keys: string[]): string[] {
  if (keys.length <= 1) return keys;
  const start = tavilyKeyCursor % keys.length;
  tavilyKeyCursor = (tavilyKeyCursor + 1) % keys.length;
  return keys.slice(start).concat(keys.slice(0, start));
}

async function fetchLatestEvidenceFromMcp(query: string): Promise<EvidenceItem[]> {
  const endpoint = process.env.MCP_SEARCH_ENDPOINT?.trim();
  if (!endpoint || !query.trim()) return [];

  try {
    const apiKey = process.env.MCP_API_KEY?.trim() || process.env.TAVILY_API_KEY?.trim();

    if (endpoint.includes('api.tavily.com/search')) {
      const tavilyKeys = getRoundRobinOrderedKeys(getTavilyApiKeys());
      const candidates = tavilyKeys.length > 0 ? tavilyKeys : (apiKey ? [apiKey] : []);
      if (candidates.length === 0) return [];

      for (const key of candidates) {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          cache: 'no-store',
          body: JSON.stringify({
            api_key: key,
            query,
            topic: 'general',
            search_depth: 'advanced',
            max_results: 6,
            include_answer: false,
            include_raw_content: false,
          }),
          signal: AbortSignal.timeout(15000),
        });

        if (!response.ok) {
          continue;
        }

        const data = await response.json() as {
          results?: Array<Record<string, unknown>>;
        };
        const parsed = (data.results || [])
          .map((item): EvidenceItem | null => {
            const title = String(item.title || '').trim();
            const url = String(item.url || '').trim();
            const publishedAt = String(item.published_date || '').trim();
            const source = String(item.site_name || '').trim();
            if (!title || !url) return null;
            return {
              title,
              url,
              publishedAt: publishedAt || undefined,
              source: source || undefined,
            };
          })
          .filter((item): item is EvidenceItem => item !== null);

        if (parsed.length > 0) return parsed;
      }

      return [];
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      cache: 'no-store',
      body: JSON.stringify({
        query,
        topK: 6,
        freshness: 'latest',
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) return [];

    const data = await response.json() as {
      items?: Array<Record<string, unknown>>;
      results?: Array<Record<string, unknown>>;
      data?: Array<Record<string, unknown>>;
    };

    const rawItems = data.items || data.results || data.data || [];
    return rawItems
      .map((item): EvidenceItem | null => {
        const title = String(item.title || item.name || '').trim();
        const url = String(item.url || item.link || '').trim();
        const publishedAt = String(item.publishedAt || item.date || item.published_at || '').trim();
        const source = String(item.source || item.site || item.publisher || '').trim();
        if (!title || !url) return null;
        return {
          title,
          url,
          publishedAt: publishedAt || undefined,
          source: source || undefined,
        };
      })
      .filter((item): item is EvidenceItem => item !== null);
  } catch {
    return [];
  }
}

export async function POST(req: Request) {
  let isZh = false;
  const l = (zhText: string, enText: string) => (isZh ? zhText : enText);
  try {
    const zhipuOpenai = new OpenAI({
      apiKey: process.env.ZHIPU_API_KEY || '',
      baseURL: 'https://open.bigmodel.cn/api/paas/v4/',
    });

    const moonshotOpenai = new OpenAI({
      apiKey: process.env.MOONSHOT_API_KEY || '',
      baseURL: 'https://api.moonshot.cn/v1',
    });

    const deepseekOpenai = new OpenAI({
      apiKey: process.env.DEEPSEEK_API_KEY || '',
      baseURL: 'https://api.deepseek.com',
    });

    const mimoOpenai = createMimoClient();

    const doubaoOpenai = new OpenAI({
      apiKey: process.env.DOUBAO_API_KEY || process.env.ARK_API_KEY || '',
      baseURL: 'https://ark.cn-beijing.volces.com/api/v3',
    });

    const dashscopeOpenai = new OpenAI({
      apiKey: process.env.DASHSCOPE_API_KEY || '',
      baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    });

    const { prompt, content, model, images, wordCount, writingStyle, eduLevel, perfLevel, addTypos, humanTrace, enableEvidenceSupport, diagramMode, enableSignatureDate, authorName, documentDate, locale, documentType } = await req.json();

    const hasImages = images && images.length > 0;
    const isPaperMode = documentType === 'paper';
    isZh = locale === 'zh';

    // Determine the provider and model
    const requestedModel = typeof model === 'string' ? model.trim() : '';
    const hasDeepseekKey = Boolean(process.env.DEEPSEEK_API_KEY?.trim());
    const hasMimoKey = getMimoKeyEntries().length > 0;
    const defaultTextModel = hasDeepseekKey ? 'deepseek-v4-flash' : 'glm-4.7';
    const effectiveModel = requestedModel || defaultTextModel;
    const mimoSupportsVision = effectiveModel === 'mimo-v2.5' || effectiveModel === 'mimo-v2-omni';
    let client = hasDeepseekKey ? deepseekOpenai : zhipuOpenai;
    let selectedModel = effectiveModel;

    if (effectiveModel.startsWith('moonshot-v1-') || effectiveModel.startsWith('kimi-')) {
      client = moonshotOpenai;
      if (!hasImages) {
        selectedModel = effectiveModel;
      } else if (
        effectiveModel === 'kimi-k2.6' ||
        effectiveModel === 'kimi-k2.5' ||
        effectiveModel.endsWith('-vision-preview')
      ) {
        selectedModel = effectiveModel;
      } else if (effectiveModel === 'moonshot-v1-8k' || effectiveModel === 'moonshot-v1-32k' || effectiveModel === 'moonshot-v1-128k') {
        selectedModel = effectiveModel.replace(/^moonshot-v1-(8k|32k|128k)$/i, 'moonshot-v1-$1-vision-preview');
      } else {
        selectedModel = 'kimi-k2.6';
      }
    } else if (
      effectiveModel === 'deepseek-v4-flash' ||
      effectiveModel === 'deepseek-v4-pro' ||
      effectiveModel === 'deepseek-chat' ||
      effectiveModel === 'deepseek-reasoner'
    ) {
      if (!hasDeepseekKey) {
        client = zhipuOpenai;
        if (hasImages) {
          selectedModel = 'glm-5v-turbo';
        } else {
          selectedModel = 'glm-4.7';
        }
      } else {
        client = deepseekOpenai;
        if (hasImages) {
          client = zhipuOpenai;
          selectedModel = 'glm-5v-turbo';
        } else if (effectiveModel === 'deepseek-chat' || effectiveModel === 'deepseek-reasoner') {
          selectedModel = 'deepseek-v4-flash';
        } else {
          selectedModel = effectiveModel;
        }
      }
    } else if (effectiveModel.startsWith('mimo-')) {
      if (!hasMimoKey) {
        client = zhipuOpenai;
        if (hasImages) {
          selectedModel = 'glm-5v-turbo';
        } else {
          selectedModel = 'glm-4.7';
        }
      } else {
        client = mimoOpenai;
        if (hasImages && !mimoSupportsVision) {
          client = zhipuOpenai;
          selectedModel = 'glm-5v-turbo';
        } else {
          selectedModel = effectiveModel;
        }
      }
    } else if (effectiveModel === 'doubao-seed-1-6-flash-250828' || effectiveModel?.startsWith('ep-')) {
      // All Volcengine (Doubao) endpoints start with 'ep-'
      client = doubaoOpenai;
      selectedModel = effectiveModel; // Use the specific endpoint ID provided
    } else if (effectiveModel === 'qwen3.5-flash') {
      client = dashscopeOpenai;
      if (hasImages) {
        client = zhipuOpenai;
        selectedModel = 'glm-5v-turbo';
      } else {
        selectedModel = 'qwen3.5-flash';
      }
    } else {
      client = zhipuOpenai;
      if (hasImages) {
        selectedModel = 'glm-5v-turbo'; // Zhipu multi-modal model
      } else {
        selectedModel = effectiveModel || 'glm-4.7';
      }
    }

    const mimoTemperatureDefault = selectedModel.includes('-tts')
      ? 0.6
      : selectedModel.endsWith('-flash')
        ? 0.3
        : 1.0;
    const mimoTemperatureValue = mimoTemperatureDefault;
    const mimoTopPValue = 0.95;

    const selectedDiagramMode = diagramMode === 'mindmap' || diagramMode === 'flowchart' ? diagramMode : 'none';

    const paperSystemMessage = isZh
      ? `你是一个专业的学术论文写作专家，专注于生成高质量的中文学术论文正文内容。
你需要根据用户提供的论文主题、摘要和关键词，生成一份结构完整的学术论文正文。
请直接输出Markdown格式的论文正文，不需要额外的寒暄或解释。

【论文结构要求】：必须严格按照以下学术论文结构生成，每章使用一级标题(#)：
1 引言（研究背景、研究意义、研究目的和论文结构概述）
2 相关工作（国内外研究现状、已有方法的优缺点分析）
3 研究方法（提出的理论/算法/模型的详细描述）
4 实验与分析（实验设置、实验结果、对比分析、讨论）
5 结论与展望（总结贡献、指出不足、展望未来方向）

【格式要求】：
1. 每个一级标题使用 # 格式，如：# 1 引言
2. 二级标题使用 ## 格式，如：## 1.1 研究背景
3. 三级标题使用 ### 格式
4. 正文段落之间保持适当间隔
5. 涉及数据、公式时，使用规范的学术表达
6. 图表应有编号和标题，如"图1-1 系统架构图"、"表1-1 实验参数"
7. 引用文献时使用[1]、[2]等编号格式

【语言要求】：
- 使用正式、严谨的学术语言
- 避免口语化表达
- 使用专业术语，必要时给出解释
- 逻辑严密，论证充分
- 文末的参考文献部分不需要生成（将由系统单独处理）

【表情最高指令】：绝对不要使用任何表情符号（Emoji）！`
      : `You are a professional academic paper writer.
Generate a well-structured academic paper body based on the user's topic, abstract, and keywords.
Output Markdown directly with no extra small talk.

Structure requirements:
1 Introduction (background, significance, objectives, paper overview)
2 Related Work (domestic and international research status)
3 Methodology (detailed description of proposed theory/algorithm/model)
4 Experiments and Analysis (experimental setup, results, comparison, discussion)
5 Conclusion and Outlook (summary of contributions, limitations, future directions)

Format rules:
- Use # for chapter headings (e.g., # 1 Introduction)
- Use ## for section headings (e.g., ## 1.1 Background)
- Use ### for subsection headings
- Figures and tables should have numbered captions (e.g., Figure 1-1, Table 1-1)
- Use [1], [2] for citation references
- Use formal, rigorous academic language
- No emojis or decorative symbols.`;

    const formatInstruction = selectedDiagramMode === 'none'
      ? l(
        '【格式最高指令】：**绝对不要**使用 ```markdown、```html 和 ``` 等代码块语法来包裹你的回答！请直接输出纯文本的正文内容！**绝对不要**在开头输出"html"或"markdown"等字眼！',
        'FORMAT RULE: Do not wrap the answer in ```markdown / ```html or any other code fence. Output Markdown directly and do not start with "html" or "markdown".'
      )
      : l(
        '【格式最高指令】：禁止使用 ```markdown、```html 等普通代码块；仅允许在图示位置使用一个 ```mermaid ... ``` 代码块来输出图示，其他正文必须是正常 Markdown 文本，且绝对不要在开头输出"html"或"markdown"等字眼！',
        'FORMAT RULE: Do not use ```markdown / ```html code fences. Only one ```mermaid ... ``` block is allowed for the diagram; the rest must be normal Markdown text.'
      );

    const systemMessage = isPaperMode
      ? paperSystemMessage
      : (isZh
      ? `你是一个专业的文档排版美化与编写专家。
你需要根据用户的要求和提供的原始内容（如果有的话），生成一份高质量的文档。
请直接输出Markdown格式的文档内容，不需要额外的寒暄或解释。
【排版最高指令】：必须严格遵循中文标准公文/报告的排版规范：
1. 文档大标题必须居中（使用 <div align="center"><h1>标题</h1></div> 语法）。
2. 正文段落开头必须空两格（首行缩进，可以使用全角空格"　　"）。
3. 层级分明：合理使用二级标题(##)、三级标题(###)和有序/无序列表，不要全部挤成一团。
4. 重点内容使用加粗（**文字**）标出。
${formatInstruction}
【表情最高指令】：绝对、永远不要在生成的文档或任何回答中使用任何表情符号（Emoji）和任何特殊图标！生成的文本必须是纯粹的汉字、标点和标准字符！一旦发现使用表情符号将导致系统崩溃。`
      : `You are a professional document writer and formatter.
Generate a high-quality document based on the user's requirements and the provided source content (if any).
Output Markdown content directly with no extra small talk.
Layout rules:
1. The main title must be centered using <div align="center"><h1>Title</h1></div>.
2. Use clear structure with headings (##, ###), lists, and paragraphs.
3. Highlight key points with bold text.
${formatInstruction}
No-emoji rule: Never use emojis or decorative symbols anywhere in the output.`);

    let textPrompt = l(`要求：${prompt}`, `Requirements: ${prompt}`);
    if (content) {
      textPrompt += l(`\n\n原始内容：\n${content}`, `\n\nSource content:\n${content}`);
    }

    const latestEvidence = enableEvidenceSupport
      ? await fetchLatestEvidenceFromMcp(`${prompt}\n${content || ''}`.trim())
      : [];

    if (latestEvidence.length > 0) {
      const evidenceBlock = latestEvidence
        .slice(0, 6)
        .map((item, index) => {
          const meta = [item.source, item.publishedAt].filter(Boolean).join(isZh ? '，' : ', ');
          return isZh
            ? `- [E${index + 1}] ${item.title}${meta ? `（${meta}）` : ''}：${item.url}`
            : `- [E${index + 1}] ${item.title}${meta ? ` (${meta})` : ''}: ${item.url}`;
        })
        .join('\n');
      textPrompt += l(`\n\n【MCP最新资料检索结果】：\n${evidenceBlock}`, `\n\nLatest evidence from search:\n${evidenceBlock}`);
    }

    // Process advanced constraints
    const constraints = [];
    if (wordCount) {
      constraints.push(l(`字数要求：大约 ${wordCount} 字左右`, `Target length: about ${wordCount} words.`));
    }
    if (writingStyle) {
      constraints.push(l(`文笔风格：${writingStyle}`, `Writing style: ${writingStyle}.`));
    }
    if (eduLevel) {
      const levelDesc = perfLevel ? `${perfLevel}的${eduLevel}` : eduLevel;
      constraints.push(l(
        `角色设定/写作水平：你需要模拟【${levelDesc}】的写作水平、思维深度和行文口吻来进行编写`,
        `Audience and proficiency: write in the style of "${eduLevel}" with a "${perfLevel || 'default'}" level.`
      ));
    }
    if (addTypos) {
      constraints.push(l(
        `错别字要求：必须在生成的正文中随机包含1到5个"同音错别字"或"形近错别字"（模拟人们使用拼音输入法时打错字的情况，不要出现读音完全不相关的离谱错字，要错得自然一些）。`,
        'Typos: introduce 1 to 5 minor natural typos across the body to mimic human writing.'
      ));
    }
    if (humanTrace) {
      constraints.push(l(
        '真人思考痕迹要求：写作语气要呈现自然推敲过程，适度出现"先……再……""换个角度看""更稳妥的是"等人类思考连接句；段落间允许少量自我修正与权衡表达，但保持逻辑清晰、结论明确。',
        'Human-like trace: include mild self-corrections and reasoning transitions while keeping logic clear.'
      ));
      constraints.push(l(
        '真人写作风格要求：避免机械重复句式，适当混用长短句与口语化过渡；绝对不要出现"作为AI""模型认为"等机器身份表述。',
        'Human writing style: avoid repetitive patterns; do not mention "as an AI" or any model identity.'
      ));
    }
    if (selectedDiagramMode === 'mindmap') {
      constraints.push(l(
        '图示要求：请在正文中部最适合的位置插入1个 Mermaid 思维导图代码块，使用 ```mermaid 开始并以 ``` 结束。',
        'Diagram: insert one Mermaid mind map block in the most suitable position in the middle of the document using ```mermaid ... ```.'
      ));
      constraints.push(l(
        '思维导图语法要求：必须使用 mindmap 语法，并用缩进表达层级关系（建议每层缩进2个空格）。示例：\n' +
          'mindmap\n' +
          '  root((主题))\n' +
          '    分支1\n' +
          '      要点A\n' +
          '    分支2\n' +
          '      要点B',
        'Mind map syntax: use mindmap and express hierarchy with indentation (recommend 2 spaces per level). Example:\n' +
          'mindmap\n' +
          '  root((Topic))\n' +
          '    Branch 1\n' +
          '      Point A\n' +
          '    Branch 2\n' +
          '      Point B'
      ));
      constraints.push(l(
        '图示位置要求：图示前后各保留一段解释文字，不要把图示放在文末"参考资料"之后。',
        'Placement: keep explanatory paragraphs before and after the diagram; do not place it after references.'
      ));
      constraints.push(l(
        '图示兼容要求：图中节点文本禁止使用形如 [1] 的纯数字方括号，避免与引用编号冲突。',
        'Compatibility: do not use bracketed numeric tokens like [1] inside diagram nodes.'
      ));
    }
    if (selectedDiagramMode === 'flowchart') {
      constraints.push(l(
        '图示要求：请在正文中部最适合的位置插入1个 Mermaid 流程图代码块，使用 ```mermaid 开始并以 ``` 结束。',
        'Diagram: insert one Mermaid flowchart block in the most suitable position in the middle of the document using ```mermaid ... ```.'
      ));
      constraints.push(l(
        '流程图语法要求：必须使用 flowchart TD 语法，至少包含6个节点与5条连接线，清晰体现步骤先后关系。',
        'Flowchart syntax: use flowchart TD with at least 6 nodes and 5 edges showing step order clearly.'
      ));
      constraints.push(l(
        '图示位置要求：图示前后各保留一段解释文字，不要把图示放在文末"参考资料"之后。',
        'Placement: keep explanatory paragraphs before and after the diagram; do not place it after references.'
      ));
      constraints.push(l(
        '图示兼容要求：图中节点文本禁止使用形如 [1] 的纯数字方括号，避免与引用编号冲突。',
        'Compatibility: do not use bracketed numeric tokens like [1] inside diagram nodes.'
      ));
    }
    if (enableEvidenceSupport) {
      constraints.push(l(
        '数据与案例支撑要求：文中涉及关键结论、数据或案例时，必须在对应句子后插入来源标注，使用 [1]、[2] 这类编号引用。',
        'Evidence: when stating key claims, numbers, or cases, add citations using [1], [2], ...'
      ));
      constraints.push(l(
        '引用来源要求：优先引用可公开检索的统计公报、政府/机构官网、学术论文或权威媒体深度文章；引用信息应包含标题与可访问链接（URL）。',
        'Sources: prefer official reports, academic papers, and reputable publications; each citation must include a title and a reachable URL.'
      ));
      constraints.push(l(
        '文末参考资料要求：新增"## 参考资料"小节，按编号列出每条来源（格式建议：`[1] 标题 - 机构/作者，年份，URL`），并与正文编号一一对应。',
        'References: add a "## References" section at the end listing each source with matching numbering and URL.'
      ));
      constraints.push(l(
        '引用编号连续性要求：正文引用编号必须从 [1] 开始，按首次出现顺序连续递增；禁止跳号、重号、倒序与越号。',
        'Numbering: citations must start from [1] and increase sequentially in first-appearance order (no gaps or duplicates).'
      ));
      constraints.push(l(
        '示例链接禁用要求：严禁使用 example.com、test.com、your-site.com、localhost 等示例或占位链接；若无法提供真实可访问链接，必须删除该来源条目。',
        'No placeholders: do not use example.com/test.com/localhost or any placeholder URLs; remove the source if a real URL is unavailable.'
      ));
      constraints.push(l(
        '真实性要求：禁止编造不存在的来源；若某处缺乏可靠依据，宁可不写具体数字，也不要虚构引用。',
        'No fabrication: do not invent sources; omit uncertain specifics instead of fabricating citations.'
      ));
      if (latestEvidence.length > 0) {
        constraints.push(l(
          '外部资料使用要求：优先从"MCP最新资料检索结果"中选取来源；列表中的 [E1]...[E6] 仅是候选标识，正文与参考资料必须改用 [1]...[N] 连续编号，不得直接使用 E 编号。',
          'Use evidence: prefer sources from "Latest evidence from search". Replace [E1].. markers with [1].. numbering in the document.'
        ));
      }
    }

    if (enableSignatureDate !== false) {
      const finalAuthor = authorName?.trim() || (isZh ? 'XXX' : 'Your Name');
      let finalDate = documentDate?.trim();
      if (!finalDate) {
        const today = new Date();
        finalDate = isZh
          ? `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日`
          : `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      }
      constraints.push(l(
        `署名与落款要求：文章结尾必须按以下格式输出署名块，且只出现一次：<div align="right"><p class="signature-line">${finalAuthor}</p><p class="signature-line">${finalDate}</p></div>`,
        `Signature: at the end, output exactly one signature block: <div align="right"><p class="signature-line">${finalAuthor}</p><p class="signature-line">${finalDate}</p></div>`
      ));
    } else {
      constraints.push(l(
        '署名与落款禁用：全文不得出现署名、作者名、报告者姓名与落款日期等结尾信息。',
        'No signature: do not include author name or date blocks in the output.'
      ));
      constraints.push(l(
        '时间信息要求：若必须提及时间，只能引用用户提供材料中可核对的时间信息，禁止臆造具体日期或时间。',
        'Time references: only use dates/times explicitly provided by the user; do not invent specific dates.'
      ));
    }

    if (constraints.length > 0) {
      textPrompt += `\n\n【具体约束条件】：\n- ` + constraints.join('\n- ');
    }

    if (hasImages) {
      textPrompt += l(
        `\n\n【图片插入指令】：用户上传了 ${images.length} 张图片，你需要分析这些图片的内容，并将它们插入到文档的合适位置。
插入图片时，必须使用指定的图片ID作为图片链接（URL），语法为：![图片描述](图片ID)
例如：![会议照片](${images[0].id})
请从以下图片中进行选择：\n`,
        `\n\nImage instructions: the user uploaded ${images.length} image(s). Analyze them and insert them in suitable places.
You must reference images by their ID using Markdown: ![alt text](IMAGE_ID)
Example: ![Example image](${images[0].id})
Available image IDs:\n`
      );
      images.forEach((img: { id: string, base64: string }, idx: number) => {
        textPrompt += l(`- 图片 ${idx + 1} 的ID为：${img.id}\n`, `- Image ${idx + 1} ID: ${img.id}\n`);
      });
      textPrompt += l(
        `\n注意：
1. 只能使用上述提供的图片ID，绝对不能编造其他图片或使用外部链接。
2. 绝对不要在文档中使用任何表情符号（Emoji）和图标。`,
        `\nNotes:
1. Only use the provided image IDs. Do not invent images or use external URLs.
2. Never use emojis or decorative symbols.`
      );
    } else {
      textPrompt += l(
        `\n\n【重要指令】：绝对不能在文档中使用任何表情符号（Emoji）和图标。`,
        `\n\nImportant: Never use emojis or decorative symbols in the document.`
      );
    }

    const userContent: Record<string, unknown>[] = [
      { type: 'text', text: textPrompt }
    ];

    // Save images to Redis for MiMo URL-based input
    if (hasImages && client === mimoOpenai) {
      const origin = new URL(req.url).origin;
      for (const img of images as { id: string; base64: string }[]) {
        await saveImage(img.id, img.base64);
        const imageUrl = `${origin}/api/images/${img.id}`;
        userContent.push({
          type: 'image_url',
          image_url: { url: imageUrl }
        });
      }
    }

    if (hasImages && client !== mimoOpenai) {
      images.forEach((img: { id: string, base64: string }) => {
        // Only add image_url if not using moonshot multi-modal (they use different handling)
        if (client === zhipuOpenai || client === doubaoOpenai) {
          userContent.push({
            type: 'image_url',
            image_url: { url: img.base64 }
          });
        }
      });
    }

    // Moonshot handles images by uploading them first or using base64.
    // Wait, Kimi currently has issues with base64 images as shown by your logs (unsupported image url).
    // Let's pass it anyway for Zhipu, but for Moonshot we need to remove the base64 or pass it as standard content.
    // Actually, Moonshot's vision model currently doesn't support direct base64 `image_url` in the same format as OpenAI/Zhipu without correct prefix.
    // Let's ensure the base64 string has the correct data URI prefix if it's not present.
    if (hasImages && client === moonshotOpenai) {
        images.forEach((img: { id: string, base64: string }) => {
            // Moonshot's vision model only supports a few formats and strict base64 encoding.
            // Ensure proper format mapping
            userContent.push({
              type: 'image_url',
              image_url: { url: img.base64 }
            });
        });
    }

    const completionMessages: OpenAI.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemMessage },
      { role: 'user', content: userContent as unknown as OpenAI.ChatCompletionContentPart[] },
    ];

    const completionRequest: OpenAI.ChatCompletionCreateParamsStreaming = {
      model: selectedModel,
      messages: completionMessages,
      stream: true,
      ...(client === mimoOpenai
        ? {
          temperature: mimoTemperatureValue,
          top_p: mimoTopPValue,
        }
        : {
          temperature: selectedModel === 'kimi-k2.5' || selectedModel === 'kimi-k2.6' ? 1 : (enableEvidenceSupport ? 0.4 : 0.7),
        }),
    };

    const completion = await client.chat.completions.create(
      completionRequest,
      {
        timeout: 1000 * 60 * 5, // 5 mins timeout for large models
      }
    );

    // We will stream the raw markdown text to the client so they can see the progress.
    // The client will handle downloading it as DOCX later if they want to.

    // Create a ReadableStream from the OpenAI stream
    const stream = new ReadableStream({
      async start(controller) {
        let hasOutput = false;
        const citationNormalizer = enableEvidenceSupport ? createStreamingCitationNormalizer() : null;
        try {
          for await (const chunk of completion) {
            const content = chunk.choices[0]?.delta?.content || '';
            if (content) {
              hasOutput = true;
              const output = citationNormalizer ? citationNormalizer.push(content) : content;
              if (output) {
                controller.enqueue(new TextEncoder().encode(output));
              }
            }
          }
          if (citationNormalizer) {
            const tailOutput = citationNormalizer.flush();
            if (tailOutput) {
              controller.enqueue(new TextEncoder().encode(tailOutput));
            }
          }
        } catch (streamError) {
          console.error('Stream Error:', streamError);
          if (!hasOutput) {
            controller.enqueue(new TextEncoder().encode(l('生成过程中出现网络波动，请重试。', 'A network error occurred during generation. Please retry.')));
          }
        } finally {
          controller.close();
        }
      }
    });

    // Note: AI providers like Kimi/Zhipu often have high First Token Latency (TTFT)
    // due to long system prompts, complex constraints, or high load.
    // The stream is passed down immediately to the client.
    // Return the stream response with appropriate CORS and cache headers
    await trackAdminEvent({
      type: 'generate',
      status: 'success',
      model: selectedModel,
      hasImages,
      promptLength: String(prompt || '').length + String(content || '').length,
    });
    return new NextResponse(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Access-Control-Allow-Origin': '*',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (error) {
    console.error('API Error:', error);
    const err = error as Error;
    await trackAdminEvent({
      type: 'generate',
      status: 'error',
      errorMessage: err.message?.slice(0, 200) || l('生成失败', 'Request failed'),
    });

    let errorMsg = err.message || l('生成失败', 'Request failed');
    if (errorMsg.includes('Failed to fetch') || errorMsg.includes('NetworkError')) {
      errorMsg = l(
        '网络连接异常，请检查您的网络设置（若使用移动网络，请尝试切换至 WiFi 或关闭代理）。',
        'Network error. Please check your connection and try again.'
      );
    } else if (errorMsg.includes('timeout') || errorMsg.includes('Timeout')) {
      errorMsg = l(
        'AI 思考时间过长，响应超时，请尝试精简要求或稍后再试。',
        'The request timed out. Please simplify the prompt and try again.'
      );
    } else if (errorMsg.includes('ReadableStream not supported')) {
      errorMsg = l(
        '您的浏览器版本过低，不支持流式生成，请升级浏览器。',
        'Your browser does not support streaming responses. Please upgrade your browser.'
      );
    } else if (errorMsg.includes('balance') || errorMsg.includes('insufficient_quota') || errorMsg.includes('arrears') || errorMsg.includes('1004')) {
      errorMsg = l('服务额度不足，请稍后再试。', 'Service quota exceeded. Please try again later.');
    } else if (errorMsg.includes('rate_limit') || errorMsg.includes('429')) {
      errorMsg = l('当前访问人数过多，请稍后重试。', 'Too many requests. Please try again later.');
    } else if (errorMsg.includes('401') || errorMsg.includes('Invalid Authentication') || errorMsg.includes('invalid_api_key') || errorMsg.includes('unauthorized')) {
      errorMsg = l('API 密钥无效或未配置 (401 Unauthorized)。', 'API key is invalid or missing (401 Unauthorized).');
    }

    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
