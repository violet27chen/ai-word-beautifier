import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  AlignmentType,
  HeadingLevel,
  BorderStyle,
  WidthType,
  PageNumber,
  Footer,
  Header,
  PageBreak,
  SectionType,
  TableOfContents,
  LevelFormat,
  convertInchesToTwip,
  IRunOptions,
  IParagraphOptions,
  ISectionOptions,
  ITableCellOptions,
  ShadingType,
} from 'docx';

// ─── Measurement Constants ───────────────────────────────────────────────────
// Font sizes (in half-points, as required by docx)
const FONT_HA = {
  xiaoEr: 36,    // 小二 18pt
  sanHao: 32,    // 三号 16pt
  xiaoSan: 30,   // 小三 15pt
  siHao: 28,     // 四号 14pt
  xiaoSi: 24,    // 小四 12pt
  wuHao: 21,     // 五号 10.5pt
  xiaoWu: 18,    // 小五 9pt
} as const;

// Margins (in twips: 1 inch = 1440 twips, 1 cm ≈ 567 twips)
const PAGE_MARGIN = {
  top: convertInchesToTwip(1),    // 2.54cm
  bottom: convertInchesToTwip(1), // 2.54cm
  left: convertInchesToTwip(1.25),   // 3.17cm
  right: convertInchesToTwip(1.25),  // 3.17cm
};

// Line spacing
const LINE_SPACING = {
  single: 240,
  half: 360,  // 1.5倍行距
  double: 480,
};

// First-line indent (2 Chinese characters at 12pt ≈ 480 twips)
const FIRST_LINE_INDENT = 480;

// ─── Font Names ──────────────────────────────────────────────────────────────
const FONT_CN_HEITI = '黑体';
const FONT_CN_SONGTI = '宋体';
const FONT_EN_TNR = 'Times New Roman';

// ─── Interfaces ──────────────────────────────────────────────────────────────
export interface PaperConfig {
  title: string;
  subtitle?: string;
  author: string;
  studentId?: string;
  major?: string;
  advisor?: string;
  institution?: string;
  date?: string;
  abstractCn: string;
  abstractEn: string;
  keywordsCn: string[];
  keywordsEn: string[];
  content: string; // markdown格式的正文
  references?: string[]; // 参考文献列表
  templateType?: 'bachelor' | 'master' | 'journal'; // 论文类型
}

// ─── Helper: Create TextRun with consistent defaults ─────────────────────────
function makeRun(
  text: string,
  options: Partial<IRunOptions> & { fontCn?: string; fontEn?: string } = {}
): TextRun {
  const { fontCn, fontEn, font, ...rest } = options;
  const resolvedFont: string = typeof font === 'string' ? font : (fontCn || FONT_CN_SONGTI);
  return new TextRun({
    text,
    font: {
      name: fontEn || FONT_EN_TNR,
      eastAsia: resolvedFont,
    },
    ...rest,
  });
}

// ─── Helper: Create a paragraph with standard settings ───────────────────────
function makePara(
  children: (TextRun | string)[],
  options: Partial<IParagraphOptions> = {}
): Paragraph {
  const runs = children.map((c) =>
    typeof c === 'string' ? makeRun(c) : c
  );
  return new Paragraph({
    children: runs,
    spacing: { line: LINE_SPACING.half },
    ...options,
  });
}

// ─── Helper: Centered heading paragraph ──────────────────────────────────────
function centeredHeading(
  text: string,
  fontSize: number,
  bold = true,
  fontCn = FONT_CN_HEITI
): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 240, after: 240, line: LINE_SPACING.half },
    children: [
      makeRun(text, {
        bold,
        size: fontSize,
        fontCn,
        fontEn: FONT_EN_TNR,
      }),
    ],
  });
}

// ─── Helper: Empty line ──────────────────────────────────────────────────────
function emptyLine(): Paragraph {
  return new Paragraph({
    spacing: { line: LINE_SPACING.single },
    children: [],
  });
}

