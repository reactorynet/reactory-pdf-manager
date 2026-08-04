import PdfService from '../PdfService';

describe('PdfService', () => {
  let pdfService: PdfService;
  let mockContext: any;

  beforeEach(() => {
    mockContext = {
      log: jest.fn(),
      colors: {
        green: (str: string) => str,
      },
    };
    pdfService = new PdfService({} as any, mockContext);
  });

  test('should instantiate and initialize font config', () => {
    expect(pdfService).toBeDefined();
    const fontConfig = pdfService.getFontConfig();
    expect(fontConfig).toBeDefined();
    expect(fontConfig.defaultFont).toBe('Verdana');
  });

  test('should register additional fonts', () => {
    pdfService.registerFonts({
      Roboto: {
        normal: '/path/to/roboto.ttf',
      },
    });

    const fontConfig = pdfService.getFontConfig();
    expect(fontConfig.descriptors.Roboto).toBeDefined();
    expect(fontConfig.descriptors.Roboto.normal).toBe('/path/to/roboto.ttf');
  });

  test('toMarkdown should format extracted text to Markdown', async () => {
    jest.spyOn(pdfService, 'extractText').mockResolvedValue({
      totalPages: 2,
      metadata: { Title: 'Sample PDF Document' },
      pages: [
        {
          pageNumber: 1,
          text: 'Hello world page 1',
          lines: ['Hello world page 1'],
        },
        {
          pageNumber: 2,
          text: 'Hello world page 2',
          lines: ['Hello world page 2'],
        },
      ],
    });

    const markdown = await pdfService.toMarkdown(Buffer.from('fake pdf'));
    expect(markdown).toContain('# Sample PDF Document');
    expect(markdown).toContain('## Page 1');
    expect(markdown).toContain('Hello world page 1');
    expect(markdown).toContain('## Page 2');
    expect(markdown).toContain('Hello world page 2');
  });
});
