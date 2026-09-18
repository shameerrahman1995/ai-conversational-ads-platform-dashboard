import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { CreativeManifest } from '@acp/shared-types';
import { checkRuntimeProfile } from '@acp/shared-types';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { scopedWhere } from '../../common/tenant/scoped-where';
import {
  analyzeHtml5,
  buildPreviewCsp,
  isAllowedTemplate,
  PREVIEW_SANDBOX,
} from './html5/static-analysis';
import {
  buildCreativeBundle,
  combinedSource,
  type BundleCopy,
} from './html5/bundle-builder';

export interface CompileInput {
  template: string;
  html: string;
  network: string;
}

export interface CompileBundleInput {
  template: string;
  network: string;
  manifest: CreativeManifest;
  copy: BundleCopy;
}

/**
 * Google's uploaded-HTML5 hard limit on the ZIP size (blueprint §3).
 * Google Ads uploaded-HTML5 display limit is 150KB; DV360/Studio allows more —
 * this code targets the Google Ads API HTML5_UPLOAD_AD path.
 */
const GOOGLE_MAX_ZIP_BYTES = 150_000;

/**
 * The compiler runs ahead of any publish plan, so it has no target connector's
 * capability facts. Interactive HTML5 templates target the live conversational
 * runtime; check it against the local-preview baseline (a fully-capable host) so
 * the `capabilityCheck` shape is always present on the compile result. The real,
 * per-destination check happens at the deploy gate against connector capabilities.
 */
const LOCAL_PREVIEW_CAPS = { supportsHtml5: true, supportsNativeLeadForms: true } as const;

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
    const capabilityCheck = checkRuntimeProfile('live-conversation', LOCAL_PREVIEW_CAPS);
    await this.audit.record({
      orgId,
      action: 'creative.html5_compiled',
      target: variantId,
      metadata: { status, issues: analysis.issues.length, runtimeProfile: capabilityCheck.resolved },
    });
    return { status, ...analysis, csp: buildPreviewCsp(), sandbox: PREVIEW_SANDBOX, capabilityCheck };
  }

  /**
   * Compile a REAL HTML5 ad ZIP (blueprint §3): builds a thin, secret-free
   * creative from the manifest, runs the same static-analysis gate over the
   * generated source, enforces the Google ZIP-size limit, and returns the ZIP
   * bytes (base64) + file list + size + validation. On success it persists the
   * base64 ZIP + bundle metadata on the variant so the publish flow can later
   * hand the bytes to the Google adapter.
   */
  async compileBundle(orgId: string, variantId: string, input: CompileBundleInput) {
    if (!isAllowedTemplate(input.template)) {
      throw new BadRequestException(`Template not in allowlist: ${input.template}`);
    }
    const variant = await this.prisma.creativeVariant.findFirst({
      where: scopedWhere(orgId, { id: variantId }),
    });
    if (!variant) throw new NotFoundException('Variant not found');

    const bundle = await buildCreativeBundle({ manifest: input.manifest, copy: input.copy });

    // Same static-analysis gate as inline compile, run over the generated source.
    // For the real uploaded-HTML5 deliverable we additionally require the
    // Google-mandated clickTag and the <meta name="ad.size"> tag (guards the
    // generated template from regressing on either).
    const analysis = analyzeHtml5(combinedSource(bundle.files), {
      network: input.network,
      requireClickTag: true,
      requireAdSize: true,
    });
    const issues = [...analysis.issues];
    // Enforce the real deliverable (ZIP) size, not just the source size.
    if (bundle.zipBytes > GOOGLE_MAX_ZIP_BYTES) {
      issues.push({
        code: 'oversize',
        message: `zip ${bundle.zipBytes} exceeds ${GOOGLE_MAX_ZIP_BYTES} bytes`,
      });
    }
    // Google's HTML5_UPLOAD_AD requires index.html at the ZIP root. The analyzer
    // only sees combined source, so assert the root-index at the compiler level
    // where the file list is available.
    if (!bundle.files['index.html']) {
      issues.push({
        code: 'missing_root_index',
        message: 'index.html must be present at the ZIP root',
      });
    }
    const ok = issues.length === 0;
    const status = ok ? 'compiled' : 'validation_failed';
    const zipBase64 = ok ? bundle.zip.toString('base64') : null;

    const manifest = {
      html5: {
        network: input.network,
        template: input.template,
        csp: buildPreviewCsp(),
        sandbox: PREVIEW_SANDBOX,
        sizeBytes: analysis.sizeBytes,
        issues,
      },
      html5Bundle: {
        creativeId: input.manifest.creativeId,
        mode: input.manifest.mode,
        size: input.manifest.size,
        edgeApiBase: input.manifest.edgeApiBase,
        files: bundle.fileList,
        zipBytes: bundle.zipBytes,
        status,
        // Persisted so the publish flow can hand the real bytes to the adapter.
        zipBase64,
      },
    };
    await this.prisma.creativeVariant.update({
      where: { id: variantId, orgId },
      data: { manifest: manifest as never, status },
    });
    const capabilityCheck = checkRuntimeProfile('live-conversation', LOCAL_PREVIEW_CAPS);
    await this.audit.record({
      orgId,
      action: 'creative.html5_bundle_compiled',
      target: variantId,
      metadata: {
        status,
        zipBytes: bundle.zipBytes,
        issues: issues.length,
        runtimeProfile: capabilityCheck.resolved,
      },
    });

    return {
      status,
      ok,
      files: bundle.fileList,
      zipBytes: bundle.zipBytes,
      zipBase64,
      validation: { ok, issues, sizeBytes: analysis.sizeBytes },
      csp: buildPreviewCsp(),
      sandbox: PREVIEW_SANDBOX,
      capabilityCheck,
    };
  }

  previewPolicy() {
    return { csp: buildPreviewCsp(), sandbox: PREVIEW_SANDBOX };
  }
}