// ─── Helper: Page break ──────────────────────────────────────────────────────
function pageBreakPara(): Paragraph {
  return new Paragraph({
    children: [new PageBreak()],
  });
}

// ─── Helper: Info row for cover page (borderless table) ──────────────────────
function coverInfoRow(label: string, value: string): TableRow {
  const cellOpts: Partial<ITableCellOptions> = {
    borders: {
      top: { style: BorderStyle.NONE, size: 0 },
      bottom: { style: BorderStyle.NONE, size: 0 },
      left: { style: BorderStyle.NONE, size: 0 },
      right: { style: BorderStyle.NONE, size: 0 },
    },
    width: { size: 50, type: WidthType.PERCENTAGE },
  };
  return new TableRow({
    children: [
      new TableCell({
        ...cellOpts,
        children: [
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            spacing: { line: LINE_SPACING.half },
            children: [
              makeRun(label, {
                bold: true,
                size: FONT_HA.xiaoSi,
                fontCn: FONT_CN_SONGTI,
              }),
            ],
          }),
        ],
      }),
      new TableCell({
        ...cellOpts,
        children: [
          new Paragraph({
            spacing: { line: LINE_SPACING.half },
            children: [
              makeRun(value, {
                size: FONT_HA.xiaoSi,
                fontCn: FONT_CN_SONGTI,
              }),
            ],
          }),
        ],
      }),
    ],
  });
}

// ─── Parse Markdown content into structured sections ─────────────────────────
interface ParsedSection {
  level: number; // 1 = #, 2 = ##, 3 = ###
  title: string;
  paragraphs: string[];
}

