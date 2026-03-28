import Reactory from '@reactorynet/reactory-core';
import modules from '@reactory/server-core/modules';
import { readFileSync, existsSync } from 'fs';
import { PNG } from 'pngjs';
import imageType from 'image-type';
//@ts-ignore
import PdfPrinter from 'pdfmake/src/printer';

const {
  APP_SYSTEM_FONTS,
  APP_DATA_ROOT,
} = process.env;

/**
 * Default font configuration used when no fonts.json config file is found.
 * Maps font names to their actual font files on disk.
 */
const DEFAULT_FONT_DESCRIPTORS: Reactory.Pdf.IFontDescriptors = {
  Verdana: {
    normal: `${APP_DATA_ROOT}/fonts/verdana.ttf`,
    bold: `${APP_DATA_ROOT}/fonts/verdanab.ttf`,
    italics: `${APP_DATA_ROOT}/fonts/verdanai.ttf`,
    bolditalics: `${APP_DATA_ROOT}/fonts/verdanaz.ttf`,
  },
  Candara: {
    normal: `${APP_SYSTEM_FONTS}/Candara.ttf`,
    bold: `${APP_SYSTEM_FONTS}/Candarab.ttf`,
    italics: `${APP_SYSTEM_FONTS}/Candarai.ttf`,
    bolditalics: `${APP_SYSTEM_FONTS}/Candaraz.ttf`,
  },
};

class PdfService implements Reactory.Service.IReactoryPdfService {

  name: string;
  nameSpace: string;
  version: string;

  context: Reactory.Server.IReactoryContext;
  props: Reactory.Service.IReactoryServiceProps;

  private fontConfig: Reactory.Pdf.IFontConfig;
  private components: Reactory.Pdf.IReactoryPdfComponent[] = [];

  constructor(props: Reactory.Service.IReactoryServiceProps, context: Reactory.Server.IReactoryContext) {
    this.props = props;
    this.context = context;
    this.fontConfig = {
      descriptors: { ...DEFAULT_FONT_DESCRIPTORS },
      defaultFont: 'Verdana',
      defaultFontSize: 12,
    };
  }

  // ─── Font Management ─────────────────────────────────────────────────

  /**
   * Loads font configuration from an optional fonts.json file.
   * Falls back to default font descriptors if the config file doesn't exist.
   */
  private loadFontConfig(): void {
    const configPath = `${APP_DATA_ROOT}/config/fonts.json`;

    if (existsSync(configPath)) {
      try {
        const raw = readFileSync(configPath, 'utf8');
        const config = JSON.parse(raw);

        // Resolve environment variable references in font paths
        const resolvedDescriptors: Reactory.Pdf.IFontDescriptors = {};
        const basePaths = config.basePaths || {};

        for (const [fontName, descriptor] of Object.entries(config.fonts || {})) {
          const desc = descriptor as Reactory.Pdf.IFontDescriptor;
          resolvedDescriptors[fontName] = {
            normal: this.resolvePathVars(desc.normal, basePaths),
            bold: desc.bold ? this.resolvePathVars(desc.bold, basePaths) : undefined,
            italics: desc.italics ? this.resolvePathVars(desc.italics, basePaths) : undefined,
            bolditalics: desc.bolditalics ? this.resolvePathVars(desc.bolditalics, basePaths) : undefined,
          };
        }

        this.fontConfig = {
          descriptors: resolvedDescriptors,
          defaultFont: config.defaultFont || 'Verdana',
          defaultFontSize: config.defaultFontSize || 12,
        };

        this.context.log(`PdfService: Loaded font config from ${configPath}`);
      } catch (err) {
        this.context.log(`PdfService: Failed to load fonts.json, using defaults: ${err.message}`, 'warn');
      }
    }

    // Validate that font files exist
    for (const [fontName, desc] of Object.entries(this.fontConfig.descriptors)) {
      for (const [variant, filePath] of Object.entries(desc)) {
        if (filePath && !existsSync(filePath)) {
          this.context.log(`PdfService: Font file missing - ${fontName}.${variant}: ${filePath}`, 'warn');
        }
      }
    }
  }

