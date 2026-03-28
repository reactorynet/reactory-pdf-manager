import Reactory from '@reactorynet/reactory-core';
import { roles } from '@reactory/server-core/authentication/decorators';
import { resolver, query, mutation } from '@reactory/server-core/models/graphql/decorators/resolver';

const getPdfService = (ctx: Reactory.Server.IReactoryContext): Reactory.Service.IReactoryPdfService =>
  ctx.getService('pdf-manager.PdfService@1.0.0') as Reactory.Service.IReactoryPdfService;

@resolver
class PdfResolver {
  resolver: any;

  // ===== QUERIES =====================================================

  @roles(['USER'], 'args.context')
  @query('ReactoryPdfComponents')
  async listComponents(_: any, _args: any, ctx: Reactory.Server.IReactoryContext) {
    const pdfService = getPdfService(ctx);
    return pdfService.getRegisteredComponents().map(c => ({
      nameSpace: c.nameSpace,
      name: c.name,
      version: c.version,
      key: c.component.key,
      description: c.component.description,
      enabled: c.component.enabled,
    }));
  }

  @roles(['USER'], 'args.context')
  @query('ReactoryPdfComponent')
  async getComponent(
    _: any,
    { nameSpace, name, version }: { nameSpace: string; name: string; version?: string },
    ctx: Reactory.Server.IReactoryContext
  ) {
    const pdfService = getPdfService(ctx);
    const component = pdfService.getComponent(nameSpace, name, version);
    if (!component) return null;
    return {
      nameSpace: component.nameSpace,
      name: component.name,
      version: component.version,
      key: component.component.key,
      description: component.component.description,
      enabled: component.component.enabled,
    };
  }

  @roles(['USER'], 'args.context')
  @query('ReactoryPdfExtractText')
  async extractText(_: any, { input }: any, ctx: Reactory.Server.IReactoryContext) {
    const pdfService = getPdfService(ctx);
    const buffer = Buffer.from(input.content, 'base64');
    return pdfService.extractText(buffer);
  }

  @roles(['USER'], 'args.context')
  @query('ReactoryPdfExtractPages')
  async extractPages(_: any, { input }: any, ctx: Reactory.Server.IReactoryContext) {
    const pdfService = getPdfService(ctx);
    const buffer = Buffer.from(input.content, 'base64');
    return pdfService.extractPages(buffer);
  }

  // ===== MUTATIONS ===================================================

  @roles(['USER'], 'args.context')
  @mutation('ReactoryPdfGenerateFromComponent')
  async generateFromComponent(_: any, { input }: any, ctx: Reactory.Server.IReactoryContext) {
    const pdfService = getPdfService(ctx);
    const component = pdfService.getComponent(input.nameSpace, input.name, input.version);

    if (!component) {
      return {
        success: false,
        error: `PDF component ${input.nameSpace}.${input.name}${input.version ? `@${input.version}` : ''} not found`,
      };
    }

    try {
      // Resolve data if resolver exists
      let data = input.params;
      if (component.component.resolver) {
        data = await component.component.resolver(input.params, ctx);
      }

      // Generate document definition
      const definition = await component.component.content(data, ctx);
      if (input.filename) definition.filename = input.filename;

      // Generate PDF buffer
      const buffer = await pdfService.generateToBuffer(definition);

      const result: any = {
        success: true,
        filename: definition.filename || 'document.pdf',
      };

      if (input.returnContent) {
        result.content = buffer.toString('base64');
      }

      return result;
    } catch (err) {
      return {
        success: false,
        error: err.message,
      };
    }
  }

  @roles(['USER'], 'args.context')
  @mutation('ReactoryPdfGenerateFromDefinition')
  async generateFromDefinition(_: any, { input }: any, ctx: Reactory.Server.IReactoryContext) {
    const pdfService = getPdfService(ctx);

    try {
      const definition = input.definition as Reactory.Pdf.IPDFDocumentDefinition;
      if (input.filename) definition.filename = input.filename;

      const buffer = await pdfService.generateToBuffer(definition);

      const result: any = {
        success: true,
        filename: definition.filename || 'document.pdf',
      };

      if (input.returnContent) {
        result.content = buffer.toString('base64');
      }

      return result;
    } catch (err) {
      return {
        success: false,
        error: err.message,
      };
    }
  }

  @roles(['USER'], 'args.context')
  @mutation('ReactoryPdfMerge')
  async mergePdfs(_: any, { input }: any, ctx: Reactory.Server.IReactoryContext) {
    const pdfService = getPdfService(ctx);

    try {
      const sources = (input.sources as string[]).map(s => Buffer.from(s, 'base64'));
      const buffer = await pdfService.merge({ sources });

      const result: any = {
        success: true,
        filename: input.filename || 'merged.pdf',
      };

      if (input.returnContent) {
        result.content = buffer.toString('base64');
      }

      return result;
    } catch (err) {
      return {
        success: false,
        error: err.message,
      };
    }
  }

  @roles(['USER'], 'args.context')
  @mutation('ReactoryPdfSplit')
  async splitPdf(_: any, { input }: any, ctx: Reactory.Server.IReactoryContext) {
    const pdfService = getPdfService(ctx);

    try {
      const source = Buffer.from(input.content, 'base64');
      const ranges = input.ranges as [number, number][];
      const buffers = await pdfService.split({ source, ranges });

      const parts = buffers.map((buf, i) => {
        const [start, end] = ranges[i];
        const part: any = {
          success: true,
          filename: `pages_${start}-${end}.pdf`,
        };
        if (input.returnContent) {
          part.content = buf.toString('base64');
        }
        return part;
      });

      return { success: true, parts };
    } catch (err) {
      return {
        success: false,
        error: err.message,
        parts: [],
      };
    }
  }
}

export default PdfResolver;