function parseMarkdownContent(markdown: string): ParsedSection[] {
  const sections: ParsedSection[] = [];
  const lines = markdown.split(/\r?\n/);
  let currentSection: ParsedSection | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Match headings: # Title, ## Title, ### Title
    const h1Match = trimmed.match(/^#\s+(.+)$/);
    const h2Match = trimmed.match(/^##\s+(.+)$/);
    const h3Match = trimmed.match(/^###\s+(.+)$/);

    if (h1Match) {
      if (currentSection) sections.push(currentSection);
      currentSection = { level: 1, title: h1Match[1].trim(), paragraphs: [] };
    } else if (h2Match) {
      if (currentSection) sections.push(currentSection);
      currentSection = { level: 2, title: h2Match[1].trim(), paragraphs: [] };
    } else if (h3Match) {
      if (currentSection) sections.push(currentSection);
      currentSection = { level: 3, title: h3Match[1].trim(), paragraphs: [] };
    } else if (currentSection) {
      currentSection.paragraphs.push(trimmed);
    } else {
      // Content before any heading - treat as intro
      if (!currentSection) {
        currentSection = { level: 0, title: '', paragraphs: [] };
      }
      currentSection.paragraphs.push(trimmed);
    }
  }

  if (currentSection) sections.push(currentSection);
  return sections;
}

// ─── Build body paragraphs from markdown ─────────────────────────────────────
function buildBodyParagraphs(markdown: string): Paragraph[] {
  const sections = parseMarkdownContent(markdown);
  const paragraphs: Paragraph[] = [];

  for (const section of sections) {
    // Add heading if present
    if (section.title) {
      if (section.level === 1) {
        // 一级标题：黑体三号(16pt)加粗，居中，段前段后各0.5行
        paragraphs.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 240, after: 240, line: LINE_SPACING.half },
            children: [
              makeRun(section.title, {
                bold: true,
                size: FONT_HA.sanHao,
                fontCn: FONT_CN_HEITI,
              }),
            ],
          })
        );
      } else if (section.level === 2) {
        // 二级标题：黑体四号(14pt)加粗，左对齐
        paragraphs.push(
          new Paragraph({
            alignment: AlignmentType.LEFT,
            spacing: { before: 200, after: 120, line: LINE_SPACING.half },
            children: [
              makeRun(section.title, {
                bold: true,
                size: FONT_HA.siHao,
                fontCn: FONT_CN_HEITI,
              }),
            ],
          })
        );
      } else if (section.level === 3) {
        // 三级标题：黑体小四(12pt)加粗，左对齐
        paragraphs.push(
          new Paragraph({
            alignment: AlignmentType.LEFT,
            spacing: { before: 160, after: 100, line: LINE_SPACING.half },
            children: [
              makeRun(section.title, {
                bold: true,
                size: FONT_HA.xiaoSi,
                fontCn: FONT_CN_HEITI,
              }),
            ],
          })
        );
      }
    }

    // Add body paragraphs
    for (const text of section.paragraphs) {
      // Skip markdown image placeholders like ![alt](url)
      const imgMatch = text.match(/^!\[.*?\]\(.*?\)$/);
      if (imgMatch) continue;

      // Process inline formatting: **bold**, *italic*, `code`
      const children: TextRun[] = [];
      // Simple inline parser
      const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);
      for (const part of parts) {
        if (!part) continue;
        const boldMatch = part.match(/^\*\*(.+)\*\*$/);
        const italicMatch = part.match(/^\*(.+)\*$/);
        const codeMatch = part.match(/^`(.+)`$/);

        if (boldMatch) {
          children.push(
            makeRun(boldMatch[1], {
              bold: true,
              size: FONT_HA.xiaoSi,
              fontCn: FONT_CN_SONGTI,
            })
          );
        } else if (italicMatch) {
          children.push(
            makeRun(italicMatch[1], {
              italics: true,
              size: FONT_HA.xiaoSi,
              fontCn: FONT_CN_SONGTI,
            })
          );
        } else if (codeMatch) {
          children.push(
            makeRun(codeMatch[1], {
              size: FONT_HA.xiaoSi,
              fontEn: 'Courier New',
              fontCn: FONT_CN_SONGTI,
            })
          );
        } else {
          children.push(
            makeRun(part, {
              size: FONT_HA.xiaoSi,
              fontCn: FONT_CN_SONGTI,
            })
          );
        }
      }

      if (children.length === 0) {
        children.push(
          makeRun(text, {
            size: FONT_HA.xiaoSi,
            fontCn: FONT_CN_SONGTI,
          })
        );
      }

      paragraphs.push(
        new Paragraph({
          indent: { firstLine: FIRST_LINE_INDENT },
          spacing: { line: LINE_SPACING.half },
          alignment: AlignmentType.JUSTIFIED,
          children,
        })
      );
    }
  }

  return paragraphs;
}

// ─── Build cover page section ────────────────────────────────────────────────
function buildCoverSection(config: PaperConfig): ISectionOptions {
  const children: (Paragraph | Table)[] = [];

  // Add several empty lines for vertical centering effect
  for (let i = 0; i < 4; i++) {
    children.push(emptyLine());
  }

  // Institution name (if provided)
  if (config.institution) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 400, line: LINE_SPACING.half },
        children: [
          makeRun(config.institution, {
            bold: true,
            size: FONT_HA.sanHao,
            fontCn: FONT_CN_HEITI,
          }),
        ],
      })
    );
  }

  // Paper type subtitle
  const typeLabel = config.templateType === 'master'
    ? '硕士学位论文'
    : config.templateType === 'journal'
    ? '学术论文'
    : '本科毕业论文（设计）';

  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200, line: LINE_SPACING.half },
      children: [
        makeRun(typeLabel, {
          bold: true,
          size: FONT_HA.sanHao,
          fontCn: FONT_CN_HEITI,
        }),
      ],
    })
  );

  // Empty line
  children.push(emptyLine());

  // Title: 黑体，小二号(18pt)，居中，加粗
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 120, line: LINE_SPACING.half },
      children: [
        makeRun(config.title, {
          bold: true,
          size: FONT_HA.xiaoEr,
          fontCn: FONT_CN_HEITI,
        }),
      ],
    })
  );

  // Subtitle (if provided)
  if (config.subtitle) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 200, line: LINE_SPACING.half },
        children: [
          makeRun(config.subtitle, {
            bold: true,
            size: FONT_HA.sanHao,
            fontCn: FONT_CN_HEITI,
          }),
        ],
      })
    );
  }

  // Empty lines
  for (let i = 0; i < 3; i++) {
    children.push(emptyLine());
  }

  // Info table (borderless)
  const infoRows: TableRow[] = [];
  if (config.studentId) {
    infoRows.push(coverInfoRow('学    号：', config.studentId));
  }
  infoRows.push(coverInfoRow('姓    名：', config.author));
  if (config.major) {
    infoRows.push(coverInfoRow('专    业：', config.major));
  }
  if (config.advisor) {
    infoRows.push(coverInfoRow('指导教师：', config.advisor));
  }
  if (config.date) {
    infoRows.push(coverInfoRow('完成日期：', config.date));
  }

  if (infoRows.length > 0) {
    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: infoRows,
      })
    );
  }

  // Empty lines at bottom
  for (let i = 0; i < 3; i++) {
    children.push(emptyLine());
  }

  return {
    properties: {
      page: {
        margin: PAGE_MARGIN,
      },
    },
    children: children as Paragraph[],
  };
}

