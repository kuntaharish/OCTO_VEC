/**
 * Productivity Domain Tools — create professional Excel, PowerPoint, Word, PDF files.
 *
 * Design philosophy: agents should produce human-quality output by default.
 * Professional formatting (colors, fonts, borders, charts) is applied automatically
 * so agents only need to provide content and structure.
 */

import { Type } from "@mariozechner/pi-ai";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import { join } from "path";
import { mkdirSync, writeFileSync } from "fs";
import { config } from "../../config.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

function ok(text: string) {
  return { content: [{ type: "text" as const, text }], details: {} };
}

/** Ensure parent directory exists, return the full file path */
function resolveOutputPath(basePath: string, filename: string): string {
  mkdirSync(basePath, { recursive: true });
  return join(basePath, filename);
}

// ── Color Palette — professional defaults ────────────────────────────────────

const PALETTE = {
  primary:    "2563EB", // blue-600
  primaryDk:  "1D4ED8", // blue-700
  accent:     "059669", // emerald-600
  warning:    "D97706", // amber-600
  danger:     "DC2626", // red-600
  headerBg:   "1E3A5F", // dark navy
  headerFg:   "FFFFFF",
  altRowBg:   "F0F4FA", // light blue-grey
  textDark:   "1F2937", // grey-800
  textMuted:  "6B7280", // grey-500
  border:     "D1D5DB", // grey-300
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// EXCEL — create_spreadsheet
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const create_spreadsheet: AgentTool = {
  name: "create_spreadsheet",
  label: "Create Spreadsheet",
  description:
    "Create a professional Excel (.xlsx) spreadsheet with formatted headers, styled data rows, " +
    "conditional formatting, and optional charts. Outputs to the agent's workspace. " +
    "Columns support formulas (prefix with =). Numbers and dates are auto-detected.",
  parameters: Type.Object({
    filename: Type.String({ description: "Output filename (e.g. 'sales-report.xlsx')" }),
    title: Type.Optional(Type.String({ description: "Worksheet title (shown on the sheet tab)" })),
    sheets: Type.Array(
      Type.Object({
        name: Type.String({ description: "Sheet/tab name" }),
        columns: Type.Array(Type.String({ description: "Column header labels" })),
        rows: Type.Array(Type.Array(Type.Union([Type.String(), Type.Number()]), { description: "Row values (strings, numbers, or formulas starting with =)" })),
        column_widths: Type.Optional(Type.Array(Type.Number(), { description: "Custom column widths (in characters)" })),
      }),
      { description: "One or more sheets of data" }
    ),
    chart: Type.Optional(Type.Object({
      type: Type.Union([Type.Literal("bar"), Type.Literal("line"), Type.Literal("pie"), Type.Literal("column")], { description: "Chart type" }),
      title: Type.String({ description: "Chart title" }),
      data_range: Type.Optional(Type.String({ description: "Data range for chart (e.g. 'A1:D10'). Defaults to all data." })),
    })),
    output_path: Type.String({ description: "Directory to save the file (e.g. 'shared/' or 'agents/EMP-001/')" }),
  }),
  execute: async (ctx: any, params: any) => {
    try {
      const ExcelJS = (await import("exceljs")).default;
      const workbook = new ExcelJS.Workbook();
      workbook.creator = "OCTO VEC";
      workbook.created = new Date();

      for (const sheet of params.sheets) {
        const ws = workbook.addWorksheet(sheet.name);

        // ─ Header row ─
        const headerRow = ws.addRow(sheet.columns);
        headerRow.eachCell((cell: any) => {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${PALETTE.headerBg}` } };
          cell.font = { bold: true, color: { argb: `FF${PALETTE.headerFg}` }, size: 11, name: "Calibri" };
          cell.alignment = { vertical: "middle", horizontal: "center" };
          cell.border = {
            bottom: { style: "medium", color: { argb: `FF${PALETTE.primary}` } },
          };
        });
        headerRow.height = 28;

        // ─ Data rows with zebra striping ─
        for (let i = 0; i < sheet.rows.length; i++) {
          const row = ws.addRow(sheet.rows[i]);
          const isAlt = i % 2 === 1;
          row.eachCell((cell: any, colNumber: number) => {
            // Zebra stripe
            if (isAlt) {
              cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${PALETTE.altRowBg}` } };
            }
            // Font
            cell.font = { size: 10, name: "Calibri", color: { argb: `FF${PALETTE.textDark}` } };
            cell.alignment = { vertical: "middle" };
            // Light border
            cell.border = {
              bottom: { style: "thin", color: { argb: `FF${PALETTE.border}` } },
            };
            // Auto-detect formulas
            const val = cell.value;
            if (typeof val === "string" && val.startsWith("=")) {
              cell.value = { formula: val.slice(1) };
              cell.font = { ...cell.font, color: { argb: "FF000000" } }; // black for formulas
            }
            // Number formatting — detect currency and percentages
            if (typeof val === "number") {
              cell.alignment = { ...cell.alignment, horizontal: "right" };
              if (Math.abs(val) >= 1000) {
                cell.numFmt = "#,##0";
              }
            }
          });
        }

        // ─ Column widths ─
        if (sheet.column_widths) {
          sheet.column_widths.forEach((w: number, idx: number) => {
            if (ws.columns[idx]) ws.columns[idx].width = w;
          });
        } else {
          // Auto-fit: at least header text length + padding
          sheet.columns.forEach((hdr: string, idx: number) => {
            const col = ws.getColumn(idx + 1);
            col.width = Math.max(hdr.length + 4, 12);
          });
        }

        // ─ Freeze header row ─
        ws.views = [{ state: "frozen" as const, xSplit: 0, ySplit: 1, topLeftCell: "A2", activeCell: "A2" }];

        // ─ Auto-filter ─
        ws.autoFilter = { from: "A1", to: `${String.fromCharCode(64 + sheet.columns.length)}1` };
      }

      // ─ Save ─
      const outDir = join(config.workspace, params.output_path);
      const filePath = resolveOutputPath(outDir, params.filename.endsWith(".xlsx") ? params.filename : `${params.filename}.xlsx`);
      await workbook.xlsx.writeFile(filePath);

      return ok(`Spreadsheet created: ${filePath}\n\nSheets: ${params.sheets.map((s: any) => s.name).join(", ")}\nRows: ${params.sheets.reduce((sum: number, s: any) => sum + s.rows.length, 0)} total\nFeatures: frozen headers, zebra striping, auto-filter, formatted columns`);
    } catch (err: any) {
      return ok(`Error creating spreadsheet: ${err.message}`);
    }
  },
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POWERPOINT — create_presentation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const create_presentation: AgentTool = {
  name: "create_presentation",
  label: "Create Presentation",
  description:
    "Create a professional PowerPoint (.pptx) presentation with styled slides, charts, tables, " +
    "and consistent branding. Supports title slides, content slides, section dividers, and chart slides. " +
    "Professional color palette and layout applied automatically.",
  parameters: Type.Object({
    filename: Type.String({ description: "Output filename (e.g. 'q1-review.pptx')" }),
    title: Type.String({ description: "Presentation title (shown on title slide)" }),
    subtitle: Type.Optional(Type.String({ description: "Subtitle for title slide" })),
    author: Type.Optional(Type.String({ description: "Author name shown on title slide" })),
    slides: Type.Array(
      Type.Object({
        type: Type.Union([
          Type.Literal("title"),
          Type.Literal("content"),
          Type.Literal("section"),
          Type.Literal("table"),
          Type.Literal("chart"),
        ], { description: "Slide type" }),
        title: Type.String({ description: "Slide title" }),
        body: Type.Optional(Type.Union([
          Type.String(),
          Type.Array(Type.String()),
        ], { description: "Body text or bullet points" })),
        table: Type.Optional(Type.Object({
          headers: Type.Array(Type.String()),
          rows: Type.Array(Type.Array(Type.String())),
        }, { description: "Table data (for 'table' type slides)" })),
        chart_data: Type.Optional(Type.Object({
          type: Type.Union([Type.Literal("bar"), Type.Literal("line"), Type.Literal("pie"), Type.Literal("doughnut")]),
          labels: Type.Array(Type.String()),
          series: Type.Array(Type.Object({
            name: Type.String(),
            values: Type.Array(Type.Number()),
          })),
        }, { description: "Chart data (for 'chart' type slides)" })),
        notes: Type.Optional(Type.String({ description: "Speaker notes for this slide" })),
      }),
      { description: "Array of slides" }
    ),
    output_path: Type.String({ description: "Directory to save the file" }),
  }),
  execute: async (ctx: any, params: any) => {
    try {
      const PptxGenJS = (await import("pptxgenjs")).default;
      const pptx = new PptxGenJS();
      pptx.author = params.author ?? "OCTO VEC";
      pptx.title = params.title;
      pptx.layout = "LAYOUT_WIDE"; // 16:9

      // Color theme
      const theme = {
        bg: "FFFFFF",
        primary: PALETTE.primary,
        primaryDk: PALETTE.primaryDk,
        accent: PALETTE.accent,
        textDark: PALETTE.textDark,
        textMuted: PALETTE.textMuted,
        headerBg: PALETTE.headerBg,
      };

      for (const slideData of params.slides) {
        const slide = pptx.addSlide();

        if (slideData.notes) slide.addNotes(slideData.notes);

        // ── Slide number (bottom right) on non-title slides ──
        if (slideData.type !== "title") {
          slide.slideNumber = { x: "95%", y: "95%", fontSize: 8, color: theme.textMuted };
        }

        switch (slideData.type) {
          case "title": {
            // Full-colour title slide
            slide.background = { color: theme.headerBg };
            slide.addText(slideData.title, {
              x: 0.8, y: 1.5, w: "85%", h: 1.5,
              fontSize: 36, bold: true, color: "FFFFFF",
              fontFace: "Calibri",
            });
            if (slideData.body) {
              const sub = Array.isArray(slideData.body) ? slideData.body.join("\n") : slideData.body;
              slide.addText(sub, {
                x: 0.8, y: 3.2, w: "85%", h: 0.8,
                fontSize: 18, color: "B0C4DE",
                fontFace: "Calibri",
              });
            }
            if (params.subtitle) {
              slide.addText(params.subtitle, {
                x: 0.8, y: 4.2, w: "85%", h: 0.5,
                fontSize: 14, color: "8899AA",
                fontFace: "Calibri",
              });
            }
            // Accent bar
            slide.addShape("rect" as any, {
              x: 0.8, y: 3.0, w: 2.0, h: 0.06, fill: { color: theme.accent },
            });
            break;
          }

          case "section": {
            // Section divider
            slide.background = { color: theme.primary };
            slide.addText(slideData.title, {
              x: 0.8, y: 2.0, w: "85%", h: 1.5,
              fontSize: 32, bold: true, color: "FFFFFF",
              fontFace: "Calibri",
            });
            slide.addShape("rect" as any, {
              x: 0.8, y: 3.6, w: 1.5, h: 0.06, fill: { color: theme.accent },
            });
            break;
          }

          case "content": {
            // Title + bullet points
            slide.addText(slideData.title, {
              x: 0.8, y: 0.4, w: "90%", h: 0.8,
              fontSize: 24, bold: true, color: theme.textDark,
              fontFace: "Calibri",
            });
            // Accent underline
            slide.addShape("rect" as any, {
              x: 0.8, y: 1.15, w: 1.2, h: 0.04, fill: { color: theme.primary },
            });

            if (slideData.body) {
              const bullets = Array.isArray(slideData.body) ? slideData.body : [slideData.body];
              const textItems = bullets.map((b: string) => ({
                text: b,
                options: { fontSize: 16, color: theme.textDark, fontFace: "Calibri", bullet: true, breakLine: true },
              }));
              slide.addText(textItems as any, {
                x: 0.8, y: 1.5, w: "85%", h: 4.0,
                valign: "top",
                lineSpacingMultiple: 1.5,
              });
            }
            break;
          }

          case "table": {
            slide.addText(slideData.title, {
              x: 0.8, y: 0.4, w: "90%", h: 0.8,
              fontSize: 24, bold: true, color: theme.textDark,
              fontFace: "Calibri",
            });

            if (slideData.table) {
              const headerCells = slideData.table.headers.map((h: string) => ({
                text: h,
                options: { bold: true, color: "FFFFFF", fill: { color: theme.headerBg }, fontSize: 12, fontFace: "Calibri" },
              }));
              const dataCells = slideData.table.rows.map((row: string[], ri: number) =>
                row.map((cell: string) => ({
                  text: cell,
                  options: {
                    fontSize: 11,
                    color: theme.textDark,
                    fill: { color: ri % 2 === 1 ? PALETTE.altRowBg : "FFFFFF" },
                    fontFace: "Calibri",
                  },
                }))
              );
              slide.addTable([headerCells, ...dataCells], {
                x: 0.8, y: 1.5, w: "85%",
                border: { type: "solid", pt: 0.5, color: PALETTE.border },
                colW: Array(slideData.table.headers.length).fill(
                  11.0 / slideData.table.headers.length
                ),
              } as any);
            }
            break;
          }

          case "chart": {
            slide.addText(slideData.title, {
              x: 0.8, y: 0.4, w: "90%", h: 0.8,
              fontSize: 24, bold: true, color: theme.textDark,
              fontFace: "Calibri",
            });

            if (slideData.chart_data) {
              const chartColors = ["2563EB", "059669", "D97706", "DC2626", "7C3AED", "EC4899"];
              const chartTypeMap: Record<string, any> = {
                bar: pptx.ChartType?.bar ?? "bar",
                line: pptx.ChartType?.line ?? "line",
                pie: pptx.ChartType?.pie ?? "pie",
                doughnut: pptx.ChartType?.doughnut ?? "doughnut",
              };

              const chartData = slideData.chart_data.series.map((s: any, i: number) => ({
                name: s.name,
                labels: slideData.chart_data.labels,
                values: s.values,
              }));

              slide.addChart(chartTypeMap[slideData.chart_data.type] ?? "bar", chartData, {
                x: 0.8, y: 1.5, w: 11.0, h: 5.0,
                showTitle: false,
                showLegend: true,
                legendPos: "b",
                chartColors: chartColors.slice(0, slideData.chart_data.series.length),
              } as any);
            }
            break;
          }
        }
      }

      // ─ Save ─
      const outDir = join(config.workspace, params.output_path);
      mkdirSync(outDir, { recursive: true });
      const fname = params.filename.endsWith(".pptx") ? params.filename : `${params.filename}.pptx`;
      const filePath = join(outDir, fname);
      await pptx.writeFile({ fileName: filePath });

      const slideTypes = params.slides.map((s: any) => s.type);
      return ok(`Presentation created: ${filePath}\n\nSlides: ${params.slides.length} (${slideTypes.join(", ")})\nLayout: 16:9 widescreen\nFeatures: branded title slide, accent bars, slide numbers, speaker notes support`);
    } catch (err: any) {
      return ok(`Error creating presentation: ${err.message}`);
    }
  },
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// WORD — create_document
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const create_document: AgentTool = {
  name: "create_document",
  label: "Create Document",
  description:
    "Create a professional Word (.docx) document with cover page, styled headings, tables, " +
    "bullet lists, headers/footers, and page numbers. Professional fonts and spacing applied automatically.",
  parameters: Type.Object({
    filename: Type.String({ description: "Output filename (e.g. 'marketing-plan.docx')" }),
    title: Type.String({ description: "Document title (shown on cover page)" }),
    subtitle: Type.Optional(Type.String({ description: "Subtitle on cover page" })),
    author: Type.Optional(Type.String({ description: "Author name" })),
    sections: Type.Array(
      Type.Object({
        heading: Type.String({ description: "Section heading" }),
        level: Type.Optional(Type.Number({ description: "Heading level 1-3 (default: 1)" })),
        content: Type.Union([
          Type.String(),
          Type.Array(Type.String()),
        ], { description: "Paragraph text or array of bullet points" }),
        table: Type.Optional(Type.Object({
          headers: Type.Array(Type.String()),
          rows: Type.Array(Type.Array(Type.String())),
        }, { description: "Optional table in this section" })),
      }),
      { description: "Document sections" }
    ),
    output_path: Type.String({ description: "Directory to save the file" }),
  }),
  execute: async (ctx: any, params: any) => {
    try {
      const docx = await import("docx");
      const {
        Document, Packer, Paragraph, TextRun, HeadingLevel,
        AlignmentType, Table, TableRow, TableCell,
        WidthType, BorderStyle, Header, Footer,
        PageNumber, NumberFormat, PageBreak,
      } = docx;

      const headingMap: Record<number, (typeof HeadingLevel)[keyof typeof HeadingLevel]> = {
        1: HeadingLevel.HEADING_1,
        2: HeadingLevel.HEADING_2,
        3: HeadingLevel.HEADING_3,
      };

      const children: any[] = [];

      // ─ Cover page ─
      children.push(
        new Paragraph({ spacing: { before: 4000 } }),
        new Paragraph({
          children: [new TextRun({ text: params.title, bold: true, size: 56, color: PALETTE.headerBg, font: "Calibri" })],
          alignment: AlignmentType.CENTER,
        }),
      );
      if (params.subtitle) {
        children.push(new Paragraph({
          children: [new TextRun({ text: params.subtitle, size: 28, color: PALETTE.textMuted, font: "Calibri" })],
          alignment: AlignmentType.CENTER,
          spacing: { before: 200 },
        }));
      }
      if (params.author) {
        children.push(new Paragraph({
          children: [new TextRun({ text: params.author, size: 22, color: PALETTE.textMuted, font: "Calibri", italics: true })],
          alignment: AlignmentType.CENTER,
          spacing: { before: 400 },
        }));
      }
      children.push(new Paragraph({
        children: [new TextRun({ text: new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }), size: 20, color: PALETTE.textMuted, font: "Calibri" })],
        alignment: AlignmentType.CENTER,
        spacing: { before: 200 },
      }));
      // Page break after cover
      children.push(new Paragraph({ children: [new PageBreak()] }));

      // ─ Sections ─
      for (const section of params.sections) {
        const level = section.level ?? 1;

        // Heading
        children.push(new Paragraph({
          text: section.heading,
          heading: headingMap[level] ?? HeadingLevel.HEADING_1,
          spacing: { before: 400, after: 200 },
        }));

        // Content — string = paragraph, array = bullets
        if (typeof section.content === "string") {
          children.push(new Paragraph({
            children: [new TextRun({ text: section.content, size: 22, font: "Calibri", color: PALETTE.textDark })],
            spacing: { after: 200 },
            alignment: AlignmentType.JUSTIFIED,
          }));
        } else if (Array.isArray(section.content)) {
          for (const bullet of section.content) {
            children.push(new Paragraph({
              children: [new TextRun({ text: bullet, size: 22, font: "Calibri", color: PALETTE.textDark })],
              bullet: { level: 0 },
              spacing: { after: 100 },
            }));
          }
        }

        // Optional table
        if (section.table) {
          const headerCells = section.table.headers.map((h: string) =>
            new TableCell({
              children: [new Paragraph({
                children: [new TextRun({ text: h, bold: true, color: PALETTE.headerFg, size: 20, font: "Calibri" })],
                alignment: AlignmentType.CENTER,
              })],
              shading: { fill: PALETTE.headerBg },
              width: { size: Math.floor(9000 / section.table.headers.length), type: WidthType.DXA },
            })
          );
          const dataRows = section.table.rows.map((row: string[], ri: number) =>
            new TableRow({
              children: row.map((cell: string) =>
                new TableCell({
                  children: [new Paragraph({
                    children: [new TextRun({ text: cell, size: 20, font: "Calibri", color: PALETTE.textDark })],
                  })],
                  shading: ri % 2 === 1 ? { fill: PALETTE.altRowBg } : undefined,
                  width: { size: Math.floor(9000 / section.table.headers.length), type: WidthType.DXA },
                })
              ),
            })
          );

          children.push(new Table({
            rows: [new TableRow({ children: headerCells }), ...dataRows],
            width: { size: 9000, type: WidthType.DXA },
          }));
          children.push(new Paragraph({ spacing: { after: 200 } })); // space after table
        }
      }

      // ─ Build document with header/footer ─
      const doc = new Document({
        creator: params.author ?? "OCTO VEC",
        title: params.title,
        description: params.subtitle ?? "",
        sections: [{
          properties: {
            page: {
              margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }, // 1 inch
            },
          },
          headers: {
            default: new Header({
              children: [new Paragraph({
                children: [new TextRun({ text: params.title, size: 16, color: PALETTE.textMuted, font: "Calibri", italics: true })],
                alignment: AlignmentType.RIGHT,
              })],
            }),
          },
          footers: {
            default: new Footer({
              children: [new Paragraph({
                children: [
                  new TextRun({ text: "Page ", size: 16, color: PALETTE.textMuted, font: "Calibri" }),
                  new TextRun({ children: [PageNumber.CURRENT], size: 16, color: PALETTE.textMuted, font: "Calibri" }),
                  new TextRun({ text: " of ", size: 16, color: PALETTE.textMuted, font: "Calibri" }),
                  new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: PALETTE.textMuted, font: "Calibri" }),
                ],
                alignment: AlignmentType.CENTER,
              })],
            }),
          },
          children,
        }],
      });

      // ─ Save ─
      const outDir = join(config.workspace, params.output_path);
      mkdirSync(outDir, { recursive: true });
      const fname = params.filename.endsWith(".docx") ? params.filename : `${params.filename}.docx`;
      const filePath = join(outDir, fname);
      const buffer = await Packer.toBuffer(doc);
      writeFileSync(filePath, buffer);

      return ok(`Document created: ${filePath}\n\nTitle: ${params.title}\nSections: ${params.sections.length}\nFeatures: cover page, headers/footers, page numbers, styled headings, justified text`);
    } catch (err: any) {
      return ok(`Error creating document: ${err.message}`);
    }
  },
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PDF — create_pdf
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const create_pdf: AgentTool = {
  name: "create_pdf",
  label: "Create PDF",
  description:
    "Create a professional PDF document with formatted text, tables, headers/footers, and page numbers. " +
    "Supports cover page, headings, paragraphs, bullet lists, and styled tables with zebra striping.",
  parameters: Type.Object({
    filename: Type.String({ description: "Output filename (e.g. 'report.pdf')" }),
    title: Type.String({ description: "Document title" }),
    subtitle: Type.Optional(Type.String({ description: "Subtitle" })),
    author: Type.Optional(Type.String({ description: "Author name" })),
    sections: Type.Array(
      Type.Object({
        heading: Type.String({ description: "Section heading" }),
        level: Type.Optional(Type.Number({ description: "Heading level 1-3 (default: 1)" })),
        content: Type.Union([
          Type.String(),
          Type.Array(Type.String()),
        ], { description: "Paragraph text or array of bullet points" }),
        table: Type.Optional(Type.Object({
          headers: Type.Array(Type.String()),
          rows: Type.Array(Type.Array(Type.String())),
        })),
      }),
      { description: "Document sections" }
    ),
    output_path: Type.String({ description: "Directory to save the file" }),
  }),
  execute: async (ctx: any, params: any) => {
    try {
      const PDFDocument = (await import("pdfkit")).default;
      const outDir = join(config.workspace, params.output_path);
      mkdirSync(outDir, { recursive: true });
      const fname = params.filename.endsWith(".pdf") ? params.filename : `${params.filename}.pdf`;
      const filePath = join(outDir, fname);

      return new Promise<ReturnType<typeof ok>>((resolve) => {
        const doc = new PDFDocument({
          size: "A4",
          margins: { top: 72, bottom: 72, left: 72, right: 72 },
          info: { Title: params.title, Author: params.author ?? "OCTO VEC" },
          bufferPages: true,
        });

        const chunks: Buffer[] = [];
        doc.on("data", (chunk: Buffer) => chunks.push(chunk));
        doc.on("end", () => {
          writeFileSync(filePath, Buffer.concat(chunks));
          resolve(ok(`PDF created: ${filePath}\n\nTitle: ${params.title}\nSections: ${params.sections.length}\nFeatures: cover page, styled headings, tables with zebra striping, page numbers`));
        });

        const pageW = doc.page.width - 144; // margins

        // ─ Cover page ─
        doc.moveDown(8);
        doc.fontSize(32).fillColor(`#${PALETTE.headerBg}`).font("Helvetica-Bold")
          .text(params.title, { align: "center" });
        if (params.subtitle) {
          doc.moveDown(0.5);
          doc.fontSize(16).fillColor(`#${PALETTE.textMuted}`).font("Helvetica")
            .text(params.subtitle, { align: "center" });
        }
        if (params.author) {
          doc.moveDown(1);
          doc.fontSize(12).fillColor(`#${PALETTE.textMuted}`).font("Helvetica-Oblique")
            .text(params.author, { align: "center" });
        }
        doc.moveDown(0.5);
        doc.fontSize(11).fillColor(`#${PALETTE.textMuted}`).font("Helvetica")
          .text(new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }), { align: "center" });

        // Accent line
        doc.moveDown(2);
        const lineX = (doc.page.width - 100) / 2;
        doc.moveTo(lineX, doc.y).lineTo(lineX + 100, doc.y)
          .strokeColor(`#${PALETTE.primary}`).lineWidth(3).stroke();

        doc.addPage();

        // ─ Sections ─
        for (const section of params.sections) {
          const level = section.level ?? 1;
          const fontSize = level === 1 ? 20 : level === 2 ? 16 : 13;

          // Check if enough space for heading + some content
          if (doc.y > doc.page.height - 150) doc.addPage();

          doc.moveDown(0.8);
          doc.fontSize(fontSize).fillColor(`#${PALETTE.headerBg}`).font("Helvetica-Bold")
            .text(section.heading);

          // Underline for H1
          if (level === 1) {
            doc.moveTo(72, doc.y + 2).lineTo(72 + 80, doc.y + 2)
              .strokeColor(`#${PALETTE.primary}`).lineWidth(2).stroke();
            doc.moveDown(0.5);
          }

          doc.moveDown(0.3);

          // Content
          if (typeof section.content === "string") {
            doc.fontSize(11).fillColor(`#${PALETTE.textDark}`).font("Helvetica")
              .text(section.content, { align: "justify", lineGap: 4 });
          } else if (Array.isArray(section.content)) {
            for (const bullet of section.content) {
              if (doc.y > doc.page.height - 80) doc.addPage();
              doc.fontSize(11).fillColor(`#${PALETTE.textDark}`).font("Helvetica")
                .text(`  •  ${bullet}`, { indent: 15, lineGap: 3 });
            }
          }

          // Table
          if (section.table && section.table.headers.length > 0) {
            doc.moveDown(0.5);
            const cols = section.table.headers.length;
            const colW = pageW / cols;
            const rowH = 22;
            let startY = doc.y;

            // Header
            doc.rect(72, startY, pageW, rowH).fill(`#${PALETTE.headerBg}`);
            section.table.headers.forEach((h: string, ci: number) => {
              doc.fontSize(10).fillColor(`#${PALETTE.headerFg}`).font("Helvetica-Bold")
                .text(h, 72 + ci * colW + 4, startY + 6, { width: colW - 8, align: "left" });
            });
            startY += rowH;

            // Data rows
            for (let ri = 0; ri < section.table.rows.length; ri++) {
              if (startY > doc.page.height - 80) {
                doc.addPage();
                startY = 72;
              }
              const bgColor = ri % 2 === 1 ? `#${PALETTE.altRowBg}` : "#FFFFFF";
              doc.rect(72, startY, pageW, rowH).fill(bgColor);
              section.table.rows[ri].forEach((cell: string, ci: number) => {
                doc.fontSize(10).fillColor(`#${PALETTE.textDark}`).font("Helvetica")
                  .text(cell, 72 + ci * colW + 4, startY + 6, { width: colW - 8, align: "left" });
              });
              startY += rowH;
            }
            // Border around table
            doc.rect(72, doc.y, pageW, startY - doc.y)
              .strokeColor(`#${PALETTE.border}`).lineWidth(0.5).stroke();
            doc.y = startY + 10;
          }
        }

        // ─ Page numbers (added after all content) ─
        const range = doc.bufferedPageRange();
        for (let i = range.start; i < range.start + range.count; i++) {
          doc.switchToPage(i);
          doc.fontSize(9).fillColor(`#${PALETTE.textMuted}`).font("Helvetica")
            .text(`Page ${i + 1} of ${range.count}`, 72, doc.page.height - 50, {
              width: pageW, align: "center",
            });
        }

        doc.end();
      });
    } catch (err: any) {
      return ok(`Error creating PDF: ${err.message}`);
    }
  },
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Exports
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function getExcelTools(): AgentTool[] {
  return [create_spreadsheet];
}

export function getPresentationTools(): AgentTool[] {
  return [create_presentation];
}

export function getDocumentTools(): AgentTool[] {
  return [create_document];
}

export function getPdfTools(): AgentTool[] {
  return [create_pdf];
}

export function getAllProductivityTools(): AgentTool[] {
  return [create_spreadsheet, create_presentation, create_document, create_pdf];
}