  /**
   * Resolves ${variable} references in font paths using basePaths and environment variables.
   */
  private resolvePathVars(path: string, basePaths: Record<string, string>): string {
    return path.replace(/\$\{(\w+)\}/g, (_, varName) => {
      if (basePaths[varName]) return basePaths[varName];
      if (process.env[varName]) return process.env[varName];
      return `\${${varName}}`;
    });
  }

  getFontConfig(): Reactory.Pdf.IFontConfig {
    return { ...this.fontConfig };
  }

  registerFonts(fonts: Reactory.Pdf.IFontDescriptors): void {
    this.fontConfig.descriptors = {
      ...this.fontConfig.descriptors,
      ...fonts,
    };
    this.context.log(`PdfService: Registered ${Object.keys(fonts).length} additional font families`);
  }

  // ─── Component Registry ──────────────────────────────────────────────

  private collectComponents(): void {
    this.components = [];
    modules.enabled.forEach((mod: Reactory.Server.IReactoryModule) => {
      if (mod.pdfs && mod.pdfs.length > 0) {
        this.context.log(`PdfService: Registering ${mod.pdfs.length} PDF components from ${mod.name}`);
        this.components.push(...mod.pdfs);
      }
    });
  }

  getRegisteredComponents(): Reactory.Pdf.IReactoryPdfComponent[] {
    return [...this.components];
  }

  getComponent(nameSpace: string, name: string, version?: string): Reactory.Pdf.IReactoryPdfComponent | null {
    return this.components.find(c =>
      c.nameSpace === nameSpace &&
      c.name === name &&
      (!version || c.version === version)
    ) || null;
  }

  // ─── PNG Utility ─────────────────────────────────────────────────────

  /**
   * Converts interlaced PNGs to non-interlaced for pdfmake compatibility.
   */
  private fixPngInterlace(filePath: string): Buffer | string {
    let buffer = readFileSync(filePath);
    const type = imageType(buffer);
    if (type && type.mime === 'image/png') {
      const png = PNG.sync.read(buffer);
      if (png.interlace) {
        buffer = PNG.sync.write(png, { interlace: false });
      }
      return buffer;
    }
    return filePath;
  }

  // ─── Generation ──────────────────────────────────────────────────────

  /**
   * Creates a pdfmake printer instance with the current font configuration.
   */
  private createPrinter(): InstanceType<typeof PdfPrinter> {
    return new PdfPrinter(this.fontConfig.descriptors);
  }