// ─── Build Chinese abstract section ──────────────────────────────────────────
function buildAbstractCnSection(config: PaperConfig): Paragraph[] {
  const children: Paragraph[] = [];

  // "摘 要" centered, 黑体三号加粗
  children.push(centeredHeading('摘  要', FONT_HA.sanHao));

  // Abstract body
  children.push(
    makePara([config.abstractCn], {
      indent: { firstLine: FIRST_LINE_INDENT },
      spacing: { line: LINE_SPACING.half },
      alignment: AlignmentType.JUSTIFIED,
      children: [
        makeRun(config.abstractCn, {
          size: FONT_HA.xiaoSi,
          fontCn: FONT_CN_SONGTI,
        }),
      ],
    })
  );

  // Keywords
  const keywordRuns: TextRun[] = [
    makeRun('关键词：', {
      bold: true,
      size: FONT_HA.xiaoSi,
      fontCn: FONT_CN_SONGTI,
    }),
  ];
  keywordRuns.push(
    makeRun(config.keywordsCn.join('；'), {
      size: FONT_HA.xiaoSi,
      fontCn: FONT_CN_SONGTI,
    })
  );

  children.push(
    new Paragraph({
      indent: { firstLine: FIRST_LINE_INDENT },
      spacing: { before: 200, line: LINE_SPACING.half },
      children: keywordRuns,
    })
  );

  return children;
}

// ─── Build English abstract section ──────────────────────────────────────────
function buildAbstractEnSection(config: PaperConfig): Paragraph[] {
  const children: Paragraph[] = [];

  // "Abstract" centered, Times New Roman 16pt Bold
  children.push(centeredHeading('Abstract', FONT_HA.sanHao, true, FONT_EN_TNR));

  // Abstract body
  children.push(
    new Paragraph({
      indent: { firstLine: FIRST_LINE_INDENT },
      spacing: { line: LINE_SPACING.half },
      alignment: AlignmentType.JUSTIFIED,
      children: [
        makeRun(config.abstractEn, {
          size: FONT_HA.xiaoSi,
          fontEn: FONT_EN_TNR,
          fontCn: FONT_EN_TNR,
        }),
      ],
    })
  );

  // Keywords
  const keywordRuns: TextRun[] = [
    makeRun('Keywords: ', {
      bold: true,
      size: FONT_HA.xiaoSi,
      fontEn: FONT_EN_TNR,
      fontCn: FONT_EN_TNR,
    }),
    makeRun(config.keywordsEn.join('; '), {
      size: FONT_HA.xiaoSi,
      fontEn: FONT_EN_TNR,
      fontCn: FONT_EN_TNR,
    }),
  ];

  children.push(
    new Paragraph({
      indent: { firstLine: FIRST_LINE_INDENT },
      spacing: { before: 200, line: LINE_SPACING.half },
      children: keywordRuns,
    })
  );

  return children;
}

