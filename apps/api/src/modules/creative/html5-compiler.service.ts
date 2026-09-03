import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { scopedWhere } from '../../common/tenant/scoped-where';
import {
  analyzeHtml5,
  buildPreviewCsp,
  isAllowedTemplate,
  PREVIEW_SANDBOX,
} from './html5/static-analysis';

export interface CompileInput {
  template: string;
  html: string;
  network: string;
}

/**
 * HTML5 / playable compiler (blueprint §14/§17): allowlisted templates + static
 * analysis + per-network rules; on success stores a CSP + sandbox manifest on the
 * variant so it can only render in an isolated, locked-down iframe. Org-scoped + audited.
 */
@Injectable()
export class Html5CompilerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async compile(orgId: string, variantId: string, input: CompileInput) {
    if (!isAllowedTemplate(input.template)) {
      throw new BadRequestException(`Template not in allowlist: ${input.template}`);
    }
    const variant = await this.prisma.creativeVariant.findFirst({
      where: scopedWhere(orgId, { id: variantId }),
    });
    if (!variant) throw new NotFoundException('Variant not found');

    const analysis = analyzeHtml5(input.html, { network: input.network });
    const status = analysis.ok ? 'compiled' : 'validation_failed';
    const manifest = {
      html5: {
        network: input.network,
        template: input.template,
        csp: buildPreviewCsp(),
        sandbox: PREVIEW_SANDBOX,
        sizeBytes: analysis.sizeBytes,
        issues: analysis.issues,
      },
    };
    await this.prisma.creativeVariant.update({
      where: { id: variantId, orgId },
      data: { manifest: manifest as never, status },
    });
    await this.audit.record({
      orgId,
      action: 'creative.html5_compiled',
      target: variantId,
      metadata: { status, issues: analysis.issues.length },
    });
    return { status, ...analysis, csp: buildPreviewCsp(), sandbox: PREVIEW_SANDBOX };
  }

  previewPolicy() {
    return { csp: buildPreviewCsp(), sandbox: PREVIEW_SANDBOX };
  }
}