  async generateToBuffer(definition: Reactory.Pdf.IPDFDocumentDefinition): Promise<Buffer> {
    this.context.log('PdfService: Generating PDF to buffer');
    const printer = this.createPrinter();
    const tableLayouts = definition.tableLayouts || {};
    const doc = printer.createPdfKitDocument(definition, { tableLayouts });

    return new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (err: Error) => reject(err));
      doc.end();
    });
  }

  async generateToStream(definition: Reactory.Pdf.IPDFDocumentDefinition, stream: NodeJS.WritableStream): Promise<void> {
    this.context.log('PdfService: Generating PDF to stream');
    const printer = this.createPrinter();
    const tableLayouts = definition.tableLayouts || {};
    const doc = printer.createPdfKitDocument(definition, { tableLayouts });

    return new Promise<void>((resolve, reject) => {
      stream.on('close', () => resolve());
      stream.on('finish', () => resolve());
      stream.on('error', (err: Error) => reject(err));
      doc.on('error', (err: Error) => reject(err));
      doc.pipe(stream);
      doc.end();
    });
  }

  async generateToResponse(definition: Reactory.Pdf.IPDFDocumentDefinition): Promise<void> {
    this.context.log('PdfService: Generating PDF to HTTP response');
    const printer = this.createPrinter();
    const tableLayouts = definition.tableLayouts || {};
    const doc = printer.createPdfKitDocument(definition, { tableLayouts });

    const filename = definition.filename || 'document.pdf';
    const view = this.context.$request?.query?.view || 'attachment';

    this.context.$response.set({
      'Content-Disposition': `${view}; filename="${filename}"`,
      'Content-Type': 'application/pdf',
    });

    doc.pipe(this.context.$response);
    doc.end();
  }

  async generate(definition: Reactory.Pdf.IPDFDocumentDefinition, stream?: NodeJS.WritableStream): Promise<Buffer | void> {
    if (stream) {
      return this.generateToStream(definition, stream);
    }

    // If no stream provided and we have a response, pipe to response
    if (this.context.$response) {
      return this.generateToResponse(definition);
    }

    // Otherwise return buffer
    return this.generateToBuffer(definition);
  }

  // ─── Extraction ──────────────────────────────────────────────────────

  /**
   * Extracts structured text from a PDF using pdf2json.
   */
  async extractText(source: Buffer | string): Promise<Reactory.Pdf.IPDFExtractedText> {
    const PDFParser = await import('pdf2json');
    const parser = new PDFParser.default();

    const buffer = typeof source === 'string' ? readFileSync(source) : source;

    return new Promise((resolve, reject) => {
      parser.on('pdfParser_dataError', (errData: any) => {
        reject(new Error(`PDF parsing error: ${errData.parserError}`));
      });

      parser.on('pdfParser_dataReady', (pdfData: any) => {
        const pages: Reactory.Pdf.IPDFExtractedPage[] = (pdfData.Pages || []).map(
          (page: any, idx: number) => {
            const texts = (page.Texts || []).map((t: any) =>
              (t.R || []).map((r: any) => decodeURIComponent(r.T)).join('')
            );
            const fullText = texts.join(' ');
            return {
              pageNumber: idx + 1,
              text: fullText,
              lines: texts,
            };
          }
        );

        const metadata: Record<string, string> = {};
        if (pdfData.Meta) {
          for (const [key, value] of Object.entries(pdfData.Meta)) {
            if (typeof value === 'string') metadata[key] = value;
          }
        }

        resolve({
          pages,
          metadata,
          totalPages: pages.length,
        });
      });

      parser.parseBuffer(buffer);
    });
  }

  /**
   * Extracts layout-aware page data from a PDF using pdf2json.
   */
  async extractPages(source: Buffer | string): Promise<Reactory.Pdf.IPDFExtractedPageLayout[]> {
    const PDFParser = await import('pdf2json');
    const parser = new PDFParser.default();

    const buffer = typeof source === 'string' ? readFileSync(source) : source;

    return new Promise((resolve, reject) => {
      parser.on('pdfParser_dataError', (errData: any) => {
        reject(new Error(`PDF parsing error: ${errData.parserError}`));
      });

      parser.on('pdfParser_dataReady', (pdfData: any) => {
        const pages: Reactory.Pdf.IPDFExtractedPageLayout[] = (pdfData.Pages || []).map(
          (page: any, idx: number) => {
            const elements: Reactory.Pdf.IPDFExtractedElement[] = (page.Texts || []).map(
              (t: any) => ({
                type: 'text' as const,
                content: (t.R || []).map((r: any) => decodeURIComponent(r.T)).join(''),
                x: t.x || 0,
                y: t.y || 0,
                width: t.w || 0,
                height: (t.R?.[0]?.TS?.[1] || 12) / 72, // font size to inches
              })
            );

            // Extract form fields if present
            if (page.Fields) {
              page.Fields.forEach((field: any) => {
                elements.push({
                  type: 'form-field',
                  content: field.V || field.id || '',
                  x: field.x || 0,
                  y: field.y || 0,
                  width: field.w || 0,
                  height: field.h || 0,
                });
              });
            }

            const texts = (page.Texts || []).map((t: any) =>
              (t.R || []).map((r: any) => decodeURIComponent(r.T)).join('')
            );

            return {
              pageNumber: idx + 1,
              width: page.Width || pdfData.Width || 0,
              height: page.Height || pdfData.Height || 0,
              text: texts.join(' '),
              elements,
            };
          }
        );

        resolve(pages);
      });

      parser.parseBuffer(buffer);
    });
  }

  /**
   * Extracts images from a PDF using pdf-parse.
   */
  async extractImages(source: Buffer | string): Promise<Reactory.Pdf.IPDFExtractedImage[]> {
    const pdfParse = await import('pdf-parse');
    const buffer = typeof source === 'string' ? readFileSync(source) : source;

    // pdf-parse provides basic metadata; image extraction requires
    // accessing the underlying pdfjs document
    const data = await pdfParse.default(buffer);
    const images: Reactory.Pdf.IPDFExtractedImage[] = [];

    // Note: Full image extraction from PDFs requires deeper integration
    // with pdf.js operators. This provides the framework -- actual
    // image extraction logic may need enhancement based on PDF structure.
    this.context.log(`PdfService: PDF has ${data.numpages} pages, text length: ${data.text.length}`);

    return images;
  }

  // ─── Manipulation ────────────────────────────────────────────────────

  /**
   * Merges multiple PDF documents into a single PDF.
   */
  async merge(options: Reactory.Pdf.IPDFMergeOptions): Promise<Buffer> {
    const { PDFDocument } = await import('pdf-lib');
    const mergedPdf = await PDFDocument.create();

    for (const source of options.sources) {
      const sourceBuffer = typeof source === 'string' ? readFileSync(source) : source;
      const sourcePdf = await PDFDocument.load(sourceBuffer);
      const pages = await mergedPdf.copyPages(sourcePdf, sourcePdf.getPageIndices());
      pages.forEach(page => mergedPdf.addPage(page));
    }

    const resultBytes = await mergedPdf.save();
    const resultBuffer = Buffer.from(resultBytes);

    if (options.outputPath) {
      const { writeFileSync } = await import('fs');
      writeFileSync(options.outputPath, resultBuffer);
    }

    return resultBuffer;
  }

  /**
   * Splits a PDF into multiple parts based on page ranges.
   */
  async split(options: Reactory.Pdf.IPDFSplitOptions): Promise<Buffer[]> {
    const { PDFDocument } = await import('pdf-lib');
    const sourceBuffer = typeof options.source === 'string' ? readFileSync(options.source) : options.source;
    const sourcePdf = await PDFDocument.load(sourceBuffer);
    const results: Buffer[] = [];

    for (const [start, end] of options.ranges) {
      const newPdf = await PDFDocument.create();
      // Ranges are 1-indexed inclusive, convert to 0-indexed
      const pageIndices = Array.from(
        { length: end - start + 1 },
        (_, i) => start - 1 + i
      ).filter(i => i >= 0 && i < sourcePdf.getPageCount());

      const pages = await newPdf.copyPages(sourcePdf, pageIndices);
      pages.forEach(page => newPdf.addPage(page));

      const bytes = await newPdf.save();
      results.push(Buffer.from(bytes));
    }

    if (options.outputDir) {
      const { writeFileSync, mkdirSync } = await import('fs');
      const path = await import('path');
      mkdirSync(options.outputDir, { recursive: true });
      results.forEach((buf, i) => {
        const [start, end] = options.ranges[i];
        writeFileSync(path.join(options.outputDir, `pages_${start}-${end}.pdf`), buf);
      });
    }

    return results;
  }

  // ─── Lifecycle ───────────────────────────────────────────────────────

  async onStartup(): Promise<void> {
    this.loadFontConfig();
    this.collectComponents();

    const fontCount = Object.keys(this.fontConfig.descriptors).length;
    this.context.log(
      `PdfService ${this.context.colors.green('STARTUP OKAY')} - ${fontCount} font families, ${this.components.length} PDF components registered`
    );
  }

  getExecutionContext(): Reactory.Server.IReactoryContext {
    return this.context;
  }

  setExecutionContext(context: Reactory.Server.IReactoryContext): boolean {
    this.context = context;
    return true;
  }

  static reactory: Reactory.Service.IReactoryServiceDefinition<PdfService> = {
    id: 'pdf-manager.PdfService@1.0.0',
    nameSpace: 'pdf-manager',
    name: 'PdfService',
    version: '1.0.0',
    serviceType: 'pdf',
    description: 'PDF generation, extraction, and manipulation service using pdfmake, pdf-lib, pdf2json, and pdf-parse',
    service: (props: Reactory.Service.IReactoryServiceProps, context: Reactory.Server.IReactoryContext): PdfService => {
      return new PdfService(props, context);
    },
    dependencies: [],
  };
}

export const PdfServiceDefinition = PdfService.reactory;
export default PdfService;