// ─── Build TOC section ───────────────────────────────────────────────────────
function buildTocSection() {
  const children: (Paragraph | TableOfContents)[] = [];

  // "目 录" centered, 黑体三号加粗
  children.push(centeredHeading('目  录', FONT_HA.sanHao));

  // Table of Contents (TOC placeholder)
  children.push(
    new TableOfContents('目录', {
      hyperlink: true,
      headingStyleRange: '1-3',
    })
  );

  return children;
}

// ─── Build references section ────────────────────────────────────────────────
function buildReferencesSection(references: string[]): Paragraph[] {
  const children: Paragraph[] = [];

  // "参考文献" centered, 黑体三号加粗
  children.push(centeredHeading('参考文献', FONT_HA.sanHao));

  for (const ref of references) {
    // Each reference: 宋体五号(10.5pt)
    children.push(
      new Paragraph({
        spacing: { line: LINE_SPACING.half },
        children: [
          makeRun(ref, {
            size: FONT_HA.wuHao,
            fontCn: FONT_CN_SONGTI,
          }),
        ],
      })
    );
  }

  return children;
}

// ─── Main: Generate Paper Docx ───────────────────────────────────────────────
export async function generatePaperDocx(config: PaperConfig): Promise<Buffer> {
  // Build body paragraphs from markdown
  const bodyParagraphs = buildBodyParagraphs(config.content);

  // Build abstract sections
  const abstractCnParagraphs = buildAbstractCnSection(config);
  const abstractEnParagraphs = buildAbstractEnSection(config);

  // Build TOC
  const tocParagraphs = buildTocSection();

  // Build references
  const refParagraphs = config.references?.length
    ? buildReferencesSection(config.references)
    : [];

  // Build the document with multiple sections
  const doc = new Document({
    numbering: {
      config: [
        {
          reference: 'default-numbering',
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: '%1.',
              alignment: AlignmentType.START,
            },
          ],
        },
      ],
    },
    sections: [
      // Section 1: Cover page (no header/footer, no page numbers)
      buildCoverSection(config),

      // Section 2: Chinese abstract
      {
        properties: {
          page: {
            margin: PAGE_MARGIN,
          },
          type: SectionType.NEXT_PAGE,
        },
        children: abstractCnParagraphs,
      },

      // Section 3: English abstract
      {
        properties: {
          page: {
            margin: PAGE_MARGIN,
          },
          type: SectionType.NEXT_PAGE,
        },
        children: abstractEnParagraphs,
      },

      // Section 4: Table of Contents
      {
        properties: {
          page: {
            margin: PAGE_MARGIN,
          },
          type: SectionType.NEXT_PAGE,
        },
        children: tocParagraphs,
      },

      // Section 5: Main body (with header and footer/page numbers)
      {
        properties: {
          page: {
            margin: PAGE_MARGIN,
            pageNumbers: {
              start: 1,
            },
          },
          type: SectionType.NEXT_PAGE,
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  makeRun(config.title, {
                    size: FONT_HA.xiaoWu,
                    fontCn: FONT_CN_SONGTI,
                  }),
                ],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    children: [PageNumber.CURRENT],
                    font: {
                      name: FONT_EN_TNR,
                      eastAsia: FONT_CN_SONGTI,
                    },
                    size: FONT_HA.xiaoWu,
                  }),
                ],
              }),
            ],
          }),
        },
        children: bodyParagraphs,
      },

      // Section 6: References (if any)
      ...(refParagraphs.length > 0
        ? [
            {
              properties: {
                page: {
                  margin: PAGE_MARGIN,
                },
                type: SectionType.CONTINUOUS,
              },
              children: refParagraphs,
            },
          ]
        : []),
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  return Buffer.from(buffer);
}
